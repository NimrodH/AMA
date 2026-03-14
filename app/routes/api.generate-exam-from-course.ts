import type { Route } from "./+types/api.generate-exam-from-course";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";
import { getSourcesByCourse } from "~/services/sources.service";

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת:
1. מבנה של מבחן/מבחנים מהעבר (מספר שאלות סגורות, פתוחות, חלוקת נקודות)
2. תוכן הרצאות הקורס

המשימה שלך: לבנות מבחן חדש שמשמר את אותו מבנה בדיוק (אותו מספר שאלות מכל סוג, אותה חלוקת נקודות), אך השאלות עצמן צריכות להיות שונות לחלוטין ולהתבסס אך ורק על תוכן ההרצאות.

שלב 0 — חובה לפני הכל:
בצע חיפוש רחב ומקיף בכל המסמכים באמצעות file_search.
ספור בדיוק כמה שאלות יש בכל מבחן עבר שמצאת — רשום לעצמך את המספר לפני שתתחיל ליצור.
אל תסכם, אל תקצר — קרא את כל השאלות עד הסוף.

חוקים:
- שמור על אותו מספר שאלות אמריקאיות (multiple_choice) כמו במבחן העבר — ספור אותן בדיוק
- שמור על אותו מספר שאלות נכון/לא נכון (true_false) כמו במבחן העבר
- שמור על אותו מספר שאלות פתוחות (open) כמו במבחן העבר
- שמור על אותה חלוקת נקודות (כל שאלה — אותו מספר נקודות כמו במבחן המקביל)
- השאלות עצמן חייבות להיות שונות לחלוטין מהמבחן המקורי
- כל השאלות מבוססות אך ורק על תוכן ההרצאות שסופקו
- כתוב בעברית
- אם במבחן העבר יש 24 שאלות — המבחן החדש יכיל 24 שאלות בדיוק. אם יש 30 — אז 30. אסור לקצץ.

החזר את המבחן בפורמט JSON בדיוק עם המבנה הבא:
{
  "title": "כותרת המבחן (שם הקורס + 'מבחן אימון')",
  "instructions": "הוראות מבחן סטנדרטיות",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "נוסח השאלה",
      "options": ["אופציה א", "אופציה ב", "אופציה ג", "אופציה ד"],
      "points": 10
    },
    {
      "id": 2,
      "type": "true_false",
      "question": "נוסח השאלה",
      "options": ["נכון", "לא נכון"],
      "points": 5
    },
    {
      "id": 3,
      "type": "open",
      "question": "נוסח השאלה",
      "points": 15
    }
  ]
}

החזר JSON בלבד, ללא טקסט נוסף, ללא הערות, ללא ציטוטים.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strips OpenAI file_search citation annotations like 【4:0†source】
 * that get injected into output_text even in JSON mode.
 */
function stripCitations(text: string): string {
  return text.replace(/\u3010[\d:†\w\s]+\u3011/g, "").trim();
}

/**
 * Attempts to extract a valid JSON object string from raw model output.
 * Handles markdown code blocks, leading/trailing prose, and citation markers.
 */
function extractJson(text: string): string {
  // 1. Strip citation annotations first
  const clean = stripCitations(text);

  // 2. Try code block
  const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // 3. Try bare JSON object — find the first { and the matching last }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return clean.slice(start, end + 1).trim();
  }

  return clean;
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { courseId } = (await request.json()) as { courseId: string };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  // ── 1. Verify sources exist ──────────────────────────────────────────────
  const [pastExams, lectures] = await Promise.all([
    getSourcesByCourse(student.id, courseId, "Past exam"),
    getSourcesByCourse(student.id, courseId, "Lecture"),
  ]);

  if (pastExams.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו מבחני עבר לקורס זה. העלה מבחן עבר כדי שה-AI ילמד את מבנה המבחן." },
      { status: 422 }
    );
  }

  if (lectures.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות לקורס זה. העלה הרצאות כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  // ── 2. Collect vector store file IDs for all sources ────────────────────
  const allSources = [...pastExams, ...lectures];
  const vectorStoreFileIds = allSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build the user prompt listing available sources ───────────────────
  const pastExamList = pastExams
    .map((s) => `• ${s.topic}`)
    .join("\n");

  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");

  const userPrompt = `קורס: ${courseId}

מבחני עבר זמינים (למד מהם את מבנה המבחן בלבד — אל תעתיק שאלות):
${pastExamList}

הרצאות הקורס הזמינות (בנה מהן את השאלות החדשות):
${lectureList}

הוראות חובה:
1. בצע file_search כדי לאחזר את תוכן מבחן העבר במלואו — כולל כל השאלות, מהראשונה ועד האחרונה.
2. ספור את מספר השאלות הכולל במבחן העבר (אמריקאיות + נכון/לא נכון + פתוחות).
3. בנה מבחן אימון חדש עם אותו מספר שאלות בדיוק מאותם סוגים, מבוסס על תוכן ההרצאות.
4. אל תקצר את הפלט — ספק את כל השאלות.
5. החזר JSON בלבד — ללא הסברים, ללא ציטוטים, ללא טקסט נוסף.`;

  // ── 4. Call OpenAI with file_search (like card-feedback) ─────────────────
  const client = getOpenAIClient();
  const db = createServerClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  let rawText: string;

  try {
    if (vectorStoreFileIds.length > 0) {
      // Use the vector store — identical pattern to card-feedback.
      // max_num_results=50 ensures we retrieve enough chunks to cover a full
      // 24-question exam (default is ~5 which caused truncation to ~5 questions).
      // text.format json_object forces pure JSON output — no citation annotations
      // get embedded inside the JSON string, which breaks JSON.parse.
      const response = await client.responses.create({
        model: "gpt-4o",
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 50,
            filters: {
              type: "eq" as const,
              key: "student_id",
              value: student.id,
            },
          },
        ],
        text: {
          format: {
            type: "json_object",
          },
        },
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      rawText = response.output_text?.trim() ?? "";
    } else {
      // No vector store files — fall back to chat completion without RAG
      // (should be rare; sources were uploaded but not indexed yet)
      console.warn("[generate-exam-from-course] No vector store file IDs found, using plain chat");
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPrompt}\n\nשים לב: לא נמצאו קבצים מאינדקס. נסה לבנות מבחן בסיסי לפי שמות ההרצאות בלבד.`,
          },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    }
  } catch (err) {
    console.error("[generate-exam-from-course] OpenAI error:", err);
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
    console.error("[generate-exam-from-course] Failed to parse JSON. Raw output:", rawText.slice(0, 500));
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, exam: examData });
}
