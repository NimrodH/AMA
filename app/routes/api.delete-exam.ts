import type { Route } from "./+types/api.delete-exam";
import { getSession } from "~/lib/auth.server";
import { deleteExam } from "~/services/exams.service";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const session = await getSession(request);
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { examId } = (await request.json()) as { examId?: string };
  if (!examId) {
    return Response.json({ ok: false, error: "Missing examId" }, { status: 400 });
  }

  const success = await deleteExam(examId, session.studentId, request);
  return Response.json({ ok: success });
}
