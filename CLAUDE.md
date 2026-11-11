# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AI-assisted study manager (Hebrew UI, RTL). Students upload course sources (lectures, summary cards, past exams, articles), get AI feedback on their summary cards, generate and grade exams, and track learning stats. Deployed on Netlify (`@netlify/vite-plugin-react-router` in `vite.config.ts`). The project was originally scaffolded with Dazl but is no longer managed there; leftovers (`dazl.config.json`, `dazl-prompts/`, `app/dazl-metadata/`, `@dazl/*` packages) remain, and `@dazl/color-scheme` is still used at runtime in `app/root.tsx`.

## Commands

```bash
npm run dev        # dev server (http://localhost:5173)
npm run build      # production build -> build/
npm run start      # serve the production build
npm run typecheck  # react-router typegen && tsc  (the only automated check)
```

There is no test suite and no lint script. Prettier is configured in `package.json` (printWidth 120). Run `npm run typecheck` after changing routes, since route types (`./+types/<route>`) are generated.

Dev-only route: `/dev/components` shows the UI component gallery (`*.example.tsx` files).

## Environment

`.env` (gitignored) needs: `SUPABASE_PROJECT_URL`, `SUPABASE_API_KEY` (anon key, server side), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client side), `OPENAI_API_KEY`. Optional: `OPENAI_VECTOR_STORE_ID`, `GOOGLE_API_KEY`.

`app/lib/openai.ts` is legacy and not imported anywhere; real prompts are inline in the `app/routes/api.*.ts` files. The README lists the Supabase tables, RPC functions and the `sources` storage bucket. `app/lib/supabase.ts` holds hand-written `Database` types that cover only some tables; don't guess table/column names, check the actual schema.

## Architecture

**Stack:** React 19, React Router v7 in framework mode with SSR (`react-router.config.ts`), TypeScript, CSS Modules, Radix UI, Supabase (DB, auth, storage), OpenAI (Responses API + vector store `file_search`), Lexical (rich text), react-pdf. `~/` is the path alias for `app/`.

**Routing:** All routes are registered explicitly in `app/routes.ts` (no file-system routing). Page routes are `app/routes/<name>.tsx`; JSON endpoints are `app/routes/api.<name>.ts` exporting only an `action`/`loader` and returning `Response.json(...)`. Add new routes to `routes.ts`.

**Layering:** routes (loaders/actions) → `app/services/*.service.ts` → Supabase client. All DB access is server-side only; UI components must not touch Supabase. Services take an optional `request` so they can build a user-scoped client. (Some `api.*` routes still query Supabase directly.)

**Auth (non-obvious, spans several files):**
- Supabase Auth with RLS. The server must forward the user's JWT so `auth.uid()` works; `createServerClient(request)` in `app/lib/supabase.ts` does this. Calling it *without* a request gives an anon client that returns empty results on RLS tables (used deliberately for `app_config`).
- Tokens are stored client-side in localStorage plus a non-HttpOnly `auth_token` cookie (`app/lib/auth.client.ts`). The server reads the `Authorization: Bearer` header first, then the cookie.
- `requireSession(request)` / `getSession` in `app/lib/auth.server.ts` resolve the user via the `profiles` table → `studentId` and `accountType` (`"student" | "guest"`). Guest accounts are managed in `guests.service.ts`.
- Protected pages export `clientLoader = makeClientLoader<typeof loader>()` with `clientLoader.hydrate = true` (and optionally `makeClientAction`) from `app/lib/client-auth-loader.ts`. This temporarily patches `fetch` to add the Bearer token and refreshes the session from the stored refresh token when needed.
- Client-side calls to `/api/*` must use `authFetch` (`app/lib/auth-fetch.ts`), not plain `fetch`.
- Token extraction is duplicated in `supabase.ts` and `auth.server.ts` on purpose: `supabase.ts` is imported by both bundles and `.server` modules are stripped from the client build.

**AI pipeline:** `app/lib/openai.server.ts` holds a singleton OpenAI client and one shared vector store. Its ID comes from `OPENAI_VECTOR_STORE_ID`, else the `app_config` table, else a new store is created and saved there. When sources are added, `sources.service.ts` uploads files to the vector store and saves `vector_store_file_id` on the source row. API routes (card feedback, exam generation/grading, MC exams, image transcription) call `client.responses.create` with `gpt-4o` and a `file_search` tool, filtered to the course's/lecture's sources. Prompts are written in Hebrew. Google Docs sources are fetched as PDF via `app/lib/google-docs.server.ts` and can be refreshed (`api.refresh-source`).

**Client state:** the selected course persists in localStorage (`app/hooks/use-selected-course.ts`). Card and summary content is stored as serialized Lexical JSON or plain text; `app/lib/lexical-utils.ts` converts between them.

## Conventions

- Kebab-case file and folder names; one component per file, with a `component-name.module.css` next to it that the component imports.
- Build UI from `app/components/ui/` (Radix-based) before writing new primitives. No Tailwind.
- Style with design tokens from `app/styles/tokens/` and semantic variables in `app/styles/theme.css` (`--space-*`, `--radius-*`, `--shadow-*`, `--color-*`) before using raw values.
- Google Fonts go in the `links` export of `app/root.tsx`, not CSS `@import`.
- Icons from `lucide-react`; check the export exists.
- The `<html>` element is `lang="he" dir="rtl"`; keep layouts RTL-correct.
