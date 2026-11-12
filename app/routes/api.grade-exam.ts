import type { Route } from "./+types/api.grade-exam";
import { courseContentFilter, getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { recordExamResult } from "~/services/stats.service";
import { parseModelJson } from "~/lib/model-json.server";

const SYSTEM_PROMPT = `אתה בוחן אקדמי מנוסה המעריך תשובות סטודנטים.
קיבלת מבחן עם שאלות, תשובות של סטודנט, וגישה לחומרי הלימוד של הקורס (הרצאות ומאמרים).

השתמש בכלי file_search כדי לאחזר את חומרי הלימוד הרלוונטיים, ובדוק כל תשובה **אך ורק** על סמך חומרי הלימוד של הקורס (הרצאות ומאמרים). אל תסתמך על ידע כללי שמחוץ לחומרי הלימוד.
בדוק כל תשובה בקפידה ותן ציון מדויק ומשוב בונה.

החזר תוצאות בפורמט JSON בדיוק:
{
  "total_grade": 85,
  "question_grades": [
    {
      "question_id": 1,
      "grade": 8,
      "max_points": 10,
      "feedback": "משוב קצר על התשובה",
      "correct_answer": "התשובה הנכונה (חשוב לשאלות אמריקאיות)"
    }
  ],
  "overall_feedback": "משוב כללי על הביצוע",
  "recommendations": ["המלצה 1", "המלצה 2"]
}

כללי ניקוד:
- שאלות אמריקאיות ונכון/לא נכון: ניקוד מלא אם נכון, אפס אם לא נכון
- שאלות פתוחות: ניקוד חלקי בהתאם לאיכות התשובה
- אם לא ענה על שאלה — ציין זאת ותן 0 נקודות
- אם לשאלה מצורפת "תשובה לדוגמה" — השתמש בה כקנה מידה לבדיקה, ואמת אותה מול חומרי הלימוד

החזר פלט בפורמט JSON טהור בלבד, ללא בלוקים של קוד (ללא markdown), וללא תגיות json וללא כל טקסט מקדים או עוקב.`;

interface QuestionForGrading {
  id: number;
  type: string;
  question: string;
  options?: string[];
  /** Sample answer for open questions of AI-generated exams */
  model_answer?: string;
  points: number;
}

export async function action({ request }: Route.ActionArgs) {
  const { exam, answers, courseId, examType, questionsSubset } = (await request.json()) as {
    exam: { title: string; questions: QuestionForGrading[] };
    answers: Record<number, string>;
    courseId: string;
    examType?: "past" | "ai" | "mc";
    /**
     * Optional subset of question IDs to grade (open questions only).
     * When present, only these questions are sent for AI grading.
     */
    questionsSubset?: number[];
  };

  if (!exam || !answers) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  const db = createServerClient(request);
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  // When a questionsSubset is provided, only grade those questions (open ones).
  const questionsToGrade = questionsSubset
    ? exam.questions.filter((q) => questionsSubset.includes(q.id))
    : exam.questions;

  // Format the exam and answers for the prompt
  const examText = questionsToGrade
    .map((q) => {
      const answer = answers[q.id] ?? "(לא ענה)";
      const optionsText = q.options ? `\nאפשרויות: ${q.options.join(" | ")}` : "";
      const modelAnswerText = q.model_answer ? `\nתשובה לדוגמה: ${q.model_answer}` : "";
      return `שאלה ${q.id} (${q.points} נקודות, סוג: ${q.type}):
${q.question}${optionsText}${modelAnswerText}
תשובת הסטודנט: ${answer}`;
    })
    .join("\n\n");

  const userMessage = `מבחן: ${exam.title}
קורס: ${courseId}

---
${examText}
---

בדוק את כל התשובות ותן ציון ומשוב.`;

  const response = await client.responses.create({
    model: "gpt-4o",
    text: { format: { type: "json_object" } },
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        // Lectures and articles of this course (source_type is stored in English)
        filters: courseContentFilter(student.id, courseId),
        max_num_results: 50,
      },
    ],
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  // Extract raw text: prefer output_text, fall back to walking the output array
  let rawText = response.output_text?.trim() ?? "";
  if (!rawText && Array.isArray(response.output)) {
    for (const item of response.output as Array<{ type: string; content?: Array<{ type: string; text?: string }> }>) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.trim()) {
            rawText = part.text.trim();
            break;
          }
        }
      }
      if (rawText) break;
    }
  }
  // Parse the JSON (also repairs unescaped quotes in Hebrew abbreviations)
  const gradingResult = parseModelJson(rawText);
  if (gradingResult === undefined) {
    return Response.json(
      { ok: false, error: "לא ניתן לפרסר את תוצאות הבדיקה. נסה שוב." },
      { status: 500 }
    );
  }

  // Record grade in course_stats (fire-and-forget; don't block the response)
  // "mc" exams are treated as "ai" for stats purposes.
  const totalGrade = (gradingResult as { total_grade?: number }).total_grade;
  const statsExamType: "past" | "ai" =
    examType === "past" ? "past" : "ai";
  if (courseId && typeof totalGrade === "number") {
    recordExamResult(
      student.id,
      courseId,
      totalGrade,
      statsExamType,
      request
    ).catch((err) => console.error("[grade-exam] failed to record stats:", err));
  }

  return Response.json({ ok: true, results: gradingResult });
}
