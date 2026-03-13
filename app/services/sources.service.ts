import mammoth from "mammoth";
import { createServerClient } from "~/lib/supabase";
import type { Database } from "~/lib/supabase";
import { uploadToVectorStore, deleteFromVectorStore, extractTextFromOpenAIFile } from "~/lib/openai.server";
import type { CourseRow } from "~/services/settings.service";

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const BUCKET_NAME = "sources";

/** Extract plain text from a file buffer. Supports DOCX and PDF. Returns empty string on failure. */
async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value.trim();
    // Fallback: strip HTML from full conversion (captures text boxes, tables, etc.)
    const htmlResult = await mammoth.convertToHtml({ buffer });
    return htmlResult.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  if (lower.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      if (data.text.trim()) return data.text.trim();
    } catch {
      // pdf-parse failed 
    }
  }
  return "";
}

/** Fetch a single source by ID (must belong to the student). */
export async function getSourceById(id: string, studentId: string): Promise<SourceRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("sources")
    .select(
      "id, student_id, course_id, source_type, lecture_number, topic, language, upload_date, file_url, content, metadata, vector_store_file_id, created_at"
    )
    .eq("id", id)
    .eq("student_id", studentId)
    .single();

  if (error) return null;
  return data as SourceRow;
}

/** Fetch all sources for a student filtered by course and optionally by type. */
export async function getSourcesByCourse(
  studentId: string,
  courseId: string,
  sourceType?: "Lecture" | "Card" | "Past exam"
): Promise<SourceRow[]> {
  const db = createServerClient();
  let query = db
    .from("sources")
    .select(
      "id, student_id, course_id, source_type, lecture_number, topic, language, upload_date, file_url, content, metadata, vector_store_file_id, created_at"
    )
    .eq("student_id", studentId)
    .eq("course_id", courseId);

  if (sourceType) {
    query = query.eq("source_type", sourceType);
  }

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as SourceRow[];
}

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
  // Supabase Storage only allows ASCII-safe key characters.
  // Strip non-alphanumeric chars (keeps dots, hyphens, underscores) and collapse runs.
  const timestamp = Date.now();
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  const baseName = file.name
    .replace(/\.[^.]+$/, "")         // remove extension
    .replace(/[^a-zA-Z0-9_-]/g, "_") // replace non-ASCII & special chars
    .replace(/_+/g, "_")             // collapse multiple underscores
    .replace(/^_|_$/g, "");           // trim leading/trailing underscores
  const safeName = (baseName || "file") + ext;
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

  // ── 4. Extract text content from the file ────────────────────────────────
  let content: string | undefined;
  try {
    content = await extractTextFromBuffer(fileBuffer, file.name);
  } catch (err) {
    console.error("Text extraction error (non-blocking):", err);
  }

  // ── 5. Insert source record into the database ───────────────────────────
  const { error: insertError } = await db.from("sources").insert({
    student_id: studentId,
    course_id: courseId,
    source_type: sourceType,
    topic,
    lecture_number: lectureNumber ?? undefined,
    upload_date: new Date().toISOString().split("T")[0],
    language: "he",
    file_url: fileUrl,
    content: content ?? null,
    vector_store_file_id: vectorStoreFileId,
    metadata,
  });

  if (insertError) {
    console.error("DB insert error:", insertError);
    return { ok: false, error: `שגיאה בשמירת המקור: ${insertError.message}` };
  }

  return { ok: true };
}

/**
 * Full delete pipeline:
 * 1. Fetch the source to get file_url and vector_store_file_id
 * 2. Delete the file from Supabase Storage
 * 3. Delete the vector store file from OpenAI
 * 4. Delete the row from the database
 */
export async function deleteSource(
  id: string,
  studentId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  // 1. Fetch source record
  const source = await getSourceById(id, studentId);
  if (!source) return { ok: false, error: "מקור לא נמצא" };

  // 2. Delete from Supabase Storage (extract path from public URL)
  if (source.file_url) {
    try {
      const url = new URL(source.file_url);
      // Public URL format: .../storage/v1/object/public/<bucket>/<path>
      const match = url.pathname.match(/\/object\/public\/[^/]+\/(.+)$/);
      if (match?.[1]) {
        const storagePath = decodeURIComponent(match[1]);
        await db.storage.from(BUCKET_NAME).remove([storagePath]);
      }
    } catch (err) {
      console.error("Storage delete error:", err);
    }
  }

  // 3. Delete from OpenAI vector store
  if (source.vector_store_file_id) {
    try {
      await deleteFromVectorStore(source.vector_store_file_id);
    } catch (err) {
      console.error("Vector store delete error:", err);
    }
  }

  // 4. Delete the DB row
  const { error } = await db.from("sources").delete().eq("id", id).eq("student_id", studentId);
  if (error) {
    console.error("DB delete error:", error);
    return { ok: false, error: `שגיאה במחיקת המקור: ${error.message}` };
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
