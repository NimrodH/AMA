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

המשימה שלך: לבנות מבחן חדש שמשמר את אותו מבנה בדיוק (אותו מספר שאלות מכל סוג, אותה חלוקת נקודות), אך השאלות עצמן צריכות להיות שונות לחלוטין ולהתבסס אך ורק על תוכן הרצאות הקורס.

חוקים:
- שמור על אותו מספר שאלות אמריקאיות (multiple_choice) כמו במבחן העבר
- שמור על אותו מספר שאלות נכון/לא נכון (true_false) כמו במבחן העבר
- שמור על אותו מספר שאלות פתוחות (open) כמו במבחן העבר
- שמור על אותה חלוקת נקודות (כל שאלה — אותו מספר נקודות כמו במבחן המקביל)
- השאלות עצמן חייבות להיות שונות לחלוטין מהמבחן המקורי
- כל השאלות מבוססות אך ורק על תוכן ההרצאות שסופקו
- כתוב בעברית
- חובה: הפלט חייב להיות אובייקט JSON תקני בלבד — ללא הסברים, ללא הקדמות, ללא סיומות, ללא markdown

החזר את המבחן בפורמט JSON כאשר השאלות מוצגות באופן הבא:
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
 * Returns true if the text looks like a natural-language refusal / empty response
 * rather than a JSON payload we can parse.
 */
function isRefusal(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  // If it starts with a JSON object/array it's likely valid content
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  // Heuristic: short text without a JSON structure is probably a refusal
  return trimmed.length < 200;
}

/** Build a compound filter for the vector store scoped to student + course + source_type. */
function buildFilter(studentId: string, courseId: string, sourceType: string) {
  return {
    type: "and" as const,
    filters: [
      { type: "eq" as const, key: "student_id", value: studentId },
      { type: "eq" as const, key: "course_id", value: courseId },
      { type: "eq" as const, key: "source_type", value: sourceType },
    ],
  };
}

/**
 * Runs a retrieval-only responses.create call to pull grounded text from the
 * vector store without generating a full answer.  Returns the raw output text
 * which contains the retrieved chunks inline.
 */
async function retrieveContent(
  client: ReturnType<typeof getOpenAIClient>,
  vectorStoreId: string,
  studentId: string,
  courseId: string,
  sourceType: string,
  query: string
): Promise<string> {
  const response = await client.responses.create({
    model: "gpt-4o",
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        filters: buildFilter(studentId, courseId, sourceType),
      },
    ],
    input: query,
  });
  return response.output_text?.trim() ?? "";
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

  // ── 2. Check whether files are indexed in the vector store ───────────────
  const pastExamFileIds = pastExams.map((s) => s.vector_store_file_id).filter(Boolean);
  const lectureFileIds = lectures.map((s) => s.vector_store_file_id).filter(Boolean);

  const client = getOpenAIClient();
  const db = createServerClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  let rawText: string;

  if (pastExamFileIds.length > 0 && lectureFileIds.length > 0) {
    // ── 3a. Two-phase retrieval: past exams for STRUCTURE, lectures for CONTENT
    //        Each retrieval is filtered strictly by source_type so there is zero
    //        cross-contamination between the two corpora.
    const pastExamList = pastExams.map((s) => `• ${s.topic}`).join("\n");
    const lectureList = lectures
      .map((s) => (s.lecture_number ? `הרצאה ${s.lecture_number} — ${s.topic}` : `${s.topic} (כלל הקורס)`))
      .map((l) => `• ${l}`)
      .join("\n");

    let pastExamContext = "";
    let lectureContext = "";

    try {
      [pastExamContext, lectureContext] = await Promise.all([
        retrieveContent(
          client,
          vectorStoreId,
          student.id,
          courseId,
          "Past exam",
          `אחזר את כל מבחני העבר של קורס ${courseId}. מבחנים אלה:\n${pastExamList}`
        ),
        retrieveContent(
          client,
          vectorStoreId,
          student.id,
          courseId,
          "Lecture",
          `אחזר את כל תוכן הרצאות קורס ${courseId}. הרצאות:\n${lectureList}`
        ),
      ]);
    } catch (err) {
      console.error("[generate-exam-from-course] Retrieval error:", err);
      return Response.json({ ok: false, error: "שגיאה בשליפת תוכן מהמאגר — נסה שוב" }, { status: 502 });
    }

    // ── 4a. Generate exam using the separately-retrieved contexts ─────────
    // If the retrieval returned a refusal/empty string, fall back to topic names
    const examContextSection = isRefusal(pastExamContext) ? pastExamList : pastExamContext;
    const lectureContextSection = isRefusal(lectureContext) ? lectureList : lectureContext;

    const generationPrompt = `קורס: ${courseId}

=== מבנה מבחני עבר של הקורס (השתמש ONLY לקביעת מבנה: כמות שאלות וניקוד) ===
${examContextSection}

=== תוכן הרצאות הקורס (השתמש ONLY לכתיבת השאלות החדשות) ===
${lectureContextSection}

בנה מבחן אימון חדש לפי ההוראות:
- המבנה (מספר שאלות מכל סוג, ניקוד) חייב להיות זהה למבחני העבר של הקורס
- תוכן כל שאלה חייב להתבסס אך ורק על תוכן ההרצאות
- ענה ב-JSON בלבד`;

    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: generationPrompt },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      console.error("[generate-exam-from-course] Generation error:", err);
      return Response.json({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" }, { status: 502 });
    }
  } else {
    // ── 3b. Fallback: no indexed files — use topic names only ─────────────
    console.warn("[generate-exam-from-course] No vector store file IDs found, using plain chat");

    const pastExamList = pastExams.map((s) => `• ${s.topic}`).join("\n");
    const lectureList = lectures
      .map((s) => (s.lecture_number ? `הרצאה ${s.lecture_number} — ${s.topic}` : `${s.topic} (כלל הקורס)`))
      .map((l) => `• ${l}`)
      .join("\n");

    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `קורס: ${courseId}

מבחני עבר זמינים (למד מהם את מבנה המבחן בלבד):
${pastExamList}

הרצאות הקורס הזמינות:
${lectureList}

שים לב: לא נמצאו קבצים מאינדקס. בנה מבחן בסיסי לפי שמות ההרצאות בלבד. ענה ב-JSON בלבד.`,
          },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      console.error("[generate-exam-from-course] OpenAI error:", err);
      return Response.json({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" }, { status: 502 });
    }
  }

  if (!rawText) {
    return Response.json({ ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" }, { status: 500 });
  }

  // ── 5. Parse and return ───────────────────────────────────────────────────
  const jsonStr = extractJson(rawText);
  let examData: unknown;
  try {
    examData = JSON.parse(jsonStr);
  } catch {
    console.error("[generate-exam-from-course] Failed to parse JSON:", rawText);
    return Response.json({ ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" }, { status: 500 });
  }

  return Response.json({ ok: true, exam: examData });
}
