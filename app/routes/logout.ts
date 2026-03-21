import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { buildClearAuthCookie } from "~/lib/auth.server";

export async function action({}: Route.ActionArgs) {
  return redirect("/login", {
    headers: { "Set-Cookie": buildClearAuthCookie() },
  });
}

// GET redirect (e.g. manual navigation to /logout)
export async function loader({}: Route.LoaderArgs) {
  return redirect("/login", {
    headers: { "Set-Cookie": buildClearAuthCookie() },
  });
}
