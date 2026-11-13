import type { Route } from "./+types/api.grade-exam";
import { courseContentFilter, getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { recordExamResult } from "~/services/stats.service";
import { getCourseName } from "~/services/settings.service";
import { parseModelJson } from "~/lib/model-json.server";
import { extractOutputText } from "~/lib/exam-ai.server";

const SYSTEM_PROMPT = `אתה בוחן אקדמי מנוסה המעריך תשובות סטודנטים.
קיבלת מבחן עם שאלות, תשובות של סטודנט, וגישה לחומרי הלימוד של הקורס (הרצאות ומאמרים).

השתמש בכלי file_search כדי לאחזר את חומרי הלימוד הרלוונטיים, ובדוק כל תשובה **אך ורק** על סמך חומרי הלימוד של הקורס (הרצאות ומאמרים). אל תסתמך על ידע כללי שמחוץ לחומרי הלימוד.
בדוק כל תשובה בקפידה ותן ציון מדויק ומשוב בונה.

החזר תוצאות בפורמט JSON בדיוק:
{
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
- שאלות פתוחות: ניקוד חלקי בהתאם לאיכות התשובה, בין 0 לניקוד המרבי של השאלה
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

interface QuestionGrade {
  question_id: number;
  grade: number;
  max_points: number;
  feedback: string;
  correct_answer?: string;
}

/**
 * Grades an exam and records the result in the course stats.
 *
 * The browser grades closed questions that have an answer key itself and
 * sends their total as `localScore`; only `questionsSubset` (if given) is
 * graded by the AI. The final score is computed here from the per-question
 * grades — never taken from the model. With an empty `questionsSubset`, no
 * AI call is made and only the stats are recorded.
 */
export async function action({ request }: Route.ActionArgs) {
  const { exam, answers, courseId, examType, questionsSubset, localScore } = (await request.json()) as {
    exam: { title: string; questions: QuestionForGrading[] };
    answers: Record<number, string>;
    courseId: string;
    examType?: "past" | "ai" | "mc";
    /** Question IDs to grade with the AI. When absent, all questions are graded. */
    questionsSubset?: number[];
    /** Points of the questions already graded in the browser */
    localScore?: { earned: number; max: number };
  };

  if (!exam || !Array.isArray(exam.questions) || !answers) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  const questionsToGrade = questionsSubset
    ? exam.questions.filter((q) => questionsSubset.includes(q.id))
    : exam.questions;

  // ── AI grading of the remaining questions ───────────────────────────────
  let questionGrades: QuestionGrade[] = [];
  let overallFeedback = "";
  let recommendations: string[] = [];

  if (questionsToGrade.length > 0) {
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

    const courseName = courseId ? await getCourseName(student.id, courseId, request) : "";
    const userMessage = `מבחן: ${exam.title}
קורס: ${courseName}

---
${examText}
---

בדוק את כל התשובות ותן ציון ומשוב.`;

    let rawText: string;
    try {
      const db = createServerClient(request);
      const vectorStoreId = await getOrCreateVectorStore(db);
      const response = await getOpenAIClient().responses.create({
        model: "gpt-4o",
        text: { format: { type: "json_object" } },
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            // Lectures and articles of this course
            filters: courseContentFilter(student.id, courseId),
            max_num_results: 50,
          },
        ],
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });
      rawText = extractOutputText(response);
    } catch (err) {
      console.error("[grade-exam] OpenAI error:", err);
      return Response.json({ ok: false, error: "שגיאה בתקשורת עם OpenAI — נסה שוב" }, { status: 502 });
    }

    // Parse the JSON (also repairs unescaped quotes in Hebrew abbreviations)
    const result = parseModelJson(rawText) as
      | { question_grades?: Partial<QuestionGrade>[]; overall_feedback?: string; recommendations?: string[] }
      | undefined;
    if (!result || !Array.isArray(result.question_grades)) {
      console.error("[grade-exam] Failed to parse grading JSON:", rawText);
      return Response.json({ ok: false, error: "לא ניתן לפרסר את תוצאות הבדיקה. נסה שוב." }, { status: 500 });
    }

    // One grade per graded question, between 0 and the question's own points
    questionGrades = questionsToGrade.map((q) => {
      const g = result.question_grades!.find((x) => Number(x?.question_id) === q.id);
      const max = Number(q.points) || 0;
      const grade = Math.min(max, Math.max(0, Number(g?.grade) || 0));
      return {
        question_id: q.id,
        grade,
        max_points: max,
        feedback: typeof g?.feedback === "string" ? g.feedback : "השאלה לא נבדקה — נסה לשלוח שוב",
        ...(typeof g?.correct_answer === "string" ? { correct_answer: g.correct_answer } : {}),
      };
    });
    overallFeedback = typeof result.overall_feedback === "string" ? result.overall_feedback : "";
    recommendations = Array.isArray(result.recommendations)
      ? result.recommendations.filter((r): r is string => typeof r === "string")
      : [];
  }

  // ── Final score, computed from the points ──────────────────────────────
  const localEarned = Math.max(0, Number(localScore?.earned) || 0);
  const localMax = Math.max(0, Number(localScore?.max) || 0);
  const earned = localEarned + questionGrades.reduce((s, g) => s + g.grade, 0);
  const max = localMax + questionGrades.reduce((s, g) => s + g.max_points, 0);
  const totalGrade = max > 0 ? Math.round((Math.min(earned, max) / max) * 100) : 0;

  // ── Record in course_stats ("mc" counts as an AI exam) ──────────────────
  // Awaited, so it isn't lost when the serverless function ends.
  if (courseId && max > 0) {
    try {
      await recordExamResult(student.id, courseId, totalGrade, examType === "past" ? "past" : "ai", request);
    } catch (err) {
      console.error("[grade-exam] failed to record stats:", err);
    }
  }

  return Response.json({
    ok: true,
    results: {
      total_grade: totalGrade,
      question_grades: questionGrades,
      overall_feedback: overallFeedback,
      recommendations,
    },
  });
}
