import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

const SUPABASE_URL = process.env.SUPABASE_PROJECT_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_API_KEY ?? "";

/**
 * Creates a Supabase client authenticated with the user's session token
 * extracted from the request's Authorization or Cookie header.
 */
export function createAuthClient(request: Request): SupabaseClient {
  const accessToken = getAccessTokenFromRequest(request);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Pull the JWT from Authorization header or sb-access-token cookie. */
export function getAccessTokenFromRequest(request: Request): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Fall back to cookie
  const cookie = request.headers.get("Cookie") ?? "";
  return extractTokenFromCookie(cookie);
}

function extractTokenFromCookie(cookie: string): string | null {
  // Supabase stores the session in a cookie named sb-<project-ref>-auth-token
  // We also accept our custom auth_token cookie
  const parts = cookie.split(";").map((s) => s.trim());
  for (const part of parts) {
    if (part.startsWith("auth_token=")) {
      return decodeURIComponent(part.slice("auth_token=".length));
    }
    // supabase native cookie (JSON encoded)
    if (part.includes("-auth-token=")) {
      try {
        const raw = decodeURIComponent(part.split("=").slice(1).join("="));
        const parsed = JSON.parse(raw);
        return parsed?.access_token ?? null;
      } catch {
        // ignore parse errors
      }
    }
  }
  return null;
}

export type SessionUser = {
  authId: string;
  studentId: string;
  studentName: string;
  accountType: "student" | "guest";
};

/**
 * Short-lived in-memory cache of resolved sessions, keyed by access token.
 * A warm server instance handles many requests from the same user (every
 * navigation runs a loader), so this skips the auth + profile lookups for
 * repeat requests. Entries never outlive the token's own `exp`.
 */
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX_ENTRIES = 500;
const sessionCache = new Map<string, { session: SessionUser; expiresAt: number }>();

function readCachedSession(token: string): SessionUser | null {
  const entry = sessionCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sessionCache.delete(token);
    return null;
  }
  return entry.session;
}

function writeCachedSession(token: string, session: SessionUser, tokenExpSeconds: number | undefined): void {
  const now = Date.now();
  const tokenExpiresAt = tokenExpSeconds ? tokenExpSeconds * 1000 : now;
  const expiresAt = Math.min(now + SESSION_CACHE_TTL_MS, tokenExpiresAt);
  if (expiresAt <= now) return;

  if (sessionCache.size >= SESSION_CACHE_MAX_ENTRIES) {
    for (const [key, entry] of sessionCache) {
      if (entry.expiresAt <= now) sessionCache.delete(key);
    }
    // Still full: drop the oldest entry (Map keeps insertion order)
    if (sessionCache.size >= SESSION_CACHE_MAX_ENTRIES) {
      const oldestKey = sessionCache.keys().next().value;
      if (oldestKey !== undefined) sessionCache.delete(oldestKey);
    }
  }
  sessionCache.set(token, { session, expiresAt });
}

/**
 * Whether `profiles` can embed `students(name)` in one query (needs a
 * foreign key profiles.student_id → students.id). If PostgREST reports no
 * such relationship we fall back to two queries for the rest of the process.
 */
let profileStudentEmbedSupported = true;

type ProfileInfo = { studentId: string; accountType: "student" | "guest"; studentName: string };

async function loadProfile(client: SupabaseClient, authId: string): Promise<ProfileInfo | null> {
  if (profileStudentEmbedSupported) {
    const { data, error } = await client
      .from("profiles")
      .select("student_id, account_type, students(name)")
      .eq("id", authId)
      .maybeSingle();

    if (!error) {
      if (!data) return null;
      const embedded = (data as { students?: { name?: string } | { name?: string }[] | null }).students;
      const student = Array.isArray(embedded) ? embedded[0] : embedded;
      return {
        studentId: data.student_id as string,
        accountType: data.account_type as "student" | "guest",
        studentName: student?.name ?? "",
      };
    }

    // PGRST200: relationship not found, PGRST201: ambiguous relationship
    if (error.code !== "PGRST200" && error.code !== "PGRST201") return null;
    profileStudentEmbedSupported = false;
  }

  // Fallback: two sequential queries
  const { data: profile } = await client
    .from("profiles")
    .select("student_id, account_type")
    .eq("id", authId)
    .single();

  if (!profile) return null;

  const { data: student } = await client.from("students").select("name").eq("id", profile.student_id).single();

  return {
    studentId: profile.student_id as string,
    accountType: profile.account_type as "student" | "guest",
    studentName: student?.name ?? "",
  };
}

/**
 * Resolves the current session from the request.
 * Returns null if unauthenticated.
 */
export async function getSession(request: Request): Promise<SessionUser | null> {
  const token = getAccessTokenFromRequest(request);
  if (!token) return null;

  const cached = readCachedSession(token);
  if (cached) return cached;

  // Use the user's own auth client so auth.uid() resolves correctly for RLS
  const userClient = createAuthClient(request);

  // getClaims verifies the JWT locally against the project's (cached) JWKS
  // when the project uses asymmetric signing keys; with the legacy shared
  // secret it falls back to a getUser() call, i.e. the previous behaviour.
  let authId: string | undefined;
  let tokenExp: number | undefined;
  try {
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data) return null;
    authId = data.claims.sub;
    tokenExp = data.claims.exp;
  } catch {
    return null;
  }
  if (!authId) return null;

  // Fetch profile using the user's authenticated client — RLS policy allows
  // `id = auth.uid()` which resolves to this user's id via their JWT.
  const profile = await loadProfile(userClient, authId);
  if (!profile) return null;

  const session: SessionUser = {
    authId,
    studentId: profile.studentId,
    studentName: profile.studentName,
    accountType: profile.accountType,
  };
  writeCachedSession(token, session, tokenExp);
  return session;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireSession(request: Request): Promise<SessionUser> {
  const session = await getSession(request);
  if (!session) {
    throw redirect("/login");
  }
  return session;
}

/**
 * Service-role client for admin operations.
 * NOTE: We only have the anon key available (SUPABASE_API_KEY), so this client
 * bypasses RLS only for tables that allow anon access or via SQL functions.
 * For profile lookups use the user's own client instead.
 */
export function createServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_API_KEY ?? "";
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}


