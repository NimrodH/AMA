import type { Route } from "./+types/api.generate-exam-from-source";
import { requireSession } from "~/lib/auth.server";
import { getSourceById } from "~/services/sources.service";
import { saveExam } from "~/services/exams.service";
import { parsePastExam } from "~/services/past-exam.service";

/**
 * Turns a past exam source into an interactive exam.
 *
 * Body: { sourceId, parseOnly? }. With `parseOnly`, the past exam is only
 * parsed and cached (used before generating an AI exam from its structure),
 * without adding it to the saved exams list.
 */
export async function action({ request }: Route.ActionArgs) {
  const { sourceId, parseOnly } = (await request.json()) as { sourceId: string; parseOnly?: boolean };

  if (!sourceId) {
    return Response.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  const source = await getSourceById(sourceId, student.id, request);
  if (!source) {
    return Response.json({ ok: false, error: "מקור לא נמצא" }, { status: 404 });
  }

  if (source.source_type !== "Past exam") {
    return Response.json({ ok: false, error: "המקור אינו מבחן עבר" }, { status: 400 });
  }

  const result = await parsePastExam(source, student.id, request);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }

  if (parseOnly) {
    return Response.json({ ok: true });
  }

  // Save to the exams list (awaited, so it isn't lost when the function ends)
  try {
    await saveExam({
      studentId: student.id,
      courseId: source.course_id,
      title: (result.exam as { title?: string })?.title ?? source.topic,
      examType: "past",
      examContent: result.exam as object,
      request,
    });
  } catch (err) {
    console.warn("[generate-exam-from-source] save exam failed:", err);
  }

  return Response.json({ ok: true, exam: result.exam, sourceTopic: source.topic });
}
