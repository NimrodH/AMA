import { createServerClient } from "~/lib/supabase";

export type CardRow = {
  id: string;
  student_id: string;
  course_id: string;
  title: string;
  topic: string;
  lecture_number: number | null;
  card_number: number | null;
  content: string;
  created_at: string;
};

/** Fetch all cards for a student, newest first. */
export async function getCards(studentId: string): Promise<CardRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("cards")
    .select("id, student_id, course_id, title, topic, lecture_number, card_number, content, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as CardRow[];
}

/**
 * Returns the next available card_number for a given course:
 * Math.floor(max(card_number)) + 1 — the smallest integer strictly greater
 * than the largest card number in the course (so 1.1 → 2, 3 → 4).
 * Returns 1 if no numbered cards exist yet.
 */
export async function getNextCardNumber(courseId: string): Promise<number> {
  const db = createServerClient();
  const { data } = await db
    .from("cards")
    .select("card_number")
    .eq("course_id", courseId)
    .not("card_number", "is", null)
    .order("card_number", { ascending: false })
    .limit(1);

  const max = data?.[0]?.card_number ?? 0;
  return Math.floor(Number(max)) + 1;
}

interface AddCardParams {
  studentId: string;
  courseId: string;
  title: string;
  topic: string;
  lectureNumber: number | null;
  cardNumber: number | null;
  content: string;
}

interface UpdateCardParams {
  id: string;
  title: string;
  topic: string;
  lectureNumber: number | null;
  cardNumber: number | null;
  content: string;
}

/** Update an existing card. */
export async function updateCard({
  id,
  title,
  topic,
  lectureNumber,
  cardNumber,
  content,
}: UpdateCardParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  const { error } = await db
    .from("cards")
    .update({ title, topic, lecture_number: lectureNumber, card_number: cardNumber, content })
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
  cardNumber,
  content,
}: AddCardParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  const { error } = await db.from("cards").insert({
    student_id: studentId,
    course_id: courseId,
    title,
    topic,
    lecture_number: lectureNumber,
    card_number: cardNumber,
    content,
  });

  if (error) {
    console.error("Card insert error:", error);
    return { ok: false, error: `שגיאה בשמירת הכרטיס: ${error.message}` };
  }

  return { ok: true };
}
