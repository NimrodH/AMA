import type { Route } from "./+types/api.generate-mc-exam";
import { courseContentFilter, getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";
import { sanitizeAnswerKey } from "~/lib/exam-answer-key.server";
import { parseModelJson } from "~/lib/model-json.server";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת גישה לחומרי הלימוד של הקורס (הרצאות ומאמרים).
המשימה שלך: לבנות מבחן אמריקאי (multiple choice) המכסה את כלל חומרי הקורס באופן מאוזן.

חוקים:
- כל שאלה חייבת להיות בעברית
- כל שאלה חייבת לכלול בדיוק 4 תשובות אפשריות (options)
- רק תשובה אחת נכונה לכל שאלה
- כסה נושאים מכל ההרצאות והמאמרים שסופקו — אל תתרכז רק במקור אחד
- correct_answer חייב להיות העתק מדויק, תו בתו, של אחת האפשרויות ב-options
- פזר את השאלות באופן שווה על פני כל חומרי הקורס
- השאלות צריכות לבדוק הבנה, לא רק שינון עובדות
- כל שאלה שווה נקודה אחת (points: 1)
- כתוב בעברית בלבד

חשוב מאוד: השתמש בכלי file_search כדי לאחזר את תוכן ההרצאות והמאמרים של הקורס לפני שאתה כותב שאלות. בסס כל שאלה על חומר ספציפי שמצאת בהם.

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.
{
  "title": "שם הקורס — מבחן אמריקאי",
  "instructions": "בחר את התשובה הנכונה לכל שאלה.",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "נוסח השאלה",
      "options": ["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"],
      "correct_answer": "תשובה א",
      "points": 1
    }
  ]
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull the final text content from a Responses API response object. */
function extractOutputText(response: { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.trim()) return part.text.trim();
        }
      }
    }
  }
  return "";
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { courseId, questionCount } = (await request.json()) as {
    courseId: string;
    questionCount: number;
  };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const count = Math.max(5, Math.min(50, questionCount || 10));

  const session = await requireSession(request);
  const student = { id: session.studentId };

  // ── 1. Fetch the content sources (lectures and articles) of this course ──
  const [lectures, articles] = await Promise.all([
    getSourcesByCourse(student.id, courseId, "Lecture", request),
    getSourcesByCourse(student.id, courseId, "Article", request),
  ]);

  if (lectures.length === 0 && articles.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות או מאמרים לקורס זה. העלה חומרי לימוד כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  // ── 2. Collect vector store file IDs ─────────────────────────────────────
  const vectorStoreFileIds = [...lectures, ...articles]
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build the user prompt listing the available sources ───────────────
  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");
  const articleList = articles.map((s) => `• מאמר — ${s.topic}`).join("\n");

  const userPrompt = `קורס: ${courseId}
מספר שאלות נדרש: ${count}

חומרי הלימוד הזמינים (בנה מהם את השאלות):
${[lectureList, articleList].filter(Boolean).join("\n")}

בצע חיפוש רחב בכל ההרצאות והמאמרים באמצעות file_search כדי לאחזר את התוכן, ולאחר מכן בנה מבחן אמריקאי עם ${count} שאלות המכסות את כלל החומר.`;

  // ── 4. Call OpenAI with file_search against the vector store ─────────────
  const client = getOpenAIClient();
  const db = createServerClient(request);
  const vectorStoreId = await getOrCreateVectorStore(db);

  let rawText: string;

  try {
    if (vectorStoreFileIds.length > 0) {
      // Use file_search — identical pattern to generate-exam-from-course
      const response = await client.responses.create({
        model: "gpt-4o",
        text: { format: { type: "json_object" } },
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 20,
            // Lectures and articles only — never past exams or summary cards
            filters: courseContentFilter(student.id, courseId),
          },
        ],
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      rawText = extractOutputText(response);
    } else {
      // No indexed files yet — fall back to topic-list only (edge case)
      console.warn("[generate-mc-exam] No vector store file IDs found, falling back to topic list");
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPrompt}\n\nשים לב: לא נמצאו קבצים מאינדקס. נסה לבנות מבחן בסיסי לפי שמות ההרצאות והמאמרים בלבד.`,
          },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    }
  } catch (err) {
    console.error("[generate-mc-exam] OpenAI error:", err);
    return Response.json(
      { ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" },
      { status: 502 }
    );
  }

  if (!rawText) {
    return Response.json(
      { ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" },
      { status: 500 }
    );
  }

  // ── 5. Parse and return ───────────────────────────────────────────────────
  const examData = parseModelJson(rawText);
  if (examData === undefined) {
    console.error("[generate-mc-exam] Failed to parse JSON:", rawText);
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" },
      { status: 500 }
    );
  }

  // Keep only answer keys that match one of the options exactly
  sanitizeAnswerKey(examData);

  // 		6. Save exam to DB (fire-and-forget)																																
  const examObj = examData as { title?: string };
  saveExam({
    studentId: student.id,
    courseId,
    title: examObj?.title ?? `${courseId} — מבחן אמריקאי`,
    examType: "mc",
    examContent: examData as object,
    request,
  }).catch((err) => console.warn("[generate-mc-exam] save exam failed:", err));

  return Response.json({ ok: true, exam: examData });
}
