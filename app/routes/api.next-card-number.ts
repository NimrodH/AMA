import type { Route } from "./+types/api.next-card-number";
import { getNextCardNumber } from "~/services/cards.service";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId");

  if (!courseId) {
    return Response.json({ error: "courseId is required" }, { status: 400 });
  }

  const nextNumber = await getNextCardNumber(courseId);
  return Response.json({ nextNumber });
}
