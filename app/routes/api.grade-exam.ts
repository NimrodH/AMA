import type { Route } from "./+types/api.grade-exam";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";
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
  const { exam, answers, courseId, examType } = (await request.json()) as {
    exam: { title: string; questions: QuestionForGrading[] };
    answers: Record<number, string>;
    courseId: string;
    examType?: "past" | "ai";
  };

  if (!exam || !answers) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  const db = createServerClient();
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  // Format the exam and answers for the prompt
  const examText = exam.questions
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

  const rawText = response.output_text?.trim() ?? "";
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null;
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText;

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
  const totalGrade = (gradingResult as { total_grade?: number }).total_grade;
  if (courseId && typeof totalGrade === "number") {
    recordExamResult(
      student.id,
      courseId,
      totalGrade,
      examType ?? "ai"
    ).catch((err) => console.error("[grade-exam] failed to record stats:", err));
  }

  return Response.json({ ok: true, results: gradingResult });
}
