// Uploads a storage backup made by backup-storage.mjs into a Supabase project.
// Creates missing buckets with their original settings and overwrites existing files.
// See docs/BACKUP.md ("Restoring").
//
// Usage: node scripts/restore-storage.mjs <backup-storage-dir>
// Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (of the project you restore INTO)

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const inDir = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!inDir || !url || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore-storage.mjs <backup-storage-dir>");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = JSON.parse(await readFile(path.join(inDir, "manifest.json"), "utf8"));
const CONCURRENCY = 5;

async function runPool(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

for (const bucket of manifest.buckets) {
  const { data: existing } = await supabase.storage.getBucket(bucket.name);
  if (!existing) {
    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit ?? undefined,
      allowedMimeTypes: bucket.allowedMimeTypes ?? undefined,
    });
    if (error) throw new Error(`createBucket "${bucket.name}" failed: ${error.message}`);
  }

  let done = 0;
  await runPool(bucket.files, async (file) => {
    const body = await readFile(path.join(inDir, bucket.name, ...file.path.split("/")));
    const { error } = await supabase.storage
      .from(bucket.name)
      .upload(file.path, body, { upsert: true, contentType: file.contentType ?? undefined });
    if (error) throw new Error(`upload to "${bucket.name}/${file.path}" failed: ${error.message}`);
    done++;
  });
  console.log(`bucket "${bucket.name}": ${done} files restored`);
}
console.log("Storage restore done.");
