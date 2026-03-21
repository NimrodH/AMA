import type { Route } from "./+types/api.refresh-source";
import { requireSession } from "~/lib/auth.server";
import { refreshSourceFromGoogleDocs } from "~/services/sources.service";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";

/**
 * POST /api/refresh-source
 * Body: { sourceId: string }
 *
 * Re-fetches the linked Google Doc, replaces the Supabase Storage file and the
 * OpenAI vector store file, then returns the new file status for the UI to poll.
 */
export async function action({ request }: Route.ActionArgs) {
  const { sourceId } = (await request.json()) as { sourceId: string };

  if (!sourceId) {
    return Response.json({ ok: false, error: "Missing sourceId" }, { status: 400 });
  }

  const session = await requireSession(request);
  const student = { id: session.studentId };

  const result = await refreshSourceFromGoogleDocs({
    sourceId,
    studentId: student.id,
    request,
  });

  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }

  // Attempt to verify the initial indexing status from OpenAI
  let fileStatus = result.fileStatus ?? "unknown";
  if (result.newVectorStoreFileId) {
    try {
      const db = createServerClient(request);
      const client = getOpenAIClient();
      const vectorStoreId = await getOrCreateVectorStore(db);
      const vsFile = await client.vectorStores.files.retrieve(result.newVectorStoreFileId, {
        vector_store_id: vectorStoreId,
      });
      fileStatus = vsFile.status;
    } catch (err) {
      console.warn("Could not verify file status after refresh:", err);
    }
  }

  return Response.json({
    ok: true,
    newVectorStoreFileId: result.newVectorStoreFileId,
    fileStatus,
    message: `Source refreshed from Google Docs. Status: ${fileStatus}`,
  });
}
