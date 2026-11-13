/**
 * Turning a past exam file into structured exam JSON (questions, options,
 * answer key, points). The result is cached in the source's `content` field,
 * so each past exam is parsed by the AI only once.
 */
import mammoth from "mammoth";
import { getOpenAIClient } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { parseModelJson } from "~/lib/model-json.server";
import { sanitizeAnswerKey } from "~/lib/exam-answer-key.server";
import type { SourceRow } from "~/services/sources.service";

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
ניתן לך קובץ מבחן עבר של קורס אקדמי. המשימה שלך היא לקרוא את המבחן בעיון ולהפוך אותו למבחן אינטראקטיבי.

חשוב מאוד:
- שמור על כל השאלות המקוריות ממבחן העבר — אל תמציא שאלות חדשות
- שמור על הניסוח המקורי של כל שאלה
- שמור על האופציות המקוריות בשאלות אמריקאיות
- שמור על הניקוד המקורי של כל שאלה (אם מופיע, אחרת הקצה ניקוד הגיוני)
- זהה נכון את סוג כל שאלה: multiple_choice / true_false / open
- שאלות אמריקאיות (בחירה מרובה) = multiple_choice
- שאלות נכון/לא נכון = true_false
- שאלות פתוחות = open

תשובות נכונות לשאלות אמריקאיות ונכון/לא נכון:
- אם המסמך מכיל מפתח תשובות (answer key) — חלץ את התשובה הנכונה לכל שאלה בדיוק כפי שמופיעה במפתח.
- אם אין מפתח תשובות — קבע את התשובה הנכונה על סמך תוכן השאלה, הידע הנלמד, וההגיון האקדמי.
- בכל מקרה — תמיד כלול correct_answer לכל שאלת multiple_choice ו-true_false.
- לשאלות פתוחות (open) — אל תכלול correct_answer.

החזר את המבחן בפורמט JSON בדיוק עם המבנה הבא:
{
  "title": "כותרת המבחן (כולל שם הקורס)",
  "instructions": "הוראות המבחן המקוריות",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "נוסח השאלה",
      "options": ["אופציה א", "אופציה ב", "אופציה ג", "אופציה ד"],
      "correct_answer": "אופציה ב",
      "points": 10
    },
    {
      "id": 2,
      "type": "true_false",
      "question": "נוסח השאלה",
      "options": ["נכון", "לא נכון"],
      "correct_answer": "נכון",
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

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.`;

/** Download a file from a public URL and return it as a Buffer. */
async function fetchFileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract plain text from a file buffer.
 * Supports DOCX (via mammoth) and plain text files.
 * For PDF or other types, falls back to a UTF-8 decode attempt.
 */
async function extractText(buffer: Buffer, url: string): Promise<string> {
  const lower = url.toLowerCase();

  if (lower.endsWith(".docx")) {
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value;
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const plainText = htmlResult.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plainText;
  }

  if (lower.endsWith(".pdf")) {
    // pdf-parse v2 uses a class-based API: new PDFParse({ data: buffer })
    const { PDFParse } = await import("pdf-parse") as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> } };
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  return buffer.toString("utf-8");
}

/** The cached parsed exam of a past exam source, or null if not parsed yet. */
export function getCachedPastExam(source: Pick<SourceRow, "content">): unknown | null {
  if (!source.content) return null;
  try {
    const cached = JSON.parse(source.content as string) as { questions?: unknown };
    return Array.isArray(cached?.questions) && cached.questions.length > 0 ? cached : null;
  } catch {
    return null;
  }
}

export type ParsePastExamResult = { ok: true; exam: unknown } | { ok: false; error: string; status: number };

/**
 * Parse a past exam source with the AI and cache the result on the source.
 * Returns the cached result when the source was already parsed.
 */
export async function parsePastExam(
  source: SourceRow,
  studentId: string,
  request: Request
): Promise<ParsePastExamResult> {
  const cached = getCachedPastExam(source);
  if (cached) return { ok: true, exam: cached };

  if (!source.file_url) {
    return { ok: false, error: "אין קישור לקובץ — נסה לעלות מחדש", status: 400 };
  }

  // 1. Download the file from Supabase Storage
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fetchFileBuffer(source.file_url);
  } catch (err) {
    console.error("[past-exam] Failed to download file:", err);
    return { ok: false, error: "לא ניתן להוריד את הקובץ מ-Supabase Storage", status: 502 };
  }

  // 2. Extract text from the file
  let examText: string;
  try {
    examText = await extractText(fileBuffer, source.file_url);
  } catch (err) {
    console.error("[past-exam] Failed to extract text from file:", err);
    return { ok: false, error: "לא ניתן לחלץ טקסט מהקובץ", status: 422 };
  }
  if (!examText.trim()) {
    return { ok: false, error: "הקובץ ריק או לא ניתן לחלץ ממנו טקסט", status: 422 };
  }

  // 3. Ask the AI to convert it to exam JSON
  const courseName = (source.metadata as { course_name?: string } | null)?.course_name ?? source.course_id;
  let rawText: string;
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `זהו מבחן עבר בנושא "${source.topic}" מהקורס "${courseName}".
חשוב מאוד: קרא את כל השאלות במבחן — כל אחת מהן, ללא יוצא מן הכלל. אל תחסר אף שאלה.
המר את כל המבחן במלואו לפורמט JSON כמפורט בהוראות המערכת.

תוכן המבחן:
${examText}`,
        },
      ],
    });
    rawText = response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[past-exam] OpenAI error:", err);
    return { ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב", status: 502 };
  }

  const exam = rawText ? parseModelJson(rawText) : undefined;
  if (exam === undefined) {
    console.error("[past-exam] Failed to parse JSON. Raw response:", rawText);
    return { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב", status: 500 };
  }
  sanitizeAnswerKey(exam);

  // 4. Cache the result on the source (awaited, so it isn't lost when the
  // serverless function ends)
  const { error } = await createServerClient(request)
    .from("sources")
    .update({ content: JSON.stringify(exam) })
    .eq("id", source.id)
    .eq("student_id", studentId);
  if (error) console.warn("[past-exam] Failed to cache exam in DB:", error.message);

  return { ok: true, exam };
}
