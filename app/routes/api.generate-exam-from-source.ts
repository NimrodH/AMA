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

  if (!source.vector_store_file_id) {
    return Response.json(
      { ok: false, error: "הקובץ עדיין לא אונדקס — נסה לסנכרן את המקור ואז נסה שוב" },
      { status: 400 }
    );
  }

  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  const userMessage = `זהו מבחן עבר בנושא "${source.topic}" מהקורס "${source.course_id}".
חשוב מאוד: קרא את כל השאלות במבחן — כל אחת מהן, ללא יוצא מן הכלל. אל תחסר אף שאלה.
המר את כל המבחן במלואו לפורמט JSON כמפורט בהוראות המערכת.`;

  // ── SSE stream ──────────────────────────────────────────────────────────────
  // We keep the HTTP connection alive by sending periodic heartbeat comments
  // while OpenAI processes the request (which can take 60-90 s for large exams).
  // The final event carries the JSON payload.
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      // Heartbeat every 15 s so proxies / browsers don't close the connection.
      const heartbeat = setInterval(() => {
        try {
          send(": heartbeat\n\n");
        } catch {
          /* stream already closed */
        }
      }, 15_000);

      try {
        const response = await client.responses.create({
          model: "gpt-4o",
          tools: [
            {
              type: "file_search",
              vector_store_ids: [vectorStoreId],
              max_num_results: 50,
              filters: {
                type: "and" as const,
                filters: [
                  { type: "eq" as const, key: "student_id", value: student.id },
                  { type: "eq" as const, key: "source_type", value: "Past exam" },
                  { type: "eq" as const, key: "topic", value: source.topic },
                ],
              },
            },
          ],
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        });

        clearInterval(heartbeat);

        const rawText = response.output_text?.trim() ?? "";
        if (!rawText) {
          send(
            `data: ${JSON.stringify({ ok: false, error: "OpenAI לא החזיר תוכן — ייתכן שהקובץ לא נמצא ב-Vector Store. נסה לסנכרן שוב." })}\n\n`
          );
          controller.close();
          return;
        }

        const jsonStr = extractJson(rawText);
        let examData: unknown;
        try {
          examData = JSON.parse(jsonStr);
        } catch {
          console.error("[generate-exam] Failed to parse JSON. Raw response:", rawText);
          send(
            `data: ${JSON.stringify({ ok: false, error: "לא ניתן לפרסר את המבחן. נסה שוב." })}\n\n`
          );
          controller.close();
          return;
        }

        send(
          `data: ${JSON.stringify({ ok: true, exam: examData, sourceTopic: source.topic })}\n\n`
        );
        controller.close();
      } catch (err) {
        clearInterval(heartbeat);
        console.error("[generate-exam] OpenAI error:", err);
        send(
          `data: ${JSON.stringify({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב." })}\n\n`
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}
