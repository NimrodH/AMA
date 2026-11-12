import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "~/lib/supabase";

let _client: OpenAI | null = null;

const VECTOR_STORE_CONFIG_KEY = "openai_vector_store_id";

/**
 * Source types whose files hold course content (as stored in `sources.source_type`
 * and in the vector store file attributes). Past exams and summary cards are
 * left out on purpose: exams must not copy past questions, and cards are the
 * student's own notes and may contain mistakes.
 */
export const COURSE_CONTENT_SOURCE_TYPES = ["Lecture", "Article"] as const;

/**
 * file_search filter for a course's content files (lectures and articles) of
 * one student.
 */
export function courseContentFilter(studentId: string, courseId: string) {
  return {
    type: "and" as const,
    filters: [
      { type: "eq" as const, key: "student_id", value: studentId },
      { type: "eq" as const, key: "course_id", value: courseId },
      { type: "in" as const, key: "source_type", value: [...COURSE_CONTENT_SOURCE_TYPES] },
    ],
  };
}

/**
 * Returns a singleton OpenAI client for server-side usage.
 * Uses the OPENAI_API_KEY environment variable.
 */
export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Gets or creates the OpenAI vector store for study sources.
 *
 * Persistence strategy (in priority order):
 * 1. OPENAI_VECTOR_STORE_ID env var  — fast path for pre-configured deployments
 * 2. app_config table in Supabase    — survives server restarts, written on first create
 * 3. Create a new vector store       — only when neither of the above exist, then persists to DB
 *
 * This prevents the previous bug where a server cold-start would silently create an empty
 * vector store, causing all file_search queries to return zero results.
 */
export async function getOrCreateVectorStore(db: SupabaseClient): Promise<string> {
  // 1. Env var takes highest precedence (pre-configured deployments / CI)
  const envId = process.env.OPENAI_VECTOR_STORE_ID;
  if (envId && envId !== "undefined") return envId;

  // 2. Check persistent DB config
  // We MUST use a service role client to bypass RLS, because app_config
  // has a "service role only" policy. The `db` passed in might be a user client.
  const adminDb = createServerClient();

  const { data: configRow, error: fetchError } = await adminDb
    .from("app_config")
    .select("value")
    .eq("key", VECTOR_STORE_CONFIG_KEY)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching vector store from app_config:", fetchError);
  }

  if (configRow?.value) return configRow.value;

  // 3. Create a new vector store and persist its ID immediately
  const openai = getOpenAIClient();
  const store = await openai.vectorStores.create({
    name: "study-sources",
    expires_after: { anchor: "last_active_at", days: 365 },
  });

  const { error: upsertError } = await adminDb.from("app_config").upsert({
    key: VECTOR_STORE_CONFIG_KEY,
    value: store.id,
    updated_at: new Date().toISOString(),
  });
  
  if (upsertError) {
    console.error("Error persisting new vector store ID to app_config:", upsertError);
  }

  return store.id;
}

interface UploadToVectorStoreParams {
  db: SupabaseClient;
  fileBuffer: Buffer;
  fileName: string;
  metadata: Record<string, string>;
}

/**
 * Uploads a file to the OpenAI vector store with metadata attributes.
 * Returns the vector store file ID for reference.
 */
export async function uploadToVectorStore({
  db,
  fileBuffer,
  fileName,
  metadata,
}: UploadToVectorStoreParams): Promise<string> {
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  // 1. Upload the file to OpenAI's file storage
  const blob = new Blob([new Uint8Array(fileBuffer)]);
  const file = await client.files.create({
    file: new File([blob], fileName),
    purpose: "assistants",
  });

  // 2. Attach the file to the vector store with metadata attributes
  const vectorStoreFile = await client.vectorStores.files.create(vectorStoreId, {
    file_id: file.id,
    attributes: metadata,
  });

  return vectorStoreFile.id;
}

interface DeleteFromVectorStoreParams {
  db: SupabaseClient;
  vectorStoreFileId: string;
}

/**
 * Deletes a file from the OpenAI vector store.
 * Silently succeeds if the file is not found.
 *
 * Note: `vectorStoreFileId` is the `vs_...` ID returned when attaching a file
 * to a vector store. It is NOT the same as the underlying `file-...` ID, so we
 * only call `vectorStores.files.delete` here and let OpenAI handle cleanup of
 * the underlying file object.
 */
export async function deleteFromVectorStore({
  db,
  vectorStoreFileId,
}: DeleteFromVectorStoreParams): Promise<void> {
  if (!vectorStoreFileId) return;

  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  if (!vectorStoreId) {
    console.warn("deleteFromVectorStore: could not resolve vector store ID, skipping deletion.");
    return;
  }

  try {
    // Remove the file from the vector store.
    // SDK signature: delete(fileId, { vector_store_id })
    await client.vectorStores.files.delete(vectorStoreFileId, { vector_store_id: vectorStoreId });
  } catch (err: unknown) {
    // Ignore 404 — file may have been manually deleted already
    if ((err as { status?: number })?.status !== 404) {
      throw err;
    }
  }
}
