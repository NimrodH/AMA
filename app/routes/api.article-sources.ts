import type { Route } from "./+types/api.article-sources";
import { getSourcesByCourse } from "~/services/sources.service.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") ?? "";
  const courseId = url.searchParams.get("courseId") ?? "";

  if (!studentId || !courseId) {
    return Response.json({ sources: [] });
  }

  const rows = await getSourcesByCourse(studentId, courseId, "Article", request);
  const sources = rows.map((r) => ({ id: r.id, topic: r.topic }));
  return Response.json({ sources });
}
