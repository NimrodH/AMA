import { createServerClient } from "~/lib/supabase";

export interface CourseStats {
  course_id: string;
  learn_sessions: number;
  past_exam_attempts: number;
  ai_exam_attempts: number;
  last_exam_grade: number | null;
  last_exam_date: string | null;
  last_exam_type: string | null;
}

type IncrementField = "learn_sessions" | "past_exam_attempts" | "ai_exam_attempts";

/**
 * Record the result of a completed & graded exam.
 * Also increments the appropriate attempt counter.
 *
 * The row is created only when it doesn't exist yet (`ignoreDuplicates`), the
 * same way /api/track-learn-session does it. (A plain upsert with zeroed
 * counters used to run here, which reset all of the course's other counters
 * on every graded exam.)
 */
export async function recordExamResult(
  studentId: string,
  courseId: string,
  grade: number,
  examType: "past" | "ai",
  request?: Request
): Promise<void> {
  const db = createServerClient(request);
  const field: IncrementField = examType === "past" ? "past_exam_attempts" : "ai_exam_attempts";

  // Ensure the row exists, without touching an existing one
  await db.from("course_stats").upsert(
    {
      student_id: studentId,
      course_id: courseId,
      learn_sessions: 0,
      past_exam_attempts: 0,
      ai_exam_attempts: 0,
    },
    { onConflict: "student_id,course_id", ignoreDuplicates: true }
  );

  // Read the current counter and increment it, together with the last result
  const { data: existing } = await db
    .from("course_stats")
    .select(field)
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .single();

  const currentVal = (existing as Record<string, number> | null)?.[field] ?? 0;

  const { error } = await db
    .from("course_stats")
    .update({
      [field]: currentVal + 1,
      last_exam_grade: grade,
      last_exam_date: new Date().toISOString(),
      last_exam_type: examType,
    })
    .eq("student_id", studentId)
    .eq("course_id", courseId);

  if (error) console.error("[stats] recordExamResult update error:", error);
}

/**
 * Get stats for all courses of a student.
 */
export async function getAllCourseStats(studentId: string, request?: Request): Promise<CourseStats[]> {
  const db = createServerClient(request);
  const { data, error } = await db
    .from("course_stats")
    .select("*")
    .eq("student_id", studentId)
    .order("course_id");

  if (error) {
    console.error("[stats] getAllCourseStats error:", error);
    return [];
  }

  return (data ?? []) as CourseStats[];
}
