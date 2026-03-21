/**
 * Client-side auth utilities.
 * Handles localStorage + document.cookie token persistence.
 * The cookie (non-HttpOnly, JS-writable) is readable by the server on every navigation.
 * This module is safe to import from client components.
 */

const STORAGE_KEY = "sb_auth_token";
const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Save JWT to both localStorage and a JS-readable cookie. */
export function saveToken(accessToken: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, accessToken);
  } catch {
    // ignore
  }
  // Write a non-HttpOnly cookie so the server can read it on every request
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(accessToken)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Read token from localStorage (falls back to nothing if unavailable). */
export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Clear token from both localStorage and the cookie. */
export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
