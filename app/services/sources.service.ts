import { createServerClient } from "~/lib/supabase";
import type { Database } from "~/lib/supabase";
import { uploadToVectorStore, deleteFromVectorStore } from "~/lib/openai.server";
import { fetchGoogleDocAsPdf } from "~/lib/google-docs.server";
import type { CourseRow } from "~/services/settings.service";

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const BUCKET_NAME = "sources";

const SOURCE_SELECT_FIELDS =
  "id, student_id, course_id, source_type, lecture_number, topic, language, upload_date, file_url, google_docs_url, content, metadata, vector_store_file_id, extracted_text, created_at";

/** Fetch a single source by ID (must belong to the student). */
export async function getSourceById(id: string, studentId: string): Promise<SourceRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("sources")
    .select(SOURCE_SELECT_FIELDS)
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
  sourceType?: "Lecture" | "Card" | "Past exam" | "Article"
): Promise<SourceRow[]> {
  const db = createServerClient();
  let query = db
    .from("sources")
    .select(SOURCE_SELECT_FIELDS)
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
    .select(SOURCE_SELECT_FIELDS)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as SourceRow[];
}

interface AddSourceParams {
  studentId: string;
  courseId: string;
  courseName: string;
  sourceType: "Lecture" | "Card" | "Past exam" | "Article";
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
      db,
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
      await deleteFromVectorStore({ db, vectorStoreFileId: source.vector_store_file_id });
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

interface AddSourceFromUrlParams {
  studentId: string;
  courseId: string;
  courseName: string;
  sourceType: "Lecture" | "Card" | "Past exam" | "Article";
  topic: string;
  lectureNumber: number | null;
  googleDocsUrl: string;
}

/**
 * Adds a source from a Google Docs URL.
 * Exports the document as PDF, then runs the same Storage → Vector Store → DB pipeline
 * as addSource() so the rest of the app handles it identically.
 */
export async function addSourceFromUrl({
  studentId,
  courseId,
  courseName,
  sourceType,
  topic,
  lectureNumber,
  googleDocsUrl,
}: AddSourceFromUrlParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  // ── Fetch & convert Google Doc to PDF buffer ─────────────────────────────
  let fileBuffer: Buffer;
  let fileName: string;
  let mimeType: string;
  try {
    ({ buffer: fileBuffer, fileName, mimeType } = await fetchGoogleDocAsPdf(googleDocsUrl));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Build a safe storage path using doc ID embedded in the filename
  const timestamp = Date.now();
  const storagePath = `${studentId}/${courseId}/${timestamp}_${fileName}`;

  // ── 1. Upload PDF to Supabase Storage ────────────────────────────────────
  const { error: uploadError } = await db.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
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
    file_name: fileName,
    source_url: googleDocsUrl,
  };

  if (lectureNumber !== null) {
    metadata.lecture_number = String(lectureNumber);
  }

  let vectorStoreFileId: string | undefined;
  try {
    vectorStoreFileId = await uploadToVectorStore({
      db,
      fileBuffer,
      fileName,
      metadata,
    });
  } catch (err) {
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
    google_docs_url: googleDocsUrl,
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

interface RefreshSourceFromGoogleDocsParams {
  sourceId: string;
  studentId: string;
}

/**
 * Re-fetches a Google Docs source and replaces it in-place:
 * 1. Reads google_docs_url from the DB row
 * 2. Downloads the updated doc as PDF
 * 3. Replaces the old Supabase Storage file
 * 4. Replaces the old OpenAI vector store file
 * 5. Updates file_url, vector_store_file_id, and upload_date in the DB
 */
export async function refreshSourceFromGoogleDocs({
  sourceId,
  studentId,
}: RefreshSourceFromGoogleDocsParams): Promise<{ ok: boolean; error?: string; fileStatus?: string; newVectorStoreFileId?: string }> {
  const db = createServerClient();

  // ── 1. Fetch the source row ──────────────────────────────────────────────
  const source = await getSourceById(sourceId, studentId);
  if (!source) return { ok: false, error: "מקור לא נמצא" };
  if (!source.google_docs_url) return { ok: false, error: "למקור זה אין כתובת Google Docs" };

  // ── 2. Re-fetch the Google Doc as PDF ───────────────────────────────────
  let fileBuffer: Buffer;
  let fileName: string;
  let mimeType: string;
  try {
    ({ buffer: fileBuffer, fileName, mimeType } = await fetchGoogleDocAsPdf(source.google_docs_url));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // ── 3. Delete old file from Supabase Storage ─────────────────────────────
  if (source.file_url) {
    try {
      const url = new URL(source.file_url);
      const match = url.pathname.match(/\/object\/public\/[^/]+\/(.+)$/);
      if (match?.[1]) {
        await db.storage.from(BUCKET_NAME).remove([decodeURIComponent(match[1])]);
      }
    } catch (err) {
      console.warn("Could not delete old storage file:", err);
    }
  }

  // ── 4. Upload new PDF to Supabase Storage ────────────────────────────────
  const timestamp = Date.now();
  const newStoragePath = `${studentId}/${source.course_id}/${timestamp}_${fileName}`;

  const { error: uploadError } = await db.storage
    .from(BUCKET_NAME)
    .upload(newStoragePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return { ok: false, error: `שגיאה בהעלאת הקובץ: ${uploadError.message}` };
  }

  const { data: publicUrlData } = db.storage.from(BUCKET_NAME).getPublicUrl(newStoragePath);
  const newFileUrl = publicUrlData.publicUrl;

  // ── 5. Delete old vector store file and re-upload ────────────────────────
  if (source.vector_store_file_id) {
    try {
      await deleteFromVectorStore({ db, vectorStoreFileId: source.vector_store_file_id });
    } catch (err) {
      console.warn("Could not delete old vector store file:", err);
    }
  }

  // Preserve existing metadata, update file_name
  const existingMeta = (source.metadata ?? {}) as Record<string, string>;
  const metadata: Record<string, string> = { ...existingMeta, file_name: fileName };

  let newVectorStoreFileId: string | undefined;
  let fileStatus = "unknown";
  try {
    newVectorStoreFileId = await uploadToVectorStore({ db, fileBuffer, fileName, metadata });
  } catch (err) {
    console.error("Vector store re-upload error:", err);
  }

  // ── 6. Update DB row ──────────────────────────────────────────────────────
  const { error: updateError } = await db
    .from("sources")
    .update({
      file_url: newFileUrl,
      upload_date: new Date().toISOString().split("T")[0],
      vector_store_file_id: newVectorStoreFileId,
    })
    .eq("id", sourceId)
    .eq("student_id", studentId);

  if (updateError) {
    console.error("DB update error:", updateError);
    return { ok: false, error: `הקובץ עודכן אך שגיאה בשמירה: ${updateError.message}` };
  }

  return { ok: true, fileStatus, newVectorStoreFileId };
}

/** Fetch active courses for a student (used to populate the upload dialog dropdown). */
export async function getCoursesForStudent(studentId: string): Promise<CourseRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("courses")
    .select("id, course_id, course_name, is_active")
    .eq("student_id", studentId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CourseRow[];
}
