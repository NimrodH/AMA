import { createServerClient } from "~/lib/supabase";

export type CourseRow = {
  id: string;
  course_id: string;
  course_name: string;
};

export type ReminderRow = {
  id: string;
  reminder_type: string;
  reminder_time: string;
  is_active: boolean;
};

export type StudentRow = {
  id: string;
  name: string;
};

/** Fetch the first student in the table (single-student app). */
export async function getStudent(): Promise<StudentRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("students")
    .select("id, name")
    .limit(1)
    .single();

  if (error) return null;
  return data as StudentRow;
}

/** Update student name. */
export async function updateStudentName(id: string, name: string): Promise<void> {
  const db = createServerClient();
  await db.from("students").update({ name }).eq("id", id);
}

/** Fetch all courses for a student. */
export async function getCourses(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CourseRow[];
}

/** Add a new course. */
export async function addCourse(
  studentId: string,
  courseId: string,
  courseName: string
): Promise<void> {
  const db = createServerClient();
  await db.from("courses").insert({
    student_id: studentId,
    course_id: courseId,
    course_name: courseName,
  });
}

/** Delete a course by its primary key. */
export async function deleteCourse(id: string): Promise<void> {
  const db = createServerClient();
  await db.from("courses").delete().eq("id", id);
}

/** Fetch all reminders for a student. */
export async function getReminders(studentId: string): Promise<ReminderRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("reminders")
    .select("id, reminder_type, reminder_time, is_active")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as ReminderRow[];
}

/** Add a new reminder. */
export async function addReminder(
  studentId: string,
  reminderType: string,
  reminderTime: string
): Promise<void> {
  const db = createServerClient();
  await db.from("reminders").insert({
    student_id: studentId,
    reminder_type: reminderType,
    reminder_time: reminderTime,
    is_active: true,
  });
}

/** Toggle reminder active state. */
export async function toggleReminder(id: string, isActive: boolean): Promise<void> {
  const db = createServerClient();
  await db.from("reminders").update({ is_active: isActive }).eq("id", id);
}

/** Delete a reminder by its primary key. */
export async function deleteReminder(id: string): Promise<void> {
  const db = createServerClient();
  await db.from("reminders").delete().eq("id", id);
}
