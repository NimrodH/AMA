import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates a Supabase client for server-side operations (loaders/actions).
 * Uses SUPABASE_PROJECT_URL and SUPABASE_API_KEY env vars.
 */
export function createServerClient() {
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
          content?: string;
          metadata: Record<string, unknown>;
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
          content?: string;
          metadata?: Record<string, unknown>;
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
          content?: string;
          metadata?: Record<string, unknown>;
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
    };
  };
};
