import type { Route } from "./+types/api.cards-to-lecture";
import { requireSession } from "~/lib/auth.server";
import { getStudentById, getActiveCourses } from "~/services/settings.service";
import { getCards } from "~/services/cards.service";
import { addSourceFromText, getSourcesByCourse, deleteSource } from "~/services/sources.service";
import { fromEditorState } from "~/lib/lexical-utils";

/** The topic prefix used for cards-summary sources. */
const CARDS_SUMMARY_TOPIC_PREFIX = "סיכום כרטיסים - ";

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const body = await request.json() as { courseId: string };
  const { courseId } = body;

  if (!courseId) {
    return Response.json({ ok: false, error: "חסר מזהה קורס" }, { status: 400 });
  }

  // Resolve student
  const student = await getStudentById(session.studentId, request);
  if (!student) {
    return Response.json({ ok: false, error: "תלמיד לא נמצא" }, { status: 404 });
  }

  // Get course name for metadata
  const courses = await getActiveCourses(student.id, request);
  const course = courses.find((c) => c.course_id === courseId);
  if (!course) {
    return Response.json({ ok: false, error: "קורס לא נמצא" }, { status: 404 });
  }

  // ── Delete previous cards-summary source for this course (override) ────
  const existingSources = await getSourcesByCourse(student.id, courseId, undefined, request);
  const previousSummary = existingSources.find(
    (s) => s.topic === `${CARDS_SUMMARY_TOPIC_PREFIX}${course.course_name}`
  );

  if (previousSummary) {
    await deleteSource(previousSummary.id, student.id, request);
  }

  // Get all cards for this course
  const allCards = await getCards(student.id, request);
  const courseCards = allCards.filter((c) => c.course_id === courseId);

  if (courseCards.length === 0) {
    return Response.json({ ok: false, error: "אין כרטיסים לקורס זה" }, { status: 400 });
  }

  // Sort cards by card_number (nulls last), then by created_at
  const sorted = [...courseCards].sort((a, b) => {
    if (a.card_number != null && b.card_number != null) {
      return a.card_number - b.card_number;
    }
    if (a.card_number != null) return -1;
    if (b.card_number != null) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Build the combined text document
  const sections = sorted.map((card, index) => {
    const plainContent = fromEditorState(card.content);
    const header = card.card_number
      ? `כרטיס ${card.card_number}`
      : `כרטיס ${index + 1}`;
    const lecturePart = card.lecture_number ? ` | הרצאה ${card.lecture_number}` : "";
    const topicPart = card.topic ? ` | ${card.topic}` : "";

    return [
      `=== ${header}${lecturePart}${topicPart} ===`,
      "",
      `שאלה: ${card.title}`,
      "",
      plainContent,
      "",
    ].join("\n");
  });

  const documentTitle = `סיכום כרטיסים - ${course.course_name}`;
  const fullText = [
    documentTitle,
    `נוצר בתאריך: ${new Date().toLocaleDateString("he-IL")}`,
    `מספר כרטיסים: ${sorted.length}`,
    "",
    "─".repeat(40),
    "",
    ...sections,
  ].join("\n");

  // Create the source as a Lecture type
  const result = await addSourceFromText({
    studentId: student.id,
    courseId,
    courseName: course.course_name,
    sourceType: "Lecture",
    topic: `סיכום כרטיסים - ${course.course_name}`,
    lectureNumber: null,
    textContent: fullText,
    fileName: `cards-summary-${courseId}.txt`,
    request,
  });

  return Response.json(result);
}
