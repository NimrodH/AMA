import OpenAI from "openai";

let _client: OpenAI | null = null;

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

/** Default vector store ID — set via env or will be created on first upload. */
let _vectorStoreId: string | null = process.env.OPENAI_VECTOR_STORE_ID ?? null;

/**
 * Gets or creates the vector store for storing study sources.
 * The store ID is cached in memory and can be pre-set via OPENAI_VECTOR_STORE_ID env var.
 */
export async function getOrCreateVectorStore(): Promise<string> {
  if (_vectorStoreId) return _vectorStoreId;

  const client = getOpenAIClient();
  const store = await client.vectorStores.create({
    name: "study-sources",
  });

  _vectorStoreId = store.id;
  return store.id;
}

interface UploadToVectorStoreParams {
  fileBuffer: Buffer;
  fileName: string;
  metadata: Record<string, string>;
}

/**
 * Uploads a file to an OpenAI vector store with metadata attributes.
 * Returns the vector store file ID for reference.
 */
export async function uploadToVectorStore({
  fileBuffer,
  fileName,
  metadata,
}: UploadToVectorStoreParams): Promise<string> {
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

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
