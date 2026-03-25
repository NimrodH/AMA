import type { Route } from "./+types/api.generate-mc-exam";
import { getOpenAIClient } from "~/lib/openai.server";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";
import { extractTextFromUrl } from "~/lib/file-extract.server";

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

  // ── 2. Download and extract text from each lecture file ──────────────────
  const lectureTexts: string[] = [];

  for (const lecture of lectures) {
    if (!lecture.file_url) continue;

    const label = lecture.lecture_number
      ? `הרצאה ${lecture.lecture_number} — ${lecture.topic}`
      : `${lecture.topic}`;

    const text = await extractTextFromUrl(lecture.file_url);
    if (text) {
      lectureTexts.push(`=== ${label} ===\n${text}`);
    } else {
      console.warn(`[generate-mc-exam] Could not extract text from lecture: ${label}`);
    }
  }

  if (lectureTexts.length === 0) {
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט מקבצי ההרצאות. ודא שהקבצים תקינים ונסה שוב." },
      { status: 422 }
    );
  }

  const fullLectureContent = lectureTexts.join("\n\n");
  console.log(
    `[generate-mc-exam] Extracted ${lectureTexts.length} lectures, total ${fullLectureContent.length} chars`
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
מספר שאלות נדרש: ${count}

להלן התוכן המלא של הרצאות הקורס:

${fullLectureContent}

בנה מבחן אמריקאי עם ${count} שאלות המכסות את כלל החומר שלעיל. כל השאלות חייבות להתבסס על תוכן ההרצאות בלבד.`,
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
