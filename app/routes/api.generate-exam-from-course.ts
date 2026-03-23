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

חשוב מאוד: השתמש בכלי file_search כדי לאחזר:
1. את תוכן מבחני העבר (source_type=Past exam) של הקורס (course_id) — ללמוד מהם את המבנה בלבד
המבנה צריך להיות זהה לאחד ממבחני העבר של הקורס
2. את תוכן הרצאות הקורס (source_type=Lecture) — לבנות מהם את השאלות החדשות
בצע חיפוש רחב בכל המסמכים של הקורס שצורפו.

החזר את המבחן בפורמט JSON כאשר השאלות מוצגות באופן הבא:
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

  // ── 3. Build the user prompt listing available sources ───────────────────
  const pastExamList = pastExams
    .map((s) => `• ${s.topic}`)
    .join("\n");

  const lectureList = lectures
    .map((s) => {
      const label = s.lecture_number
        ? `הרצאה ${s.lecture_number} — ${s.topic}`
        : `${s.topic} (כלל הקורס)`;
      return `• ${label}`;
    })
    .join("\n");

  const userPrompt = `קורס: ${courseId}

מבחני עבר זמינים (למד מהם את מבנה המבחן בלבד — אל תעתיק שאלות):
${pastExamList}

הרצאות הקורס הזמינות (בנה מהן את השאלות החדשות):
${lectureList}

בצע חיפוש רחב בכל המסמכים באמצעות file_search כדי לאחזר את התוכן המלא של כל אחד מהמקורות לעיל, ולאחר מכן בנה מבחן אימון חדש לפי ההוראות.`;

  // ── 4. Call OpenAI with file_search (like card-feedback) ─────────────────
  const client = getOpenAIClient();
  const db = createServerClient(request);
  const vectorStoreId = await getOrCreateVectorStore(db);

  let rawText: string;

  try {
    if (vectorStoreFileIds.length > 0) {
      // Use the vector store — identical pattern to card-feedback
      // Filter by student_id so only this student's files are searched
      const response = await client.responses.create({
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
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      rawText = response.output_text?.trim() ?? "";
    } else {
      // No vector store files — fall back to chat completion without RAG
      // (should be rare; sources were uploaded but not indexed yet)
      console.warn("[generate-exam-from-course] No vector store file IDs found, using plain chat");
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPrompt}\n\nשים לב: לא נמצאו קבצים מאינדקס. נסה לבנות מבחן בסיסי לפי שמות ההרצאות בלבד.`,
          },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    }
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

  // ── 5. Parse and return ───────────────────────────────────────────────────
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

  // ── 6. Save exam to DB (fire-and-forget) ────────────────────────────────
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
