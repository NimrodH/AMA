import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Extract the JWT from a Request's Authorization header or auth_token cookie.
 * Duplicated here (instead of importing from auth.server.ts) because this
 * module is imported by both client and server bundles and React Router v7
 * strips `.server` modules from client builds.
 */
function extractAccessToken(request: Request): string | null {
  // Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Cookie fallback
  const cookie = request.headers.get("Cookie") ?? "";
  const parts = cookie.split(";").map((s) => s.trim());
  for (const part of parts) {
    if (part.startsWith("auth_token=")) {
      return decodeURIComponent(part.slice("auth_token=".length));
    }
    if (part.includes("-auth-token=")) {
      try {
        const raw = decodeURIComponent(part.split("=").slice(1).join("="));
        const parsed = JSON.parse(raw);
        return parsed?.access_token ?? null;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/**
 * Creates a Supabase client for server-side operations (loaders/actions).
 *
 * When a `Request` is passed, the user's JWT is extracted from the
 * `Authorization` header or cookie and injected into the Supabase client
 * so that `auth.uid()` resolves correctly for RLS policies.
 *
 * Without a `Request`, the client uses the anon key only — suitable for
 * unauthenticated / setup endpoints, but **RLS-protected tables will
 * return empty results**.
 */
export function createServerClient(request?: Request): SupabaseClient {
  const url = process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_API_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing server-side Supabase environment variables (SUPABASE_PROJECT_URL / SUPABASE_API_KEY)"
    );
  }

  const accessToken = request ? extractAccessToken(request) : null;

  return createClient(url, key, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type SourceType = "Lecture" | "Card" | "Past exam" | "Article";

export type Database = {
  public: {
    Tables: {
      students: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      courses: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          course_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          course_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          course_name?: string;
          created_at?: string;
        };
      };
      sources: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          source_type: SourceType;
          lecture_number?: number;
          topic: string;
          language: string;
          upload_date: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          metadata: Record<string, unknown>;
          vector_store_file_id?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          source_type: SourceType;
          lecture_number?: number;
          topic: string;
          language: string;
          upload_date: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          metadata?: Record<string, unknown>;
          vector_store_file_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          source_type?: SourceType;
          lecture_number?: number;
          topic?: string;
          language?: string;
          upload_date?: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          metadata?: Record<string, unknown>;
          vector_store_file_id?: string;
          created_at?: string;
        };
      };
      exams: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          exam_content: string;
          student_answers?: string;
          ai_feedback?: string;
          grade?: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          exam_content: string;
          student_answers?: string;
          ai_feedback?: string;
          grade?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          exam_content?: string;
          student_answers?: string;
          ai_feedback?: string;
          grade?: number;
          created_at?: string;
        };
      };
      app_config: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
        };
      };
      reminders: {
        Row: {
          id: string;
          student_id: string;
          reminder_type: string;
          reminder_time: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          reminder_type: string;
          reminder_time: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          reminder_type?: string;
          reminder_time?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      cards: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          title: string;
          topic: string;
          lecture_number?: number;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          title: string;
          topic: string;
          lecture_number?: number;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          title?: string;
          topic?: string;
          lecture_number?: number;
          content?: string;
          created_at?: string;
        };
      };
    };
  };
};
