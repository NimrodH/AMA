import type { Route } from "./+types/api.backfill-content";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";
import { extractTextFromOpenAIFile } from "~/lib/openai.server";
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
      // pdf-parse failed — will fall through to OpenAI fallback
    }
  }
  return "";
}

/**
 * POST /api/backfill-content
 * Finds all sources for the current student where `content` is NULL,
 * downloads each file, extracts text, and saves it back to the DB.
 * For PDFs where local parsing fails, falls back to OpenAI file extraction.
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
    .select("id, file_url, topic, vector_store_file_id")
    .eq("student_id", student.id)
    .is("content", null);

  if (fetchError) {
    return Response.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const results: { id: string; topic: string; status: "ok" | "failed"; chars?: number; method?: string }[] = [];

  for (const source of sources ?? []) {
    if (!source.file_url) {
      results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
      continue;
    }

    try {
      // ── Step 1: Try local file parsing ─────────────────────────────────────
      const resp = await fetch(source.file_url);
      if (!resp.ok) {
        console.error(`[backfill] Failed to download ${source.id}: HTTP ${resp.status}`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
        continue;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());

      const urlPath = new URL(source.file_url).pathname;
      const rawName = urlPath.split("/").pop() ?? "file.pdf";
      const fileName = rawName.replace(/^\d+_/, "") || rawName;

      let text = await extractTextFromBuffer(buffer, fileName);
      let method = "local";

      // ── Step 2: Fallback to OpenAI file extraction ──────────────────────────
      if (!text && source.vector_store_file_id) {
        console.log(`[backfill] Local extraction empty for ${source.id}, trying OpenAI file extraction...`);
        try {
          text = await extractTextFromOpenAIFile(source.vector_store_file_id, source.topic ?? fileName);
          method = "openai";
        } catch (aiErr) {
          console.error(`[backfill] OpenAI extraction failed for ${source.id}:`, aiErr);
        }
      }

      if (!text) {
        console.warn(`[backfill] No text extracted for ${source.id} (${fileName}) via any method`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
        continue;
      }

      // ── Step 3: Save to DB ──────────────────────────────────────────────────
      const { error: updateError } = await db
        .from("sources")
        .update({ content: text })
        .eq("id", source.id)
        .eq("student_id", student.id);

      if (updateError) {
        console.error(`[backfill] DB update failed for ${source.id}:`, updateError);
        results.push({ id: source.id, topic: source.topic ?? "", status: "failed" });
      } else {
        console.log(`[backfill] OK ${source.id} via ${method} — ${text.length} chars`);
        results.push({ id: source.id, topic: source.topic ?? "", status: "ok", chars: text.length, method });
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
