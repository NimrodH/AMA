import type { Route } from "./+types/api.generate-exam-from-course";
import { getOpenAIClient } from "~/lib/openai.server";
import { getStudent } from "~/services/settings.service";
import { getSourcesByCourse } from "~/services/sources.service";
import type { SourceRow } from "~/services/sources.service";

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת:
1. מבנה של מבחן/מבחנים מהעבר (מספר שאלות סגורות, פתוחות, חלוקת נקודות)
2. תוכן הרצאות הקורס

המשימה שלך: לבנות מבחן חדש שמשמר את אותו מבנה בדיוק (אותו מספר שאלות מכל סוג, אותה חלוקת נקודות), אך השאלות עצמן צריכות להיות שונות לחלוטין ולהתבסס אך ורק על תוכן ההרצאות.

חוקים:
- שמור על אותו מספר שאלות אמריקאיות (multiple_choice) כמו במבחן העבר
- שמור על אותו מספר שאלות נכון/לא נכון (true_false) כמו במבחן העבר
- שמור על אותו מספר שאלות פתוחות (open) כמו במבחן העבר
- שמור על אותה חלוקת נקודות (כל שאלה — אותו מספר נקודות כמו במבחן המקביל)
- השאלות עצמן חייבות להיות שונות לחלוטין מהמבחן המקורי
- כל השאלות מבוססות אך ורק על תוכן ההרצאות שסופקו
- כתוב בעברית

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

החזר JSON בלבד, ללא טקסט נוסף.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const bareObject = text.match(/\{[\s\S]*\}/);
  if (bareObject) return bareObject[0].trim();
  return text;
}

/** Get extracted_text from a source row. */
function getExtractedText(source: SourceRow): string | null {
  return source.extracted_text ?? null;
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

  // ── 2. Build content sections from extracted_text stored in DB ───────────
  // Past exams: we need their structure (question types & point values)
  const pastExamSections = pastExams
    .map((s) => {
      const text = getExtractedText(s)?.trim();
      if (text) return `=== מבחן עבר: ${s.topic} ===\n${text}`;
      return `=== מבחן עבר: ${s.topic} ===\n[טקסט לא זמין — למד מהשם בלבד]`;
    })
    .join("\n\n");

  // Lectures: full content for building new questions
  const lectureSections = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : s.topic;
      const text = getExtractedText(s)?.trim();
      if (text) return `=== ${label} ===\n${text}`;
      return `=== ${label} ===\n[טקסט לא זמין — השתמש בנושא בלבד]`;
    })
    .join("\n\n");

  const userPrompt = `קורס: ${courseId}

מבחני עבר (למד מהם את המבנה בלבד — אל תעתיק שאלות):
${pastExamSections}

הרצאות הקורס (בנה מהן את השאלות החדשות):
${lectureSections}

בנה מבחן אימון חדש לפי ההוראות.`;

  // ── 3. Call GPT-4o ────────────────────────────────────────────────────────
  const client = getOpenAIClient();
  let rawText: string;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    rawText = response.choices[0]?.message?.content?.trim() ?? "";
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

  // ── 4. Parse and return ───────────────────────────────────────────────────
  const jsonStr = extractJson(rawText);
  let examData: unknown;
  try {
    examData = JSON.parse(jsonStr);
  } catch {
    console.error("[generate-exam-from-course] Failed to parse JSON:", rawText);
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, exam: examData });
}
