/**
 * A drop-in replacement for `fetch()` that automatically injects the
 * Authorization header from localStorage on same-origin requests.
 *
 * This is needed because the server's `requireSession` reads the token
 * from either the Authorization header OR the auth_token cookie. The
 * cookie can expire while localStorage still holds a valid token, so
 * we explicitly set the header to guarantee authentication works.
 */
import { getToken } from "~/lib/auth.client";

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getToken();

  if (!token) {
    return fetch(input, init);
  }

  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  headers.set("Authorization", `Bearer ${token}`);

  const newInit: RequestInit = { ...(init ?? {}), headers };

  if (input instanceof Request) {
    return fetch(new Request(input, newInit));
  }

  return fetch(input, newInit);
}
