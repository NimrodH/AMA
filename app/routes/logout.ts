import { redirect } from "react-router";
import type { Route } from "./+types/logout";

/**
 * Logout clears the auth cookie (server-side) and redirects to /login.
 * The client-side localStorage token is cleared by the LogoutButton component
 * before this action is triggered.
 */
export async function action({}: Route.ActionArgs) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": "auth_token=; path=/; max-age=0; samesite=lax",
    },
  });
}

export async function loader({}: Route.LoaderArgs) {
  return redirect("/login", {
    headers: {
      "Set-Cookie": "auth_token=; path=/; max-age=0; samesite=lax",
    },
  });
}
