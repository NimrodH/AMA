import type { Route } from "./+types/api.article-answers";
import { getArticleAnswers } from "~/services/settings.service";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") ?? "";
  const sourceId = url.searchParams.get("sourceId") ?? "";

  if (!studentId || !sourceId) {
    return Response.json({ answers: {} });
  }

  const answers = await getArticleAnswers(studentId, sourceId);
  return Response.json({ answers });
}
