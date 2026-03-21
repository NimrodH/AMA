const TOKEN_KEY = "auth_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Save the JWT access token to localStorage AND document.cookie. */
export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
  // Write a JS-accessible (non-HttpOnly) cookie so the server sees it on navigation
  document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/** Retrieve the JWT access token from localStorage. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Remove the JWT access token from localStorage AND cookie. */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
  document.cookie = "auth_token=; path=/; max-age=0; samesite=lax";
}

/**
 * Sync localStorage → cookie.
 * Call this early in app boot to restore the cookie if it expired
 * but localStorage still has the token.
 */
export function syncTokenToCookie(): void {
  const token = getToken();
  if (token) {
    document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }
}
