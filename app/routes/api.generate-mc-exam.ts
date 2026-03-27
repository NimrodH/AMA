import type { Route } from "./+types/api.generate-mc-exam";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת את התוכן המלא של כל הרצאות הקורס.
המשימה שלך: לבנות מבחן אמריקאי (multiple choice) המכסה את כלל חומרי הקורס באופן מאוזן.

חוקים:
- כל שאלה חייבת להיות בעברית
- כל שאלה חייבת לכלול בדיוק 4 תשובות אפשריות (options)
- רק תשובה אחת נכונה לכל שאלה
- כסה נושאים מכל ההרצאות שסופקו — אל תתרכז רק בהרצאה אחת
- פזר את השאלות באופן שווה על פני כל חומרי הקורס
- השאלות צריכות לבדוק הבנה, לא רק שינון עובדות
- כל שאלה שווה נקודה אחת (points: 1)
- כתוב בעברית בלבד

חשוב מאוד: השתמש בכלי file_search כדי לאחזר את התוכן המלא של הרצאות הקורס לפני שאתה כותב שאלות. בסס כל שאלה על חומר ספציפי שמצאת בהרצאות.

החזר JSON בלבד, ללא טקסט נוסף, עם המבנה הבא:
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

function extractJson(text: string): string {
  // 1. Strip markdown code fences
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  // 2. Find the outermost { ... } to strip any prose prefix/suffix
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1).trim();
  return text;
}

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

  // ── 1. Fetch all lecture sources for this course ─────────────────────────
  const lectures = await getSourcesByCourse(student.id, courseId, "Lecture", request);

  if (lectures.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות לקורס זה. העלה הרצאות כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  // ── 2. Collect vector store file IDs ─────────────────────────────────────
  const vectorStoreFileIds = lectures
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build the user prompt listing available lectures ──────────────────
  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");

  const userPrompt = `קורס: ${courseId}
מספר שאלות נדרש: ${count}

הרצאות הקורס הזמינות (בנה מהן את השאלות):
${lectureList}

בצע חיפוש רחב בכל מסמכי ההרצאות באמצעות file_search כדי לאחזר את התוכן המלא, ולאחר מכן בנה מבחן אמריקאי עם ${count} שאלות המכסות את כלל החומר.`;

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
        response_format: { type: "json_object" },
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 20,
            filters: {
              type: "and" as const,
              filters: [
                { type: "eq" as const, key: "student_id", value: student.id },
                { type: "eq" as const, key: "course_id", value: courseId },
              ],
            },
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPrompt}\n\nשים לב: לא נמצאו קבצים מאינדקס. נסה לבנות מבחן בסיסי לפי שמות ההרצאות בלבד.`,
          },
        ],
        response_format: { type: "json_object" },
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
  const jsonStr = extractJson(rawText);
  let examData: unknown;
  try {
    examData = JSON.parse(jsonStr);
  } catch {
    console.error("[generate-mc-exam] Failed to parse JSON:", rawText);
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" },
      { status: 500 }
    );
  }

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
