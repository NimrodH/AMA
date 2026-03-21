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
 * Upsert a row for (student_id, course_id) and atomically increment one counter.
 */
export async function incrementCourseStat(
  studentId: string,
  courseId: string,
  field: IncrementField,
  request?: Request
): Promise<void> {
  const db = createServerClient(request);

  // Upsert with conflict target — insert defaults if row doesn't exist,
  // then add 1 to the target field in both cases.
  const { error } = await db.rpc("increment_course_stat", {
    p_student_id: studentId,
    p_course_id: courseId,
    p_field: field,
  });

  if (error) {
    console.error(`[stats] incrementCourseStat(${field}) error:`, error);
  }
}

/**
 * Record the result of a completed & graded exam.
 * Also increments the appropriate attempt counter.
 */
export async function recordExamResult(
  studentId: string,
  courseId: string,
  grade: number,
  examType: "past" | "ai",
  request?: Request
): Promise<void> {
  const db = createServerClient(request);
  const field: IncrementField =
    examType === "past" ? "past_exam_attempts" : "ai_exam_attempts";

  // First ensure the row exists with zeroed counters
  await db
    .from("course_stats")
    .upsert(
      {
        student_id: studentId,
        course_id: courseId,
        learn_sessions: 0,
        past_exam_attempts: 0,
        ai_exam_attempts: 0,
        last_exam_grade: grade,
        last_exam_date: new Date().toISOString(),
        last_exam_type: examType,
      },
      { onConflict: "student_id,course_id", ignoreDuplicates: false }
    );

  // Then read the current counter value and increment it
  const { data: existing } = await db
    .from("course_stats")
    .select(field)
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .single();

  const currentVal = (existing as Record<string, number> | null)?.[field] ?? 0;

  await db
    .from("course_stats")
    .update({
      [field]: currentVal + 1,
      last_exam_grade: grade,
      last_exam_date: new Date().toISOString(),
      last_exam_type: examType,
    })
    .eq("student_id", studentId)
    .eq("course_id", courseId);
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
