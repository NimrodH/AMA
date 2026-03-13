import type { Route } from "./+types/api.reupload-source";
import { getOpenAIClient, getOrCreateVectorStore, uploadToVectorStore, deleteFromVectorStore, extractTextFromOpenAIFile } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";
import mammoth from "mammoth";

async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value.trim();
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
      // pdf-parse failed — caller should fall back to OpenAI
    }
  }
  return "";
}

/**
 * POST /api/reupload-source
 * Body: { sourceId: string }
 *
 * Re-uploads an existing source to the OpenAI vector store:
 * 1. Fetches the source record from DB
 * 2. Downloads the file from Supabase Storage
 * 3. Deletes the old vector store file (if any)
 * 4. Re-uploads the file to OpenAI with correct metadata
 * 5. Updates the DB with the new vector_store_file_id
 */
export async function action({ request }: Route.ActionArgs) {
  const { sourceId } = (await request.json()) as { sourceId: string };

  if (!sourceId) {
    return Response.json({ ok: false, error: "Missing sourceId" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  const db = createServerClient();

  // ── 1. Fetch the source ────────────────────────────────────────────────────
  const { data: source, error: fetchError } = await db
    .from("sources")
    .select("id, student_id, course_id, source_type, lecture_number, topic, file_url, vector_store_file_id, metadata")
    .eq("id", sourceId)
    .eq("student_id", student.id)
    .single();

  if (fetchError || !source) {
    return Response.json({ ok: false, error: "Source not found" }, { status: 404 });
  }

  if (!source.file_url) {
    return Response.json({ ok: false, error: "Source has no file URL" }, { status: 400 });
  }

  // ── 2. Download the file from Supabase Storage ────────────────────────────
  let fileBuffer: Buffer;
  let fileName: string;
  try {
    const resp = await fetch(source.file_url);
    if (!resp.ok) {
      return Response.json(
        { ok: false, error: `Failed to download file: HTTP ${resp.status}` },
        { status: 500 }
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuf);

    // Extract the file name from the URL
    const urlPath = new URL(source.file_url).pathname;
    const rawName = urlPath.split("/").pop() ?? "file.pdf";
    // Strip the timestamp prefix (e.g. "1772906527468_file.pdf" → "file.pdf")
    fileName = rawName.replace(/^\d+_/, "") || rawName;
  } catch (err) {
    console.error("File download error:", err);
    return Response.json({ ok: false, error: "Failed to download file from storage" }, { status: 500 });
  }

  // ── 3. Delete the old vector store file ───────────────────────────────────
  if (source.vector_store_file_id) {
    try {
      await deleteFromVectorStore(source.vector_store_file_id);
      console.log(`Deleted old vector store file: ${source.vector_store_file_id}`);
    } catch (err) {
      // Log but continue — file may already be deleted in OpenAI
      console.warn("Could not delete old vector store file:", err);
    }
  }

  // ── 4. Build metadata and re-upload ───────────────────────────────────────
  // Fetch course name from courses table
  const { data: courseRow } = await db
    .from("courses")
    .select("course_name")
    .eq("course_id", source.course_id)
    .eq("student_id", student.id)
    .single();

  const courseName = courseRow?.course_name ?? source.course_id;

  const metadata: Record<string, string> = {
    course_id: source.course_id,
    course_name: courseName,
    source_type: source.source_type ?? "Lecture",
    topic: source.topic ?? "",
    student_id: student.id,
    file_name: fileName,
  };

  if (source.lecture_number !== null && source.lecture_number !== undefined) {
    metadata.lecture_number = String(source.lecture_number);
  }

  let newVectorStoreFileId: string;
  try {
    newVectorStoreFileId = await uploadToVectorStore({ fileBuffer, fileName, metadata });
    console.log(`Re-uploaded to vector store. New file ID: ${newVectorStoreFileId}`);
  } catch (err) {
    console.error("Vector store upload error:", err);
    return Response.json(
      { ok: false, error: `Failed to upload to OpenAI: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // ── 5. Extract text content ─────────────────────────────────────────────────
  let content: string | undefined;
  try {
    content = await extractTextFromBuffer(fileBuffer, fileName);
  } catch (err) {
    console.warn("Local text extraction failed, will try OpenAI fallback:", err);
  }

  // Fallback: use OpenAI to extract text from the newly uploaded file
  if (!content) {
    try {
      console.log(`[reupload] Local extraction empty, trying OpenAI file extraction for ${newVectorStoreFileId}...`);
      content = await extractTextFromOpenAIFile(newVectorStoreFileId, source.topic ?? fileName);
    } catch (err) {
      console.warn("OpenAI text extraction fallback also failed:", err);
    }
  }

  const { error: updateError } = await db
    .from("sources")
    .update({ vector_store_file_id: newVectorStoreFileId, content: content ?? null })
    .eq("id", sourceId)
    .eq("student_id", student.id);

  if (updateError) {
    console.error("DB update error:", updateError);
    return Response.json(
      { ok: false, error: `File uploaded but DB update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  // ── 6. Verify the file was indexed ────────────────────────────────────────
  let fileStatus = "unknown";
  try {
    const client = getOpenAIClient();
    const vectorStoreId = await getOrCreateVectorStore();
    const vsFile = await client.vectorStores.files.retrieve(newVectorStoreFileId, { vector_store_id: vectorStoreId });
    fileStatus = vsFile.status;
  } catch (err) {
    console.warn("Could not verify file status:", err);
  }

  return Response.json({
    ok: true,
    newVectorStoreFileId,
    fileStatus,
    message: `Source successfully re-uploaded. File ID: ${newVectorStoreFileId}, status: ${fileStatus}`,
  });
}
