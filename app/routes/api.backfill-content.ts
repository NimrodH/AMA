import type { Route } from "./+types/api.backfill-content";
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
    const pdfParse = (await import("pdf-parse")) as unknown as (
      buf: Buffer
    ) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text.trim();
  }
  return buffer.toString("utf-8").trim();
}

/**
 * POST /api/backfill-content
 * Finds all sources for the current student where `content` is NULL,
 * downloads each file, extracts text, and saves it back to the DB.
 */
export async function action({ request: _request }: Route.ActionArgs) {
  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  const db = createServerClient();

  // Fetch all sources that are missing content
  const { data: sources, error: fetchError } = await db
    .from("sources")
    .select("id, file_url, topic")
    .eq("student_id", student.id)
    .is("content", null);

  if (fetchError) {
    return Response.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const results: { id: string; topic: string; status: "ok" | "failed"; chars?: number }[] = [];

  for (const source of sources ?? []) {
    if (!source.file_url) {
      results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
      continue;
    }

    try {
      // Download the file
      const resp = await fetch(source.file_url);
      if (!resp.ok) {
        console.error(`[backfill] Failed to download ${source.id}: HTTP ${resp.status}`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
        continue;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());

      // Determine filename from URL
      const urlPath = new URL(source.file_url).pathname;
      const rawName = urlPath.split("/").pop() ?? "file.pdf";
      const fileName = rawName.replace(/^\d+_/, "") || rawName;

      // Extract text
      const text = await extractTextFromBuffer(buffer, fileName);

      if (!text) {
        console.warn(`[backfill] No text extracted for ${source.id} (${fileName})`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
        continue;
      }

      // Update DB
      const { error: updateError } = await db
        .from("sources")
        .update({ content: text })
        .eq("id", source.id)
        .eq("student_id", student.id);

      if (updateError) {
        console.error(`[backfill] DB update failed for ${source.id}:`, updateError);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
      } else {
        console.log(`[backfill] OK ${source.id} — ${text.length} chars`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "ok", chars: text.length });
      }
    } catch (err) {
      console.error(`[backfill] Error processing ${source.id}:`, err);
      results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
    }
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return Response.json({ ok: true, results, succeeded, failed });
}
