import type OpenAI from "openai";
import type { Route } from "./+types/api.generate-mc-exam";
import { courseContentFilter, getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { getCourseName } from "~/services/settings.service";
import { saveExam } from "~/services/exams.service";
import { sanitizeAnswerKey } from "~/lib/exam-answer-key.server";
import { parseModelJson } from "~/lib/model-json.server";
import { extractOutputText, fitExamToSlots, type ExamSlot } from "~/lib/exam-ai.server";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת גישה לחומרי הלימוד של הקורס (הרצאות ומאמרים).
המשימה שלך: לבנות מבחן אמריקאי (multiple choice) המכסה את כלל חומרי הקורס באופן מאוזן.

חוקים:
- כל שאלה חייבת להיות בעברית
- כל שאלה חייבת לכלול בדיוק 4 תשובות אפשריות (options)
- רק תשובה אחת נכונה לכל שאלה
- כסה נושאים מכל ההרצאות והמאמרים שסופקו — אל תתרכז רק במקור אחד
- correct_answer חייב להיות העתק מדויק, תו בתו, של אחת האפשרויות ב-options
- פזר את השאלות באופן שווה על פני כל חומרי הקורס
- השאלות צריכות לבדוק הבנה, לא רק שינון עובדות
- כל שאלה שווה נקודה אחת (points: 1)
- כתוב בעברית בלבד

חשוב מאוד: השתמש בכלי file_search כדי לאחזר את תוכן ההרצאות והמאמרים של הקורס לפני שאתה כותב שאלות. בצע חיפוש נפרד לכל הרצאה ולכל מאמר ברשימה, ובסס כל שאלה על חומר ספציפי שמצאת בהם.

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.
{
  "title": "שם הקורס — מבחן אמריקאי",
  "instructions": "בחר את התשובה הנכונה לכל שאלה.",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "נוסח השאלה",
      "options": ["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"],
      "correct_answer": "תשובה א",
      "points": 1
    }
  ]
}`;

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { courseId, questionCount } = (await request.json()) as {
    courseId: string;
    questionCount: number;
  };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const count = Math.max(5, Math.min(50, questionCount || 10));

  const session = await requireSession(request);
  const student = { id: session.studentId };

  // ── 1. Content sources (lectures and articles) and course name ─────────
  const [lectures, articles, courseName] = await Promise.all([
    getSourcesByCourse(student.id, courseId, "Lecture", request),
    getSourcesByCourse(student.id, courseId, "Article", request),
    getCourseName(student.id, courseId, request),
  ]);

  if (lectures.length === 0 && articles.length === 0) {
    return Response.json(
      { ok: false, error: "לא נמצאו הרצאות או מאמרים לקורס זה. העלה חומרי לימוד כדי שה-AI יוכל לבנות שאלות מהתוכן." },
      { status: 422 }
    );
  }

  const vectorStoreFileIds = [...lectures, ...articles]
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 2. Prompt ───────────────────────────────────────────────────────────
  const lectureList = lectures
    .map((s) => `• ${s.lecture_number ? `הרצאה ${s.lecture_number} — ${s.topic}` : `${s.topic} (כלל הקורס)`}`)
    .join("\n");
  const articleList = articles.map((s) => `• מאמר — ${s.topic}`).join("\n");

  const userPrompt = `קורס: ${courseName}
מספר שאלות נדרש: בדיוק ${count}

חומרי הלימוד הזמינים (בנה מהם את השאלות):
${[lectureList, articleList].filter(Boolean).join("\n")}

אחזר את התוכן של כל אחד מחומרי הלימוד באמצעות file_search, ולאחר מכן בנה מבחן אמריקאי עם בדיוק ${count} שאלות המכסות את כלל החומר.`;

  // ── 3. Call OpenAI ──────────────────────────────────────────────────────
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
      // No indexed files yet — fall back to the topic list only (edge case)
      console.warn("[generate-mc-exam] No vector store file IDs found, falling back to topic list");
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
    console.error("[generate-mc-exam] OpenAI error:", err);
    return Response.json({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" }, { status: 502 });
  }

  // ── 4. Parse, check the answer key and the question count ───────────────
  const parsed = rawText ? parseModelJson(rawText) : undefined;
  if (parsed === undefined) {
    console.error("[generate-mc-exam] Failed to parse JSON:", rawText);
    return Response.json({ ok: false, error: "לא ניתן לפרסר את המבחן — נסה שוב" }, { status: 500 });
  }
  sanitizeAnswerKey(parsed);

  // Exactly `count` questions of 1 point; extras dropped, missing requested once more
  const slots: ExamSlot[] = Array.from({ length: count }, () => ({ type: "multiple_choice", points: 1 }));
  const { exam, missing } = await fitExamToSlots(parsed, slots, {
    client,
    fileSearchTool,
    systemPrompt: SYSTEM_PROMPT,
  });
  if (missing > 0) console.warn(`[generate-mc-exam] ${missing} question(s) still missing after retry`);

  if (exam.questions.length === 0) {
    return Response.json({ ok: false, error: "המבחן שנוצר ריק — נסה שוב" }, { status: 500 });
  }

  // ── 5. Save to the exams list (awaited, so it isn't lost when the
  // serverless function ends) ─────────────────────────────────────────────
  try {
    await saveExam({
      studentId: student.id,
      courseId,
      title: exam.title ?? `${courseName} — מבחן אמריקאי`,
      examType: "mc",
      examContent: exam as object,
      request,
    });
  } catch (err) {
    console.warn("[generate-mc-exam] save exam failed:", err);
  }

  return Response.json({ ok: true, exam });
}
