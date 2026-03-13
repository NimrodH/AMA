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

/**
 * Uses GPT-4o to extract plain text from an OpenAI file by its file ID.
 * The file must already be uploaded to OpenAI (e.g. via vector store upload).
 * This is the most reliable extraction path for PDFs that pdf-parse can't handle.
 */
export async function extractTextFromOpenAIFile(fileId: string, topic: string): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            file_id: fileId,
          },
          {
            type: "input_text",
            text: `Extract all text content from this document titled "${topic}". Return only the raw text content, no commentary, no formatting markers, no JSON. Just the plain text exactly as it appears in the document.`,
          },
        ],
      },
    ],
  });

  const text = response.output_text?.trim() ?? "";
  return text;
}

/**
 * Deletes a file from the OpenAI vector store and from OpenAI file storage.
 * Silently succeeds if the file is not found.
 */
export async function deleteFromVectorStore(vectorStoreFileId: string): Promise<void> {
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  try {
    // Remove the file from the vector store (fileId is the vector store file id = the OpenAI file id)
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
