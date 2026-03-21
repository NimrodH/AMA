import { createServerClient } from "~/lib/supabase";

export type SummaryRow = {
  id: string;
  student_id: string;
  course_id: string;
  content: string;
  updated_at: string;
};

/**
 * Fetch a summary document for a specific student + course.
 * Returns null if none exists yet.
 */
export async function getSummary(
  studentId: string,
  courseId: string,
  request?: Request
): Promise<SummaryRow | null> {
  const db = createServerClient(request);
  const { data, error } = await db
    .from("course_summaries")
    .select("id, student_id, course_id, content, updated_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .single();

  if (error || !data) return null;
  return data as SummaryRow;
}

/**
 * Upsert the summary content for a student + course combination.
 */
export async function saveSummary(
  studentId: string,
  courseId: string,
  content: string,
  request?: Request
): Promise<void> {
  const db = createServerClient(request);
  await db.from("course_summaries").upsert(
    {
      student_id: studentId,
      course_id: courseId,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,course_id" }
  );
}
