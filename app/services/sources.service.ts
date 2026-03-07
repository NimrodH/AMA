import { createServerClient } from "~/lib/supabase";
import type { Database } from "~/lib/supabase";
import { uploadToVectorStore } from "~/lib/openai.server";
import type { CourseRow } from "~/services/settings.service";

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const BUCKET_NAME = "sources";

/** Fetch all sources for a student. */
export async function getSources(studentId: string): Promise<SourceRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("sources")
    .select(
      "id, student_id, course_id, source_type, lecture_number, topic, language, upload_date, file_url, content, metadata, vector_store_file_id, created_at"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as SourceRow[];
}

interface AddSourceParams {
  studentId: string;
  courseId: string;
  courseName: string;
  sourceType: "Lecture" | "Card" | "Past exam";
  topic: string;
  lectureNumber: number | null;
  file: File;
}

/**
 * Full upload pipeline:
 * 1. Upload file to Supabase Storage bucket
 * 2. Get the public URL
 * 3. Upload file to OpenAI vector store with metadata
 * 4. Insert source record into the database with both URLs
 */
export async function addSource({
  studentId,
  courseId,
  courseName,
  sourceType,
  topic,
  lectureNumber,
  file,
}: AddSourceParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  // Build a unique storage path: studentId/courseId/timestamp_filename
  const timestamp = Date.now();
  const safeName = file.name.replace(/\s+/g, "_");
  const storagePath = `${studentId}/${courseId}/${timestamp}_${safeName}`;

  // ── 1. Upload file to Supabase Storage ──────────────────────────────────
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return { ok: false, error: `שגיאה בהעלאת הקובץ: ${uploadError.message}` };
  }

  // ── 2. Get the public URL ────────────────────────────────────────────────
  const { data: publicUrlData } = db.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  const fileUrl = publicUrlData.publicUrl;

  // ── 3. Upload to OpenAI vector store with metadata ──────────────────────
  const metadata: Record<string, string> = {
    course_id: courseId,
    course_name: courseName,
    source_type: sourceType,
    topic,
    student_id: studentId,
    file_name: file.name,
  };

  if (lectureNumber !== null) {
    metadata.lecture_number = String(lectureNumber);
  }

  let vectorStoreFileId: string | undefined;
  try {
    vectorStoreFileId = await uploadToVectorStore({
      fileBuffer,
      fileName: file.name,
      metadata,
    });
  } catch (err) {
    // Log but don't block the source creation — the file is already in storage
    console.error("OpenAI vector store upload error:", err);
  }

  // ── 4. Insert source record into the database ───────────────────────────
  const { error: insertError } = await db.from("sources").insert({
    student_id: studentId,
    course_id: courseId,
    source_type: sourceType,
    topic,
    lecture_number: lectureNumber ?? undefined,
    upload_date: new Date().toISOString().split("T")[0],
    language: "he",
    file_url: fileUrl,
    vector_store_file_id: vectorStoreFileId,
    metadata,
  });

  if (insertError) {
    console.error("DB insert error:", insertError);
    return { ok: false, error: `שגיאה בשמירת המקור: ${insertError.message}` };
  }

  return { ok: true };
}

export type { CourseRow };

/** Fetch all courses for a student (used to populate the dialog dropdown). */
export async function getCoursesForStudent(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CourseRow[];
}
