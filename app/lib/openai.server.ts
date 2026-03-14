import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: OpenAI | null = null;

const VECTOR_STORE_CONFIG_KEY = "openai_vector_store_id";

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
  if (envId) return envId;

  // 2. Check persistent DB config
  const { data: configRow } = await db
    .from("app_config")
    .select("value")
    .eq("key", VECTOR_STORE_CONFIG_KEY)
    .maybeSingle();

  if (configRow?.value) return configRow.value;

  // 3. Create a new vector store and persist its ID immediately
  const openai = getOpenAIClient();
  const store = await openai.vectorStores.create({
    name: "study-sources",
    expires_after: { anchor: "last_active_at", days: 365 },
  });

  await db.from("app_config").upsert({
    key: VECTOR_STORE_CONFIG_KEY,
    value: store.id,
    updated_at: new Date().toISOString(),
  });

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
 * Deletes a file from the OpenAI vector store and from OpenAI file storage.
 * Silently succeeds if the file is not found.
 */
export async function deleteFromVectorStore({
  db,
  vectorStoreFileId,
}: DeleteFromVectorStoreParams): Promise<void> {
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore(db);

  try {
    // Remove the file from the vector store
    await client.vectorStores.files.delete(vectorStoreFileId, { vector_store_id: vectorStoreId });
    // Also delete the underlying file object from OpenAI storage
    await client.files.delete(vectorStoreFileId);
  } catch (err: unknown) {
    // Ignore 404 — file may have been manually deleted already
    if ((err as { status?: number })?.status !== 404) {
      throw err;
    }
  }
}
