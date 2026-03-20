import { createServerClient } from "~/lib/supabase";

export type CourseRow = {
  id: string;
  course_id: string;
  course_name: string;
  is_active: boolean;
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

/** Fetch all courses for a student (settings page — includes inactive). */
export async function getCourses(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name, is_active")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CourseRow[];
}

/** Fetch only active courses for a student (used in all selection dropdowns). */
export async function getActiveCourses(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name, is_active")
    .eq("student_id", studentId)
    .eq("is_active", true)
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

/** Toggle a course's active state. */
export async function toggleCourse(id: string, isActive: boolean): Promise<void> {
  const db = createServerClient();
  await db.from("courses").update({ is_active: isActive }).eq("id", id);
}

/**
 * Cascade-delete a course and all its associated cards, sources, and exams.
 * Matches by course_id string + student_id since those tables don't FK to courses.id.
 */
export async function deleteCourse(
  id: string,
  studentId: string,
  courseId: string
): Promise<void> {
  const db = createServerClient();
  // Delete dependent records first
  await Promise.all([
    db.from("cards").delete().eq("student_id", studentId).eq("course_id", courseId),
    db.from("sources").delete().eq("student_id", studentId).eq("course_id", courseId),
    db.from("exams").delete().eq("student_id", studentId).eq("course_id", courseId),
  ]);
  // Then delete the course row itself
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

// ─── Article Analysis Questions ──────────────────────────────────────────────

export type ArticleQuestionRow = {
  id: string;
  question: string;
  sort_order: number;
};

/** Fetch all article analysis questions for a student. */
export async function getArticleQuestions(studentId: string): Promise<ArticleQuestionRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("article_analysis_questions")
    .select("id, question, sort_order")
    .eq("student_id", studentId)
    .order("sort_order", { ascending: true });

  if (error) return [];
  return (data ?? []) as ArticleQuestionRow[];
}

/** Add a new article analysis question. */
export async function addArticleQuestion(
  studentId: string,
  question: string,
  sortOrder: number
): Promise<void> {
  const db = createServerClient();
  await db.from("article_analysis_questions").insert({
    student_id: studentId,
    question,
    sort_order: sortOrder,
  });
}

/** Delete an article analysis question by its primary key. */
export async function deleteArticleQuestion(id: string): Promise<void> {
  const db = createServerClient();
  await db.from("article_analysis_questions").delete().eq("id", id);
}

// ─── Article Analysis Answers ────────────────────────────────────────────────

/** Map of question_id → answer text for a single article. */
export type ArticleAnswersMap = Record<string, string>;

/** Fetch saved answers for a given source (article). Returns {} if none yet. */
export async function getArticleAnswers(
  studentId: string,
  sourceId: string
): Promise<ArticleAnswersMap> {
  const db = createServerClient();
  const { data, error } = await db
    .from("article_analysis_answers")
    .select("answers")
    .eq("student_id", studentId)
    .eq("source_id", sourceId)
    .single();

  if (error || !data) return {};
  return (data.answers ?? {}) as ArticleAnswersMap;
}

/** Upsert the full answers map for a source. */
export async function saveArticleAnswers(
  studentId: string,
  sourceId: string,
  answers: ArticleAnswersMap
): Promise<void> {
  const db = createServerClient();
  await db.from("article_analysis_answers").upsert(
    {
      student_id: studentId,
      source_id: sourceId,
      answers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,source_id" }
  );
}
