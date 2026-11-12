# Backups

Supabase's free plan doesn't give you backups you can download. This repo runs its own:
[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs every night at 01:30 UTC and:

1. Dumps the database with the Supabase CLI: `roles.sql`, `schema.sql`, `data.sql` (all tables, including `auth` users).
2. Downloads every file from every Storage bucket (`scripts/backup-storage.mjs`).
3. Packs everything into one archive and **encrypts** it with [age](https://age-encryption.org).
4. Uploads it to a private Cloudflare R2 bucket: `daily/ama-backup-<date>.tar.gz.age`, and on Sundays a copy in `weekly/`.

**Not included:** the OpenAI vector store. It doesn't need a backup: the original files are in the storage backup and can be re-uploaded.

> ⚠️ This repo is **public**. Workflow logs are public, and the backup scripts never print data or file names. Never commit
> backups, `.env` files or the private age key, and never change the workflow to save the backup as a GitHub artifact.

---

## One-time setup

### 1. Create the encryption key (on your computer)

Install age (Windows: `winget install FiloSottile.age`), then run this **outside the repo folder**:

```bash
age-keygen -o ama-backup-key.txt
```

It prints `Public key: age1...`. That public key goes into GitHub (step 4).

`ama-backup-key.txt` is the **private key**. Store its contents in your password manager and keep a second copy offline. **Without
it the backups can't be opened.** Don't keep it in this repo or in a synced folder next to it.

### 2. Create the R2 bucket (Cloudflare dashboard)

1. **R2 → Create bucket**, e.g. `ama-backups`. Leave it private (no public access, no custom domain).
2. In the bucket, go to **Settings → Object lifecycle rules** and add:
   - prefix `daily/`: delete objects after **7 days**
   - prefix `weekly/`: delete objects after **30 days**
3. **R2 → Manage API tokens → Create API token**: permission **Object Read & Write**, limited to that bucket only.
   Copy the **Access Key ID** and **Secret Access Key**.
4. Note your **Account ID** (shown on the R2 overview page).

### 3. Get the Supabase values (Supabase dashboard)

- **Project URL**: Project Settings → API (`https://<ref>.supabase.co`).
- **Service role / secret key**: Project Settings → API Keys. It bypasses RLS, so treat it like a password.
- **Database URL**: click **Connect** at the top → **Session pooler** connection string. Use the pooler, not the
  "Direct connection": on the free plan the direct connection is IPv6-only, and GitHub's runners have no IPv6. Replace
  `[YOUR-PASSWORD]` with the database password. If the password contains special characters such as `@ # / ?`,
  URL-encode them.

### 4. Add the GitHub secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key |
| `SUPABASE_DB_URL` | session pooler connection string with the password |
| `BACKUP_AGE_PUBLIC_KEY` | the `age1...` public key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 token access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | bucket name, e.g. `ama-backups` |

Or from a terminal, where each command asks for the value:

```bash
gh secret set SUPABASE_DB_URL
```

Secrets stay private even though the repo is public.

### 5. Turn it on

GitHub only runs scheduled workflows that are on the **default branch (`main`)**, so merge this to `main` first. Then go to
**Actions → Backup Supabase → Run workflow** to run it once, and check that a file appears in the R2 bucket under `daily/`.

### Good to know

- If a run fails, GitHub emails you.
- GitHub **disables scheduled workflows in public repos after 60 days with no commits**. If you stop working on the project
  for a while, check the Actions tab and re-enable the workflow if needed.
- The nightly database connection also counts as activity, which should keep the free Supabase project from pausing.
- Size: each backup is about the size of your storage files plus the database. Keep the total under R2's 10 GB free tier by
  adjusting the lifecycle days if needed.

---

## Restoring

You'll need: the age private key, `psql` (PostgreSQL client; on Windows install "PostgreSQL" and pick only the command-line
tools, or use WSL), Node, and this repo with `npm install` done.

### 1. Download and decrypt

Download a backup from the R2 dashboard (bucket → `daily/` or `weekly/` → Download), then:

```bash
age -d -i ama-backup-key.txt -o backup.tar.gz ama-backup-2026-11-12_0130.tar.gz.age
```

```bash
mkdir restore && tar -xzf backup.tar.gz -C restore
```

You now have `restore/db/{roles,schema,data}.sql` and `restore/storage/`.

### 2. Restore the database

Restore into an **empty** Supabase project. Use the target project's session pooler URL:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file restore/db/roles.sql --file restore/db/schema.sql --command "SET session_replication_role = replica" --file restore/db/data.sql --dbname "postgresql://...target..."
```

### 3. Restore the files

Use the target project's URL and service role key:

```bash
SUPABASE_URL=https://<new-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore-storage.mjs restore/storage
```

### 4. If the project ref changed, fix the file links

`sources.file_url` stores full public URLs that include the old project address. In the new project's SQL editor:

```sql
update sources
set file_url = replace(file_url, 'https://OLD-REF.supabase.co', 'https://NEW-REF.supabase.co')
where file_url like 'https://OLD-REF.supabase.co%';
```

Then update `.env` and the Netlify environment variables with the new project's URL and keys.

### Test it once

A backup you've never restored is a guess. The free plan allows two projects: create a temporary second one, restore the
latest backup into it, point a local `.env` at it, run `npm run dev` and log in. Then delete the test project.
