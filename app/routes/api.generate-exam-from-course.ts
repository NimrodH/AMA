import type { Route } from "./+types/api.generate-exam-from-course";
import mammoth from "mammoth";
import { getOpenAIClient } from "~/lib/openai.server";
import { getStudent } from "~/services/settings.service";
import { getSourcesByCourse } from "~/services/sources.service";

// ─── System prompt ────────────────────────────────────────────────────────────
// v2: extract text pipeline with mammoth — no OpenAI file uploads
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

async function fetchFileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractText(buffer: Buffer, url: string): Promise<string> {
  const lower = url.toLowerCase();
  if (lower.endsWith(".docx")) {
    // extractRawText misses text inside shapes/text-boxes — fall back to HTML conversion
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value;
    // Fallback: strip HTML tags from the full conversion
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const plainText = htmlResult.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plainText;
  }
  if (lower.endsWith(".pdf")) {
    const pdfParse = await import("pdf-parse") as unknown as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text;
  }
  return buffer.toString("utf-8");
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

  // ── 1. Load past exam sources and lecture sources in parallel ────────────────
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

  // ── 2. Extract text from past exams ─────────────────────────────────────────
  const pastExamTexts: string[] = [];
  for (const source of pastExams) {
    if (!source.file_url) continue;
    try {
      const buffer = await fetchFileBuffer(source.file_url);
      const text = await extractText(buffer, source.file_url);
      if (text.trim()) pastExamTexts.push(`--- מבחן עבר: ${source.topic} ---\n${text}`);
    } catch (err) {
      console.error(`[generate-exam-from-course] Failed to load past exam ${source.id}:`, err);
    }
  }

  if (pastExamTexts.length === 0) {
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט ממבחני העבר. נסה להעלות מחדש." },
      { status: 422 }
    );
  }

  // ── 3. Extract text from lecture sources ─────────────────────────────────────
  const lectureTexts: string[] = [];
  for (const source of lectures) {
    if (!source.file_url) continue;
    try {
      const buffer = await fetchFileBuffer(source.file_url);
      const text = await extractText(buffer, source.file_url);
      if (text.trim()) {
        const label = source.lecture_number
          ? `הרצאה ${source.lecture_number} — ${source.topic}`
          : source.topic;
        lectureTexts.push(`--- ${label} ---\n${text}`);
      }
    } catch (err) {
      console.error(`[generate-exam-from-course] Failed to load lecture ${source.id}:`, err);
    }
  }

  if (lectureTexts.length === 0) {
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט מהרצאות הקורס. נסה להעלות מחדש." },
      { status: 422 }
    );
  }

  // ── 4. Call GPT-4o ───────────────────────────────────────────────────────────
  const client = getOpenAIClient();

  const userPrompt = `קורס: ${courseId}

=== מבנה מבחני העבר (ללמוד ממנו את המבנה בלבד — לא להעתיק שאלות) ===
${pastExamTexts.join("\n\n")}

=== תוכן הרצאות (לבנות ממנו את השאלות החדשות) ===
${lectureTexts.join("\n\n")}

בנה מבחן אימון חדש לפי ההוראות.`;

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

  // ── 5. Parse and return ───────────────────────────────────────────────────────
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
