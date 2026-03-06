import { createServerClient } from "~/lib/supabase";
import type { Database } from "~/lib/supabase";
import type { CourseRow } from "~/services/settings.service";

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

/** Fetch all sources for a student. */
export async function getSources(studentId: string): Promise<SourceRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("sources")
    .select(
      "id, student_id, course_id, source_type, lecture_number, topic, language, upload_date, file_url, content, metadata, created_at"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as SourceRow[];
}

/** Add a new source record. */
export async function addSource(
  studentId: string,
  courseId: string,
  sourceType: "Lecture" | "Card" | "Past exam",
  topic: string,
  lectureNumber: number | null
): Promise<void> {
  const db = createServerClient();
  await db.from("sources").insert({
    student_id: studentId,
    course_id: courseId,
    source_type: sourceType,
    topic,
    lecture_number: lectureNumber ?? undefined,
    upload_date: new Date().toISOString().split("T")[0],
    language: "he",
    metadata: {},
  });
}

export type { CourseRow };

/** Fetch all courses for a student (used to populate the dialog dropdown). */
export async function getCoursesForStudent(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CourseRow[];
}
