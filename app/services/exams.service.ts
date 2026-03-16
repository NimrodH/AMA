import { createServerClient } from "~/lib/supabase";

export type ExamRow = {
  id: string;
  student_id: string | null;
  course_id: string;
  title: string | null;
  exam_type: string | null;
  exam_content: string;
  student_answers: string | null;
  ai_feedback: string | null;
  grade: number | null;
  created_at: string | null;
};

interface SaveExamParams {
  studentId: string;
  courseId: string;
  title: string;
  examType: "ai" | "mc" | "past";
  examContent: object;
}

/**
 * Persist a newly generated exam to the database.
 * Returns the saved exam's ID, or null on failure (non-blocking).
 */
export async function saveExam({
  studentId,
  courseId,
  title,
  examType,
  examContent,
}: SaveExamParams): Promise<string | null> {
  const db = createServerClient();

  const { data, error } = await db
    .from("exams")
    .insert({
      student_id: studentId,
      course_id: courseId,
      title,
      exam_type: examType,
      exam_content: JSON.stringify(examContent),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[exams.service] Failed to save exam:", error.message);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Fetch all saved exams for a given course, newest first.
 */
export async function getExamsByCourse(
  studentId: string,
  courseId: string
): Promise<ExamRow[]> {
  const db = createServerClient();

  const { data, error } = await db
    .from("exams")
    .select("id, student_id, course_id, title, exam_type, exam_content, student_answers, ai_feedback, grade, created_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[exams.service] Failed to fetch exams:", error.message);
    return [];
  }

  return (data ?? []) as ExamRow[];
}
