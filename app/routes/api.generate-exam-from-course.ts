import type { Route } from "./+types/api.generate-exam-from-course";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts retrieved text content from OpenAI Responses API output items.
 */
function extractRetrievedContent(output: unknown[]): string {
  const parts: string[] = [];

  for (const item of output) {
    const o = item as Record<string, unknown>;

    if (o.type === "message") {
      const content = o.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "output_text" || block.type === "text") {
            parts.push(String(block.text ?? ""));
          }
        }
      }
    }

    if (o.type === "file_search_call") {
      const results = o.results as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(results)) {
        for (const result of results) {
          const content = result.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            for (const chunk of content) {
              if (chunk.text) parts.push(String(chunk.text));
            }
          } else if (result.text) {
            parts.push(String(result.text));
          }
        }
      }
    }
  }

  return parts.join("\n\n");
}

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

  // ── 2. Collect vector store file IDs for all sources ────────────────────
  const allSources = [...pastExams, ...lectures];
  const vectorStoreFileIds = allSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build source lists for prompt ────────────────────────────────────
  const pastExamList = pastExams.map((s) => `• ${s.topic}`).join("\n");
  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");

  const client = getOpenAIClient();
  const db = createServerClient(request);

  let examData: unknown;

  try {
    if (vectorStoreFileIds.length > 0) {
      // ── Step A: Retrieve content via file_search ──────────────────────────
      const vectorStoreId = await getOrCreateVectorStore(db);

      const retrievalResponse = await client.responses.create({
        model: "gpt-4o",
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 20,
            filters: {
              type: "and" as const,
              filters: [
                { type: "eq" as const, key: "student_id", value: student.id },
                { type: "eq" as const, key: "course_id", value: courseId },
              ],
            },
          },
        ],
        input: `אחזר את התוכן המלא של: מבחני עבר: ${pastExamList} והרצאות: ${lectureList}`,
      });

      const retrievedContent = extractRetrievedContent(
        (retrievalResponse.output as unknown[]) ?? []
      );

      const contextText = retrievedContent.trim()
        ? retrievedContent
        : `מבחני עבר: ${pastExamList}\nהרצאות: ${lectureList}`;

      // ── Step B: Generate exam JSON with guaranteed json_object output ─────
      const generationResponse = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `קורס: ${courseId}

תוכן מבחני עבר והרצאות שאוחזר:
${contextText}

בנה מבחן אימון חדש לפי ההוראות. השתמש במבחני העבר רק ללמידת המבנה, ובנה שאלות חדשות מתוכן ההרצאות.`,
          },
        ],
      });

      const rawText = generationResponse.choices[0]?.message?.content?.trim() ?? "";
      if (!rawText) {
        return Response.json(
          { ok: false, error: "OpenAI לא החזיר תוכן — נסה שוב" },
          { status: 500 }
        );
      }

      examData = JSON.parse(rawText);
    } else {
      // ── Fallback: No indexed files — chat only ────────────────────────────
      console.warn("[generate-exam-from-course] No vector store file IDs found, using plain chat");

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `קורס: ${courseId}

מבחני עבר זמינים (מבנה בלבד):
${pastExamList}

הרצאות הקורס:
${lectureList}

בנה מבחן אימון חדש לפי ההוראות.`,
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
    }
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
