import { createServerClient } from "~/lib/supabase";

export type CardRow = {
  id: string;
  student_id: string;
  course_id: string;
  title: string;
  topic: string;
  lecture_number: number | null;
  content: string;
  created_at: string;
};

/** Fetch all cards for a student, newest first. */
export async function getCards(studentId: string): Promise<CardRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("cards")
    .select("id, student_id, course_id, title, topic, lecture_number, content, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as CardRow[];
}

interface AddCardParams {
  studentId: string;
  courseId: string;
  title: string;
  topic: string;
  lectureNumber: number | null;
  content: string;
}

interface UpdateCardParams {
  id: string;
  title: string;
  topic: string;
  lectureNumber: number | null;
  content: string;
}

/** Update an existing card. */
export async function updateCard({
  id,
  title,
  topic,
  lectureNumber,
  content,
}: UpdateCardParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  const { error } = await db
    .from("cards")
    .update({ title, topic, lecture_number: lectureNumber, content })
    .eq("id", id);

  if (error) {
    console.error("Card update error:", error);
    return { ok: false, error: `שגיאה בעדכון הכרטיס: ${error.message}` };
  }

  return { ok: true };
}

/** Delete a card by id. */
export async function deleteCard(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();
  const { error } = await db.from("cards").delete().eq("id", id);
  if (error) {
    console.error("Card delete error:", error);
    return { ok: false, error: `שגיאה במחיקת הכרטיס: ${error.message}` };
  }
  return { ok: true };
}

/** Insert a new card into the database. */
export async function addCard({
  studentId,
  courseId,
  title,
  topic,
  lectureNumber,
  content,
}: AddCardParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  const { error } = await db.from("cards").insert({
    student_id: studentId,
    course_id: courseId,
    title,
    topic,
    lecture_number: lectureNumber,
    content,
  });

  if (error) {
    console.error("Card insert error:", error);
    return { ok: false, error: `שגיאה בשמירת הכרטיס: ${error.message}` };
  }

  return { ok: true };
}
