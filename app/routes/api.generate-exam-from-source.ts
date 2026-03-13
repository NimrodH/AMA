import type { Route } from "./+types/api.generate-exam-from-source";
import { getOpenAIClient } from "~/lib/openai.server";
import { getStudent } from "~/services/settings.service";
import { getSourceById } from "~/services/sources.service";

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

/** Extract a JSON object from raw text (handles markdown code fences). */
function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const bareObject = text.match(/\{[\s\S]*\}/);
  if (bareObject) return bareObject[0].trim();
  return text;
}

/** Download a file from a public URL and return it as a Buffer. */
async function fetchFileBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

/** Map a file URL extension to a MIME type accepted by OpenAI. */
function getMimeType(url: string, fallback: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  return fallback;
}

export async function action({ request }: Route.ActionArgs) {
  const { sourceId } = (await request.json()) as { sourceId: string };

  if (!sourceId) {
    return Response.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  const source = await getSourceById(sourceId, student.id);
  if (!source) {
    return Response.json({ ok: false, error: "מקור לא נמצא" }, { status: 404 });
  }

  if (source.source_type !== "Past exam") {
    return Response.json({ ok: false, error: "המקור אינו מבחן עבר" }, { status: 400 });
  }

  if (!source.file_url) {
    return Response.json({ ok: false, error: "אין קישור לקובץ — נסה לעלות מחדש" }, { status: 400 });
  }

  const client = getOpenAIClient();

  // ── 1. Download the file from Supabase Storage ──────────────────────────────
  let fileBuffer: Buffer;
  let mimeType: string;
  try {
    const { buffer, contentType } = await fetchFileBuffer(source.file_url);
    fileBuffer = buffer;
    mimeType = getMimeType(source.file_url, contentType);
  } catch (err) {
    console.error("[generate-exam] Failed to download file:", err);
    return Response.json(
      { ok: false, error: "לא ניתן להוריד את הקובץ מ-Supabase Storage" },
      { status: 502 }
    );
  }

  // ── 2. Upload the file to OpenAI for this request ───────────────────────────
  let openaiFileId: string;
  try {
    const fileName = source.file_url.split("/").pop() ?? "exam.pdf";
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    const uploaded = await client.files.create({ file, purpose: "assistants" });
    openaiFileId = uploaded.id;
  } catch (err) {
    console.error("[generate-exam] Failed to upload file to OpenAI:", err);
    return Response.json(
      { ok: false, error: "לא ניתן להעלות את הקובץ ל-OpenAI" },
      { status: 502 }
    );
  }

  // ── 3. Run chat completion with the uploaded file ───────────────────────────
  let rawText: string;
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `זהו מבחן עבר בנושא "${source.topic}" מהקורס "${source.course_id}".
חשוב מאוד: קרא את כל השאלות במבחן — כל אחת מהן, ללא יוצא מן הכלל. אל תחסר אף שאלה.
המר את כל המבחן במלואו לפורמט JSON כמפורט בהוראות המערכת.`,
            },
            // Attach the file so GPT-4o can read it directly
            {
              type: "file",
              file: { file_id: openaiFileId },
            },
          ],
        },
      ],
    });

    rawText = response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[generate-exam] OpenAI chat completion error:", err);
    // Clean up the uploaded file
    try { await client.files.delete(openaiFileId); } catch { /* ignore */ }
    return Response.json(
      { ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" },
      { status: 502 }
    );
  }

  // ── 4. Clean up the temporary file ──────────────────────────────────────────
  try { await client.files.delete(openaiFileId); } catch { /* ignore */ }

  if (!rawText) {
    return Response.json(
      { ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" },
      { status: 500 }
    );
  }

  // ── 5. Parse and return the JSON ─────────────────────────────────────────────
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

  return Response.json({ ok: true, exam: examData, sourceTopic: source.topic });
}
