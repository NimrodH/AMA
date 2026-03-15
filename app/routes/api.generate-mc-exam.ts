import type { Route } from "./+types/api.generate-mc-exam";
import { getOpenAIClient } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";
import { getSourcesByCourse } from "~/services/sources.service";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת את התוכן המלא של כל הרצאות הקורס.
המשימה שלך: לבנות מבחן אמריקאי (multiple choice) המכסה את כלל הרצאות הקורס באופן מאוזן.

חוקים:
- כל שאלה חייבת להיות בעברית
- כל שאלה חייבת לכלול בדיוק 4 תשובות אפשריות (options)
- רק תשובה אחת נכונה לכל שאלה
- כסה נושאים מכל ההרצאות שסופקו — אל תתרכז רק בהרצאה אחת
- פזר את השאלות באופן שווה על פני כל חומרי הקורס
- השאלות צריכות לבדוק הבנה, לא רק שינון עובדות
- כל שאלה שווה נקודה אחת (points: 1)
 - השאלות צריכות לעסוק בתכנים שהקורס מלמד ולא באופן הלימוד
- כתוב בעברית בלבד

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
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const bareObject = text.match(/\{[\s\S]*\}/);
  if (bareObject) return bareObject[0].trim();
  return text;
}

/**
 * Fetch the full text content of an OpenAI file.
 * Returns null if the content cannot be fetched (non-text, error, etc.)
 */
async function fetchFileContent(client: ReturnType<typeof getOpenAIClient>, fileId: string): Promise<string | null> {
  try {
    const response = await client.files.content(fileId);
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
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

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  // ── 1. Fetch all lecture sources for this course ─────────────────────────
  const db = createServerClient();
  const lectures = await getSourcesByCourse(student.id, courseId, "Lecture");

  if (lectures.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות לקורס זה. העלה הרצאות כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  const client = getOpenAIClient();

  // ── 2. Retrieve FULL content of every lecture file ───────────────────────
  // We fetch directly from the OpenAI Files API so that ALL content is included,
  // not just the chunks that happen to be sampled by file_search.
  const lectureContents: { label: string; content: string }[] = [];

  await Promise.all(
    lectures.map(async (source) => {
      // The vector_store_file_id is actually the file_id of the underlying OpenAI file
      if (!source.vector_store_file_id) return;

      const content = await fetchFileContent(client, source.vector_store_file_id);
      if (content) {
        const label = source.lecture_number
          ? `הרצאה ${source.lecture_number} — ${source.topic}`
          : source.topic;
        lectureContents.push({ label, content });
      }
    })
  );

  // ── 3. Build the user prompt with full lecture content ───────────────────
  let fullContent: string;

  if (lectureContents.length > 0) {
    // Sort by lecture number if available
    lectureContents.sort((a, b) => {
      const numA = parseInt(a.label.match(/הרצאה (\d+)/)?.[1] ?? "999");
      const numB = parseInt(b.label.match(/הרצאה (\d+)/)?.[1] ?? "999");
      return numA - numB;
    });

    fullContent = lectureContents
      .map((l) => `=== ${l.label} ===\n${l.content}`)
      .join("\n\n");
  } else {
    // Fallback: no file content accessible — list topics only and let AI do its best
    fullContent = lectures
      .map((s) => {
        const label = s.lecture_number
          ? `הרצאה ${s.lecture_number} — ${s.topic}`
          : s.topic;
        return `• ${label}`;
      })
      .join("\n");
    console.warn("[generate-mc-exam] Could not fetch file contents, falling back to topic list");
  }

  const userPrompt = `קורס: ${courseId}
מספר שאלות נדרש: ${count}

תוכן הרצאות הקורס:

${fullContent}

בנה מבחן אמריקאי עם ${count} שאלות המכסות את כלל החומר לעיל.`;

  // ── 4. Call GPT-4o ────────────────────────────────────────────────────────
  let rawText: string;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    rawText = response.choices[0]?.message?.content?.trim() ?? "";
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

  return Response.json({ ok: true, exam: examData });
}
