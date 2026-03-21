import * as React from "react";
import { getToken, saveToken, clearToken } from "~/lib/auth";

/**
 * AuthSync runs on every page load and ensures:
 * 1. If a token exists in localStorage, it's synced to document.cookie
 *    (so the server can read it on SSR/loaders)
 * 2. If localStorage has no token, we're logged out
 *
 * This bridges the gap between client-side localStorage and server-readable cookies.
 */
export function AuthSync() {
  React.useEffect(() => {
    const token = getToken();
    if (token) {
      // Re-sync to cookie in case it expired or was cleared
      saveToken(token);
    }
  }, []);

  return null;
}
