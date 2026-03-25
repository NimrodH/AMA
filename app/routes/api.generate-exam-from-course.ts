import type { Route } from "./+types/api.generate-exam-from-course";
import { getOpenAIClient } from "~/lib/openai.server";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service.server";
import { saveExam } from "~/services/exams.service";
import { extractTextFromUrl } from "~/lib/file-extract.server";

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
- החזר JSON בלבד ללא שום טקסט נוסף, ללא Markdown, ללא הסברים

פורמט JSON נדרש (החזר אך ורק את ה-JSON הזה):
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

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { courseId } = (await request.json()) as { courseId: string };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  // ── 1. Verify sources exist ──────────────────────────────────────────────
  const [pastExams, lectures] = await Promise.all([
    getSourcesByCourse(student.id, courseId, "Past exam", request),
    getSourcesByCourse(student.id, courseId, "Lecture", request),
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

  // ── 2. Download and extract text from all source files ──────────────────
  const pastExamTexts: string[] = [];
  for (const exam of pastExams) {
    if (!exam.file_url) continue;
    const text = await extractTextFromUrl(exam.file_url);
    if (text) {
      pastExamTexts.push(`=== מבחן עבר: ${exam.topic} ===\n${text}`);
    }
  }

  const lectureTexts: string[] = [];
  for (const lecture of lectures) {
    if (!lecture.file_url) continue;
    const label = lecture.lecture_number
      ? `הרצאה ${lecture.lecture_number} — ${lecture.topic}`
      : `${lecture.topic}`;
    const text = await extractTextFromUrl(lecture.file_url);
    if (text) {
      lectureTexts.push(`=== ${label} ===\n${text}`);
    }
  }

  if (pastExamTexts.length === 0) {
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט ממבחני העבר. ודא שהקבצים תקינים ונסה שוב." },
      { status: 422 }
    );
  }

  if (lectureTexts.length === 0) {
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט מקבצי ההרצאות. ודא שהקבצים תקינים ונסה שוב." },
      { status: 422 }
    );
  }

  const fullPastExamContent = pastExamTexts.join("\n\n");
  const fullLectureContent = lectureTexts.join("\n\n");

  console.log(
    `[generate-exam-from-course] Extracted ${pastExamTexts.length} past exams (${fullPastExamContent.length} chars) + ${lectureTexts.length} lectures (${fullLectureContent.length} chars)`
  );

  // ── 3. Generate exam using chat.completions with json_object mode ───────
  const client = getOpenAIClient();

  let examData: unknown;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `קורס: ${courseId}

חלק א — מבחני עבר (למד מהם את המבנה בלבד — מספר שאלות, סוגי שאלות, חלוקת נקודות):

${fullPastExamContent}

חלק ב — תוכן הרצאות הקורס (בנה שאלות חדשות מתוכן זה בלבד):

${fullLectureContent}

בנה מבחן אימון חדש לפי ההוראות. השתמש במבחני העבר רק ללמידת המבנה, ובנה שאלות חדשות לחלוטין מתוכן ההרצאות.`,
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
  } catch (err) {
    console.error("[generate-exam-from-course] OpenAI error:", err);
    return Response.json(
      { ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" },
      { status: 502 }
    );
  }

  // ── 4. Save exam to DB (fire-and-forget) ────────────────────────────────
  const examObj = examData as { title?: string };
  saveExam({
    studentId: student.id,
    courseId,
    title: examObj?.title ?? "מבחן אימון",
    examType: "ai",
    examContent: examData as object,
    request,
  }).catch((err) => console.warn("[generate-exam-from-course] save exam failed:", err));

  return Response.json({ ok: true, exam: examData });
}
