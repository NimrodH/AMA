import type { Route } from "./+types/api.generate-mc-exam";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת את התוכן המלא של הרצאות הקורס.
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
- החזר JSON בלבד ללא שום טקסט נוסף, ללא Markdown, ללא הסברים

פורמט JSON נדרש (החזר אך ורק את ה-JSON הזה):
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

/**
 * Extracts retrieved text content from OpenAI Responses API output items.
 * The file_search tool returns `file_search_call` items with results we can use.
 * We also collect any text output items.
 */
function extractRetrievedContent(output: unknown[]): string {
  const parts: string[] = [];

  for (const item of output) {
    const o = item as Record<string, unknown>;

    // Text output items
    if (o.type === "message") {
      const content = o.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "output_text" || block.type === "text") {
            parts.push(String(block.text ?? ""));
          }
        }
      }
    }

    // File search result items — extract the actual text snippets
    if (o.type === "file_search_call") {
      const results = o.results as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(results)) {
        for (const result of results) {
          const content = result.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            for (const chunk of content) {
              if (chunk.text) parts.push(String(chunk.text));
            }
          } else if (result.text) {
            parts.push(String(result.text));
          }
        }
      }
    }
  }

  return parts.join("\n\n");
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

  // ── 3. Build the lecture list for the prompt ─────────────────────────────
  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");

  const client = getOpenAIClient();
  const db = createServerClient(request);

  let examData: unknown;

  try {
    if (vectorStoreFileIds.length > 0) {
      // ── Step A: Retrieve lecture content via file_search ─────────────────
      const vectorStoreId = await getOrCreateVectorStore(db);

      const retrievalResponse = await client.responses.create({
        model: "gpt-4o",
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
                { type: "eq" as const, key: "source_type", value: "Lecture" },
              ],
            },
          },
        ],
        input: `אחזר את התוכן המלא של הרצאות הקורס הבאות: ${lectureList}`,
      });

      // Extract retrieved content from output items
      const retrievedContent = extractRetrievedContent(
        (retrievalResponse.output as unknown[]) ?? []
      );

      const contextText = retrievedContent.trim()
        ? retrievedContent
        : `הרצאות הקורס: ${lectureList}`;

      // ── Step B: Generate exam JSON using chat.completions with json_object ──
      const generationResponse = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `קורס: ${courseId}
מספר שאלות נדרש: ${count}

תוכן הרצאות הקורס שאוחזר:
${contextText}

בנה מבחן אמריקאי עם ${count} שאלות המכסות את כלל החומר שלעיל.`,
          },
        ],
      });

      const rawText = generationResponse.choices[0]?.message?.content?.trim() ?? "";
      if (!rawText) {
        return Response.json(
          { ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" },
          { status: 500 }
        );
      }

      examData = JSON.parse(rawText);
    } else {
      // ── Fallback: No indexed files — use topic list only ─────────────────
      console.warn("[generate-mc-exam] No vector store file IDs found, falling back to topic list");

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `קורס: ${courseId}
מספר שאלות נדרש: ${count}

הרצאות הקורס הזמינות:
${lectureList}

בנה מבחן אמריקאי עם ${count} שאלות לפי שמות ההרצאות.`,
          },
        ],
      });

      const rawText = response.choices[0]?.message?.content?.trim() ?? "";
      if (!rawText) {
        return Response.json(
          { ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" },
          { status: 500 }
        );
      }

      examData = JSON.parse(rawText);
    }
  } catch (err) {
    console.error("[generate-mc-exam] OpenAI error:", err);
    return Response.json(
      { ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" },
      { status: 502 }
    );
  }

  // ── 4. Save exam to DB (fire-and-forget) ─────────────────────────────────
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
