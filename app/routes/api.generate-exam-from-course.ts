import type { Route } from "./+types/api.generate-exam-from-course";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { getSourcesByCourse } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedQuestion {
  type: "multiple_choice" | "true_false" | "open";
  points: number;
}

interface ParsedExam {
  questions?: ParsedQuestion[];
}

interface ExamStructure {
  /** Human-readable name of the source past exam */
  topic: string;
  multiple_choice: number;
  true_false: number;
  open: number;
  /** Points per question for each type (first occurrence wins) */
  points_per_type: { multiple_choice?: number; true_false?: number; open?: number };
  total_questions: number;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה מחולל מבחנים אקדמיים מקצועי.
קיבלת:
1. מבנה מדויק של מבחן עבר (מספר שאלות מכל סוג וניקוד לכל שאלה) — אלה נתונים קשיחים שחייבים להישמר בדיוק
2. תוכן הרצאות הקורס — בנה מהן שאלות חדשות לחלוטין

המשימה שלך: לבנות מבחן חדש שמשמר את אותו מבנה בדיוק, אך השאלות עצמן שונות לחלוטין ומבוססות אך ורק על תוכן ההרצאות.

חוקים:
- מספר השאלות מכל סוג הוא קבוע ומחייב — אסור לשנות אותו
- הניקוד לכל שאלה הוא קבוע ומחייב — אסור לשנות אותו
- השאלות עצמן חייבות להיות שונות לחלוטין מהמבחן המקורי
- כל השאלות מבוססות אך ורק על תוכן ההרצאות שסופקו
- כתוב בעברית

השתמש בכלי file_search כדי לאחזר את תוכן הרצאות הקורס ולבנות מהן שאלות חדשות.

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

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return text.trim();
}

/** Pull the final text content from a Responses API response object. */
function extractOutputText(response: { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }): string {
  // Primary: output_text convenience accessor
  if (response.output_text?.trim()) return response.output_text.trim();
  // Fallback: walk the output array for message items
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.trim()) return part.text.trim();
        }
      }
    }
  }
  return "";
}

/**
 * Parse the cached exam JSON from a source's `content` field and return
 * the exact question structure (counts + points per type).
 */
function parsePastExamStructure(content: string | null | undefined, topic: string): ExamStructure | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as ParsedExam;
    const questions = parsed.questions;
    if (!Array.isArray(questions) || questions.length === 0) return null;

    const structure: ExamStructure = {
      topic,
      multiple_choice: 0,
      true_false: 0,
      open: 0,
      points_per_type: {},
      total_questions: questions.length,
    };

    for (const q of questions) {
      const type = q.type;
      const pts = Number(q.points) || 0;
      if (type === "multiple_choice") {
        structure.multiple_choice++;
        if (!structure.points_per_type.multiple_choice) structure.points_per_type.multiple_choice = pts;
      } else if (type === "true_false") {
        structure.true_false++;
        if (!structure.points_per_type.true_false) structure.points_per_type.true_false = pts;
      } else if (type === "open") {
        structure.open++;
        if (!structure.points_per_type.open) structure.points_per_type.open = pts;
      }
    }

    return structure;
  } catch {
    return null;
  }
}

/**
 * Build a human-readable, hard-constraint description of the exam structure
 * so the model cannot miscount or guess.
 */
function buildStructureBlock(structures: ExamStructure[]): string {
  if (structures.length === 0) return "";

  // Use the first successfully parsed past exam as the reference structure
  const ref = structures[0];

  const lines: string[] = [
    `=== מבנה מחייב של המבחן (חייב להישמר בדיוק) ===`,
    `מבוסס על: ${ref.topic}`,
    `סה"כ שאלות: ${ref.total_questions}`,
    ``,
  ];

  if (ref.multiple_choice > 0) {
    lines.push(`• שאלות אמריקאיות (multiple_choice): ${ref.multiple_choice} שאלות × ${ref.points_per_type.multiple_choice ?? "?"} נקודות כל אחת`);
  }
  if (ref.true_false > 0) {
    lines.push(`• שאלות נכון/לא נכון (true_false): ${ref.true_false} שאלות × ${ref.points_per_type.true_false ?? "?"} נקודות כל אחת`);
  }
  if (ref.open > 0) {
    lines.push(`• שאלות פתוחות (open): ${ref.open} שאלות × ${ref.points_per_type.open ?? "?"} נקודות כל אחת`);
  }

  lines.push(``);
  lines.push(`חובה: צור בדיוק ${ref.multiple_choice} שאלות multiple_choice, ${ref.true_false} שאלות true_false, ו-${ref.open} שאלות open. אין לשנות את המספרים האלה.`);
  lines.push(`=== סוף הגדרת מבנה מחייב ===`);

  return lines.join("\n");
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

  // ── 2. Extract the exact past exam structure from cached parsed content ───
  //
  // Each past exam that has been viewed via "הצג כבחינה" has its parsed JSON
  // cached in source.content. We read it here directly to get hard counts
  // instead of relying on the AI to guess the structure from raw file text.
  const parsedStructures = pastExams
    .map((s) => parsePastExamStructure(s.content as string | null, s.topic))
    .filter((s): s is ExamStructure => s !== null);

  const structureBlock = buildStructureBlock(parsedStructures);

  // ── 3. Collect vector store file IDs (lectures only for content) ─────────
  // We include past exam vector store files too so the model can optionally
  // consult them, but we already know the structure from the DB cache.
  const allSources = [...pastExams, ...lectures];
  const vectorStoreFileIds = allSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 4. Build the user prompt with the explicit structure constraint ───────
  const pastExamList = pastExams
    .map((s) => `• ${s.topic}${s.content ? " (מבנה מנותח ✓)" : " (ללא ניתוח — השתמש ב-file_search)"}`)
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

${
  structureBlock
    ? `${structureBlock}\n\nמבחני העבר (אל תעתיק שאלות — השתמש במבנה לעיל בלבד):\n${pastExamList}`
    : `מבחני עבר זמינים (למד מהם את מבנה המבחן בלבד — אל תעתיק שאלות):\n${pastExamList}\n\nחשוב: השתמש ב-file_search כדי לקרוא את תוכן מבחני העבר ולהסיק את המבנה המדויק (מספר שאלות מכל סוג, ניקוד).`
}

הרצאות הקורס הזמינות (בנה מהן את השאלות החדשות):
${lectureList}

בצע חיפוש רחב בכל מסמכי ההרצאות באמצעות file_search כדי לאחזר את התוכן המלא, ולאחר מכן בנה מבחן אימון חדש לפי המבנה המחייב שהוגדר לעיל.`;

  // ── 5. Call OpenAI with file_search ──────────────────────────────────────
  const client = getOpenAIClient();
  const db = createServerClient(request);
  const vectorStoreId = await getOrCreateVectorStore(db);

  let rawText: string;

  try {
    if (vectorStoreFileIds.length > 0) {
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

      rawText = extractOutputText(response);
    } else {
      // No vector store files — fall back to chat completion without RAG
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

  // ── 6. Parse and return ───────────────────────────────────────────────────
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

  // ── 7. Save exam to DB (fire-and-forget) ────────────────────────────────
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
