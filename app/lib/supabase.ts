import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for server-side operations (loaders/actions).
 * Uses SUPABASE_PROJECT_URL and SUPABASE_API_KEY env vars set by the Dazl integration.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_API_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing server-side Supabase environment variables (SUPABASE_PROJECT_URL / SUPABASE_API_KEY)"
    );
  }

  return createClient(url, key);
}

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
          source_type: "Lecture" | "Card" | "Past exam";
          lecture_number?: number;
          topic: string;
          language: string;
          upload_date: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          extracted_text?: string | null;
          metadata: Record<string, unknown>;
          vector_store_file_id?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          source_type: "Lecture" | "Card" | "Past exam";
          lecture_number?: number;
          topic: string;
          language: string;
          upload_date: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          extracted_text?: string | null;
          metadata?: Record<string, unknown>;
          vector_store_file_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          course_id?: string;
          source_type?: "Lecture" | "Card" | "Past exam";
          lecture_number?: number;
          topic?: string;
          language?: string;
          upload_date?: string;
          file_url?: string;
          google_docs_url?: string | null;
          content?: string;
          extracted_text?: string | null;
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
