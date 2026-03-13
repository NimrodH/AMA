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

  // ── 1. Get exam text from stored DB content ──────────────────────────────────
  const examText = source.content?.trim() ?? "";
  if (!examText) {
    return Response.json(
      { ok: false, error: "הקובץ ריק או לא ניתן לחלץ ממנו טקסט. נסה להעלות מחדש." },
      { status: 422 }
    );
  }

  // ── 2. Run chat completion with the extracted text ───────────────────────────
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

  // ── 3. Parse and return the JSON ─────────────────────────────────────────────
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
