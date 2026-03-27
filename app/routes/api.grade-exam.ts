import type { Route } from "./+types/api.grade-exam";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { requireSession } from "~/lib/auth.server";
import { recordExamResult } from "~/services/stats.service";

const SYSTEM_PROMPT = `אתה בוחן אקדמי מנוסה המעריך תשובות סטודנטים.
קיבלת מבחן עם שאלות, תשובות של סטודנט, וגישה לחומרי ההרצאות של הקורס.

בדוק כל תשובה **אך ורק** על סמך חומרי ההרצאות של הקורס המצורפים. אל תסתמך על ידע כללי שמחוץ לחומרי הלימוד.
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

החזר JSON בלבד, ללא טקסט נוסף.`;

interface QuestionForGrading {
  id: number;
  type: string;
  question: string;
  options?: string[];
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
      return `שאלה ${q.id} (${q.points} נקודות, סוג: ${q.type}):
${q.question}${optionsText}
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
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
        filters: {
          type: "and",
          filters: [
            { type: "eq" as const, key: "student_id", value: student.id },
            { type: "eq" as const, key: "course_id", value: courseId },
            { type: "eq" as const, key: "source_type", value: "הרצאה" },
          ],
        },
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
  // Extract JSON — strip code fences and any prose prefix/suffix
  const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  const jsonStr = codeBlock
    ? codeBlock[1].trim()
    : start !== -1 && end > start
      ? rawText.slice(start, end + 1).trim()
      : rawText;

  let gradingResult: unknown;
  try {
    gradingResult = JSON.parse(jsonStr);
  } catch {
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
