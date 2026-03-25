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
 * Resolves the current session from the request.
 * Returns null if unauthenticated.
 */
export async function getSession(request: Request): Promise<SessionUser | null> {
  // Use the user's own auth client so auth.uid() resolves correctly for RLS
  const userClient = createAuthClient(request);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) return null;

  // Fetch profile using the user's authenticated client — RLS policy allows
  // `id = auth.uid()` which resolves to this user's id via their JWT.
  const { data: profile } = await userClient
    .from("profiles")
    .select("student_id, account_type")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: student } = await userClient
    .from("students")
    .select("name")
    .eq("id", profile.student_id)
    .single();

  return {
    authId: user.id,
    studentId: profile.student_id as string,
    studentName: student?.name ?? "",
    accountType: profile.account_type as "student" | "guest",
  };
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
 * Returns true if the request contains an auth token (cookie or header).
 * Use this to short-circuit server loaders on the initial SSR pass (before
 * the client has injected the token), avoiding unnecessary Supabase round-trips
 * that cause lambda timeouts on published deployments.
 */
export function hasAuthToken(request: Request): boolean {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) return true;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.includes("auth_token=");
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


