import type { Route } from "./+types/api.summaries";
import { requireSession } from "~/lib/auth.server";
import { getSummary } from "~/services/summaries.service";

/**
 * GET /api/summaries?courseId=xxx
 * Returns the serialized editor state for the current student + course.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId") ?? "";

  if (!courseId) {
    return Response.json({ content: "" });
  }

  const summary = await getSummary(session.studentId, courseId, request);
  return Response.json({ content: summary?.content ?? "" });
}
