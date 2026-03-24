import type { Route } from "./+types/api.generate-exam-from-source";
import mammoth from "mammoth";
import { getOpenAIClient } from "~/lib/openai.server";
import { requireSession } from "~/lib/auth.server";
import { getSourceById } from "~/services/sources.service";
import { createServerClient } from "~/lib/supabase";
import { saveExam } from "~/services/exams.service";

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

החזר JSON בלבד, ללא טקסט נוסף.`;

/** Extract a JSON object from raw text (handles markdown code fences and citation annotations). */
function extractJson(text: string): string {
  // Strip OpenAI file_search citation annotations like 【4:0†source】
  const cleaned = text.replace(/【[^】]*】/g, "");
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const bareObject = cleaned.match(/\{[\s\S]*\}/);
  if (bareObject) return bareObject[0].trim();
  return cleaned;
}

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
    // pdf-parse ships as a CJS module; when bundled it may land on .default
    // or on the module object itself — handle both cases at runtime.
    const pdfParseModule = await import("pdf-parse") as unknown as { default?: (buf: Buffer) => Promise<{ text: string }> } & ((buf: Buffer) => Promise<{ text: string }>);
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const data = await pdfParse(buffer);
    return data.text;
  }

  return buffer.toString("utf-8");
}

export async function action({ request }: Route.ActionArgs) {
  const { sourceId } = (await request.json()) as { sourceId: string };

  if (!sourceId) {
    return Response.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  const source = await getSourceById(sourceId, student.id, request);
  if (!source) {
    return Response.json({ ok: false, error: "מקור לא נמצא" }, { status: 404 });
  }

  if (source.source_type !== "Past exam") {
    return Response.json({ ok: false, error: "המקור אינו מבחן עבר" }, { status: 400 });
  }

  if (!source.file_url) {
    return Response.json({ ok: false, error: "אין קישור לקובץ — נסה לעלות מחדש" }, { status: 400 });
  }

  // ── 0. Cache hit — return immediately if exam was already parsed ─────────
  if (source.content) {
    try {
      const cached = JSON.parse(source.content as string);
      // Also save to the exams table (fire-and-forget, de-duplicates on title/date naturally)
      saveExam({
        studentId: student.id,
        courseId: source.course_id,
        title: (cached as { title?: string })?.title ?? source.topic,
        examType: "past",
        examContent: cached as object,
        request,
      }).catch(() => {});
      return Response.json({ ok: true, exam: cached, sourceTopic: source.topic });
    } catch {
      // Corrupted cache — fall through to re-generate
      console.warn("[generate-exam] Corrupted cache for source", sourceId, "— re-generating");
    }
  }

  // ── 1. Download the file from Supabase Storage ───────────────────────────
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fetchFileBuffer(source.file_url);
  } catch (err) {
    console.error("[generate-exam] Failed to download file:", err);
    return Response.json(
      { ok: false, error: "לא ניתן להוריד את הקובץ מ-Supabase Storage" },
      { status: 502 }
    );
  }

  // ── 2. Extract text from the file ───────────────────────────────────────
  let examText: string;
  try {
    examText = await extractText(fileBuffer, source.file_url);
    if (!examText.trim()) {
      return Response.json(
        { ok: false, error: "הקובץ ריק או לא ניתן לחלץ ממנו טקסט" },
        { status: 422 }
      );
    }
  } catch (err) {
    console.error("[generate-exam] Failed to extract text from file:", err);
    return Response.json(
      { ok: false, error: "לא ניתן לחלץ טקסט מהקובץ" },
      { status: 422 }
    );
  }

  // ── 3. Run chat completion with the extracted text ───────────────────────
  const client = getOpenAIClient();
  let rawText: string;
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `זהו מבחן עבר בנושא "${source.topic}" מהקורס "${source.course_id}".
חשוב מאוד: קרא את כל השאלות במבחן — כל אחת מהן, ללא יוצא מן הכלל. אל תחסר אף שאלה.
המר את כל המבחן במלואו לפורמט JSON כמפורט בהוראות המערכת.

תוכן המבחן:
${examText}`,
        },
      ],
    });

    rawText = response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[generate-exam] OpenAI chat completion error:", err);
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

  // ── 4. Parse the JSON ─────────────────────────────────────────────────────
  const jsonStr = extractJson(rawText);
  let examData: unknown;
  try {
    examData = JSON.parse(jsonStr);
  } catch {
    console.error("[generate-exam] Failed to parse JSON. Raw response:", rawText);
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" },
      { status: 500 }
    );
  }

  // ── 5. Cache the result in DB (fire-and-forget) ──────────────────────────
  const db = createServerClient(request);
  db.from("sources")
    .update({ content: JSON.stringify(examData) })
    .eq("id", sourceId)
    .eq("student_id", student.id)
    .then(({ error }) => {
      if (error) console.warn("[generate-exam] Failed to cache exam in DB:", error.message);
    });

  // 		6. Save exam to DB (fire-and-forget) 																																
  const examObj = examData as { title?: string };
  saveExam({
    studentId: student.id,
    courseId: source.course_id,
    title: examObj?.title ?? source.topic,
    examType: "past",
    examContent: examData as object,
    request,
  }).catch((err) => console.warn("[generate-exam-from-source] save exam failed:", err));

  return Response.json({ ok: true, exam: examData, sourceTopic: source.topic });
}
