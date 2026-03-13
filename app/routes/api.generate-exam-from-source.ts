import type { Route } from "./+types/api.generate-exam-from-source";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
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

export async function action({ request }: Route.ActionArgs) {
  const { sourceId } = (await request.json()) as { sourceId: string };

  if (!sourceId) {
    return Response.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  // Fetch the source to verify ownership and get the vector store file id
  const source = await getSourceById(sourceId, student.id);
  if (!source) {
    return Response.json({ ok: false, error: "מקור לא נמצא" }, { status: 404 });
  }

  if (source.source_type !== "Past exam") {
    return Response.json({ ok: false, error: "המקור אינו מבחן עבר" }, { status: 400 });
  }

  if (!source.vector_store_file_id) {
    return Response.json({ ok: false, error: "הקובץ עדיין לא אונדקס — נסה לסנכרן את המקור ואז נסה שוב" }, { status: 400 });
  }

  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  const userMessage = `זהו מבחן עבר בנושא "${source.topic}" מהקורס "${source.course_id}".
קרא את כל המבחן בקובץ המצורף והמר אותו לפורמט JSON כמפורט.`;

  const response = await client.responses.create({
    model: "gpt-4o",
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        filters: {
          type: "and",
          filters: [
            { type: "eq" as const, key: "student_id", value: student.id },
            { type: "eq" as const, key: "source_type", value: "Past exam" },
          ],
        },
      },
    ],
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const rawText = response.output_text?.trim() ?? "";

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null;
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText;

  let examData: unknown;
  try {
    examData = JSON.parse(jsonStr);
  } catch {
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את המבחן. נסה שוב." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, exam: examData, sourceTopic: source.topic });
}
