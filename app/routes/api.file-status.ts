import type { Route } from "./+types/api.file-status";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";

/**
 * GET /api/file-status?fileId=<vector_store_file_id>
 * Returns the current indexing status of a file in the OpenAI vector store.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return Response.json({ error: "Missing fileId" }, { status: 400 });
  }

  try {
    const db = createServerClient(request);
    const client = getOpenAIClient();
    const vectorStoreId = await getOrCreateVectorStore(db);
    // SDK signature: retrieve(fileId, { vector_store_id })
    const vsFile = await client.vectorStores.files.retrieve(fileId, { vector_store_id: vectorStoreId });
    return Response.json({ status: vsFile.status });
  } catch (err) {
    console.error("file-status error:", err);
    return Response.json({ error: "Failed to retrieve file status" }, { status: 500 });
  }
}
