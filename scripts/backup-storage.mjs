// Downloads every file from every Supabase Storage bucket into a local folder.
// Used by .github/workflows/backup.yml; see docs/BACKUP.md.
//
// Usage: node scripts/backup-storage.mjs <output-dir>
// Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Output: <output-dir>/<bucket>/<path...> plus <output-dir>/manifest.json
// (bucket settings and each file's content type, used by restore-storage.mjs).
// Logs only counts and sizes, never file names, because workflow logs are public.

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!outDir || !url || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs <output-dir>");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PAGE = 1000;
const CONCURRENCY = 5;

async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list failed in bucket "${bucket}": ${error.message}`);
    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        files.push(...(await listAll(bucket, itemPath))); // folder
      } else if (item.name !== ".emptyFolderPlaceholder") {
        files.push({ path: itemPath, contentType: item.metadata?.mimetype ?? null, size: item.metadata?.size ?? null });
      }
    }
    if (data.length < PAGE) break;
  }
  return files;
}

async function runPool(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) throw new Error(`listBuckets failed: ${bucketsError.message}`);

const manifest = { createdAt: new Date().toISOString(), buckets: [] };
let totalFiles = 0;
let totalBytes = 0;

for (const bucket of buckets) {
  const files = await listAll(bucket.name);
  let bytes = 0;
  await runPool(files, async (file) => {
    const { data, error } = await supabase.storage.from(bucket.name).download(file.path);
    if (error) throw new Error(`download failed in bucket "${bucket.name}": ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const target = path.join(outDir, bucket.name, ...file.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    bytes += buffer.length;
  });
  manifest.buckets.push({
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? null,
    allowedMimeTypes: bucket.allowed_mime_types ?? null,
    files: files.map(({ path, contentType }) => ({ path, contentType })),
  });
  totalFiles += files.length;
  totalBytes += bytes;
  console.log(`bucket ${manifest.buckets.length}/${buckets.length}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Storage backup done: ${buckets.length} buckets, ${totalFiles} files, ${(totalBytes / 1e6).toFixed(1)} MB`);
