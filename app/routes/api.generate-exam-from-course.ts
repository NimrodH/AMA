import type OpenAI from "openai";
import type { Route } from "./+types/api.generate-exam-from-course";
import { courseContentFilter, getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { getCourseName } from "~/services/settings.service";
import { saveExam } from "~/services/exams.service";
import { getCachedPastExam } from "~/services/past-exam.service";
import { sanitizeAnswerKey } from "~/lib/exam-answer-key.server";
import { parseModelJson } from "~/lib/model-json.server";
import {
  describeStructure,
  extractOutputText,
  fitExamToSlots,
  slotsFromExam,
  type ExamData,
  type ExamSlot,
} from "~/lib/exam-ai.server";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת:
1. מבנה מדויק של מבחן עבר (סדר השאלות, סוג כל שאלה וניקוד כל שאלה) — אלה נתונים קשיחים שחייבים להישמר בדיוק
2. חומרי הלימוד של הקורס (הרצאות ומאמרים) — בנה מהם שאלות חדשות לחלוטין

המשימה שלך: לבנות מבחן חדש שמשמר את אותו מבנה בדיוק, אך השאלות עצמן שונות לחלוטין ומבוססות אך ורק על חומרי הלימוד.

חוקים:
- מספר השאלות מכל סוג, סדרן והניקוד של כל שאלה הם קבועים ומחייבים — אסור לשנות אותם
- השאלות עצמן חייבות להיות שונות לחלוטין ממבחני העבר
- כל השאלות מבוססות אך ורק על חומרי הלימוד (הרצאות ומאמרים) שסופקו
- פזר את השאלות על פני כל חומרי הלימוד — אל תתרכז במקור אחד
- כתוב בעברית

מפתח תשובות (חובה):
- לכל שאלת multiple_choice ו-true_false כלול "correct_answer" — העתק מדויק, תו בתו, של אחת האפשרויות ב-options
- רק אפשרות אחת נכונה בכל שאלה
- לכל שאלה פתוחה (open) כלול "model_answer" — תשובה לדוגמה קצרה ומלאה המבוססת על חומרי הלימוד, שתשמש לבדיקה

השתמש בכלי file_search כדי לאחזר את תוכן ההרצאות והמאמרים של הקורס. בצע חיפוש נפרד לכל הרצאה ולכל מאמר ברשימה, כדי שהשאלות יכסו את כל החומר.

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
      "correct_answer": "אופציה ג",
      "points": 10
    },
    {
      "id": 2,
      "type": "true_false",
      "question": "נוסח השאלה",
      "options": ["נכון", "לא נכון"],
      "correct_answer": "לא נכון",
      "points": 5
    },
    {
      "id": 3,
      "type": "open",
      "question": "נוסח השאלה",
      "model_answer": "תשובה לדוגמה",
      "points": 15
    }
  ]
}

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.`;

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Generates a new practice exam from the course's lectures and articles, in
 * the exact structure of a parsed past exam.
 *
 * If no past exam of the course has been parsed yet, responds with
 * `{ ok: false, needsPastExamParse: <sourceId> }` (409). The client then
 * parses that past exam (/api/generate-exam-from-source with parseOnly) and
 * calls again. Doing it in two requests keeps each one short enough for the
 * serverless function time limit.
 */
export async function action({ request }: Route.ActionArgs) {
  const { courseId } = (await request.json()) as { courseId: string };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  // ── 1. Sources and course name ──────────────────────────────────────────
  const [pastExams, lectures, articles, courseName] = await Promise.all([
    getSourcesByCourse(student.id, courseId, "Past exam", request),
    getSourcesByCourse(student.id, courseId, "Lecture", request),
    getSourcesByCourse(student.id, courseId, "Article", request),
    getCourseName(student.id, courseId, request),
  ]);

  if (pastExams.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו מבחני עבר לקורס זה. העלה מבחן עבר כדי שה-AI ילמד את מבנה המבחן." },
      { status: 422 }
    );
  }

  if (lectures.length === 0 && articles.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות או מאמרים לקורס זה. העלה חומרי לימוד כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  // ── 2. Required structure: the first parsed past exam ───────────────────
  const reference = pastExams
    .map((source) => ({ source, slots: slotsFromExam(getCachedPastExam(source)) }))
    .find((r) => r.slots.length > 0);

  if (!reference) {
    const parsable = pastExams.find((s) => s.file_url);
    if (parsable) {
      return Response.json({ ok: false, needsPastExamParse: parsable.id }, { status: 409 });
    }
  }

  const slots: ExamSlot[] = reference?.slots ?? [];
  const structureBlock = reference
    ? describeStructure(slots, reference.source.topic)
    : `מבנה מבחני העבר אינו זמין. בנה מבחן מאוזן בן 10 עד 15 שאלות שמשלב שאלות אמריקאיות (multiple_choice), נכון/לא נכון (true_false) ושאלות פתוחות (open), בסך הכול 100 נקודות.`;

  // ── 3. Content files (lectures and articles only) ───────────────────────
  // The search is limited to them (see the file_search filter), so the model
  // can't copy past exam questions.
  const vectorStoreFileIds = [...lectures, ...articles]
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 4. Prompt ───────────────────────────────────────────────────────────
  const lectureList = lectures
    .map((s) => `• ${s.lecture_number ? `הרצאה ${s.lecture_number} — ${s.topic}` : `${s.topic} (כלל הקורס)`}`)
    .join("\n");
  const articleList = articles.map((s) => `• מאמר — ${s.topic}`).join("\n");
  const contentList = [lectureList, articleList].filter(Boolean).join("\n");

  const userPrompt = `קורס: ${courseName}

${structureBlock}

חומרי הלימוד הזמינים (בנה מהם את השאלות החדשות):
${contentList}

אחזר את התוכן של כל אחד מחומרי הלימוד באמצעות file_search, ולאחר מכן בנה מבחן אימון חדש לפי המבנה שהוגדר לעיל.`;

  // ── 5. Call OpenAI ──────────────────────────────────────────────────────
  const client = getOpenAIClient();
  const db = createServerClient(request);
  const vectorStoreId = await getOrCreateVectorStore(db);

  const fileSearchTool: OpenAI.Responses.FileSearchTool = {
    type: "file_search",
    vector_store_ids: [vectorStoreId],
    max_num_results: 50,
    // Lectures and articles only — never past exams or summary cards
    filters: courseContentFilter(student.id, courseId),
  };

  let rawText: string;
  try {
    if (vectorStoreFileIds.length > 0) {
      const response = await client.responses.create({
        model: "gpt-4o",
        text: { format: { type: "json_object" } },
        tools: [fileSearchTool],
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      rawText = extractOutputText(response);
    } else {
      // No indexed files — fall back to a plain chat completion
      console.warn("[generate-exam-from-course] No vector store file IDs found, using plain chat");
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPrompt}\n\nשים לב: לא נמצאו קבצים מאינדקס. נסה לבנות מבחן בסיסי לפי שמות ההרצאות והמאמרים בלבד.`,
          },
        ],
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? "";
    }
  } catch (err) {
    console.error("[generate-exam-from-course] OpenAI error:", err);
    return Response.json({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" }, { status: 502 });
  }

  // ── 6. Parse, check the answer key and the structure ────────────────────
  const parsed = rawText ? parseModelJson(rawText) : undefined;
  if (parsed === undefined) {
    console.error("[generate-exam-from-course] Failed to parse JSON:", rawText);
    return Response.json({ ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" }, { status: 500 });
  }
  sanitizeAnswerKey(parsed);

  let exam = parsed as ExamData;
  if (slots.length > 0) {
    // Same order, types and points as the past exam; extra questions are
    // dropped and missing ones requested once more.
    const fitted = await fitExamToSlots(parsed, slots, {
      client,
      fileSearchTool,
      systemPrompt: SYSTEM_PROMPT,
    });
    exam = fitted.exam;
    if (fitted.missing > 0) {
      console.warn(`[generate-exam-from-course] ${fitted.missing} question(s) still missing after retry`);
    }
  }

  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    return Response.json({ ok: false, error: "המבחן שנוצר ריק — נסה שוב" }, { status: 500 });
  }

  // ── 7. Save to the exams list (awaited, so it isn't lost when the
  // serverless function ends) ─────────────────────────────────────────────
  try {
    await saveExam({
      studentId: student.id,
      courseId,
      title: exam.title ?? `${courseName} — מבחן אימון`,
      examType: "ai",
      examContent: exam as object,
      request,
    });
  } catch (err) {
    console.warn("[generate-exam-from-course] save exam failed:", err);
  }

  return Response.json({ ok: true, exam });
}
