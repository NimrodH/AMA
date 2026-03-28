import type { Route } from "./+types/api.delete-exam";
import { getSession } from "~/lib/auth.server";
import { deleteExam } from "~/services/exams.service";

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request);
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { examId } = (await request.json()) as { examId?: string };
  if (!examId) {
    return Response.json({ ok: false, error: "examId is required" }, { status: 400 });
  }

  const success = await deleteExam(examId, session.studentId, request);
  if (!success) {
    return Response.json({ ok: false, error: "Failed to delete exam" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
