const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

/** Save the refresh token to localStorage for session restoration. */
export function saveRefreshToken(refreshToken: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // ignore
  }
}

/** Retrieve the refresh token from localStorage. */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Remove all auth tokens from localStorage AND cookie. */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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

/**
 * Flag to prevent concurrent refresh attempts.
 */
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to restore the session using the stored refresh token.
 * Returns the new access token if successful, null otherwise.
 * Safe to call multiple times — concurrent calls share the same promise.
 */
export async function restoreSession(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  // Deduplicate concurrent calls
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = doRefresh(refreshToken);

  try {
    return await refreshPromise;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/** Tokens returned by the Supabase Auth `/token` endpoint. */
interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

type TokenResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; status: number }; // status 0 = network error / not configured

/**
 * Call the Supabase Auth REST endpoint `/auth/v1/token` directly, so the client
 * bundle does not need `@supabase/supabase-js` just for sign-in and refresh.
 */
async function requestToken(
  grantType: "password" | "refresh_token",
  body: Record<string, string>,
): Promise<TokenResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !supabaseKey) return { ok: false, status: 0 };

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0 };
  }

  if (!res.ok) return { ok: false, status: res.status };
  try {
    const data = (await res.json()) as Partial<AuthTokens>;
    if (!data.access_token || !data.refresh_token) return { ok: false, status: res.status };
    return { ok: true, tokens: { access_token: data.access_token, refresh_token: data.refresh_token } };
  } catch {
    return { ok: false, status: res.status };
  }
}

export type SignInResult = { ok: true } | { ok: false; reason: "invalid" | "error" };

/**
 * Sign in with email and password. On success the tokens are saved
 * (localStorage + cookie). `invalid` means wrong credentials; `error` means
 * a network or server problem.
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const result = await requestToken("password", { email, password });
  if (!result.ok) {
    return { ok: false, reason: result.status >= 400 && result.status < 500 ? "invalid" : "error" };
  }
  saveToken(result.tokens.access_token);
  saveRefreshToken(result.tokens.refresh_token);
  return { ok: true };
}

async function doRefresh(refreshToken: string): Promise<string | null> {
  const result = await requestToken("refresh_token", { refresh_token: refreshToken });

  if (!result.ok) {
    // Auth rejected the refresh token (4xx, not rate limiting): clear everything.
    // Network/server errors keep the stored tokens so a later attempt can succeed.
    if (result.status >= 400 && result.status < 500 && result.status !== 429) clearToken();
    return null;
  }

  // Store the fresh tokens
  saveToken(result.tokens.access_token);
  saveRefreshToken(result.tokens.refresh_token);
  return result.tokens.access_token;
}

/** Refresh the access token when it has less than this many seconds left. */
const EXPIRY_MARGIN_SECONDS = 120;

/** Read the `exp` claim (seconds since epoch) from a JWT, or null if unreadable. */
function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const { exp } = JSON.parse(atob(padded)) as { exp?: number };
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token is expired or will expire within the safety margin. */
export function isTokenExpiring(token: string, marginSeconds = EXPIRY_MARGIN_SECONDS): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return false; // unknown format: let the server decide
  return exp - marginSeconds <= Date.now() / 1000;
}

/**
 * Return an access token that is still valid, refreshing it first when it is
 * expired or about to expire. Returns null when the user is not signed in
 * (no token and no usable refresh token).
 *
 * If the refresh fails for a transient reason (e.g. network), the old token
 * is returned and the server decides; an invalid refresh token clears the
 * stored tokens, so null is returned and callers send the user to /login.
 */
export async function getValidToken(): Promise<string | null> {
  const token = getToken();
  if (token && !isTokenExpiring(token)) return token;

  const refreshed = await restoreSession();
  if (refreshed) return refreshed;

  return getToken();
}
