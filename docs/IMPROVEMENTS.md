# Pending improvements and fixes

Improvements and fixes that were proposed but **not implemented yet**. Each item has a short ID so it can be referred to directly (for example: "implement P2-2"). When an item is done, delete it from this file in the same change.

Status as of 2026-11-15 (`main` and `develop` at `5d8faef`).

## Speed: page loading and navigation

Context: the original speed plan had four phases. Phase 1 (session/query fixes), the shared layout route (`app/routes/app-shell.tsx`) and the expired-token refresh are already done. Local measurements after phase 1: a page's data request takes about 200–750 ms.

### P1-1. Check the Netlify Functions and Supabase regions

- **What:** confirm that the Netlify server function runs in, or close to, the same region as the Supabase project. Every page load makes several server-to-Supabase round trips, so a cross-region setup (for example US functions with an EU database) adds about 100–150 ms to each one.
- **Where:** Netlify dashboard → Site configuration → Functions → region. Supabase dashboard → Project settings → region.
- **Notes:** a settings change only, no code change.

### P2-1. Prefetch pages on hover

- **What:** add `prefetch="intent"` to the sidebar `NavLink`s, so a page's code and data start loading when the pointer hovers over a link, before the click.
- **Where:** `app/components/layout/app-sidebar.tsx`.
- **Notes:** each hover can start a server request, which means more Netlify function invocations. Data loaders that are expensive (for example the sources list) could use `prefetch="render"` for code only, or no prefetch.

### P2-2. Navigation progress bar

- **What:** a thin top progress bar while a navigation is pending (`useNavigation().state !== "idle"`), so a slow page change gives instant feedback instead of looking stuck.
- **Where:** a new component under `app/components/`, rendered once in `app/routes/app-shell.tsx`.

### P3-1. Remove supabase-js from the client bundle

- **What:** `auth.client` is the biggest chunk loaded on every page (about 177 KB). It pulls in the whole Supabase client only for sign-in and token refresh. Replace it with direct `fetch` calls to the Supabase Auth REST endpoints (`/auth/v1/token?grant_type=password` and `?grant_type=refresh_token`), or move sign-in and refresh to the server.
- **Where:** `app/lib/auth.client.ts`, `app/routes/login.tsx`, and anything else that imports supabase-js on the client.

### P3-2. Lazy-load the Lexical code-highlighting module (Prism)

- **What:** `LexicalCodePrism` is about 245 KB and is bundled with the rich text editor. Load it only when a code block is used, or drop code highlighting if it isn't needed.
- **Where:** `app/components/rich-text-editor/`.

### P3-3. Self-host the fonts

- **What:** Rubik and Heebo come from Google Fonts, which adds a connection to two more domains before the text renders. Serve them from `public/` with `font-display: swap` and preload the main weight.
- **Where:** the `links` export of `app/root.tsx` (the project convention puts fonts there), `public/`.

### P4-1. Reduce cold-start time of the server function

- **What:** the first request after the function has been idle loads all server modules. Check which heavy server-only imports (for example `openai`, `mammoth`, `pdf-parse`) are loaded at module level, and import them dynamically inside the routes that use them.
- **Where:** `app/lib/openai.server.ts`, `app/services/past-exam.service.ts`, `app/services/sources.service.ts`.

## AI exams

Context: the high- and medium-priority fixes from the exam review are done (grading searches the course material, articles are used, the answer key, JSON mode, structure fitting, score in code, stats reset fix). Shared helpers are in `app/lib/exam-ai.server.ts`, `app/lib/model-json.server.ts`, `app/lib/exam-answer-key.server.ts` and `app/services/past-exam.service.ts`.

### E-1. Verify generation time against the Netlify function time limit

- **What:** generating an AI exam took 27–39 s locally (one more short call when questions are missing). Check the live site's function time limit and measure real generation times there. If requests are cut off (the exams page then shows "השרת לא הספיק לסיים את הבקשה בזמן"), options are: Netlify background functions with polling, streaming the response, or splitting generation into smaller requests (for example per lecture).
- **Where:** Netlify function logs; `app/routes/api.generate-exam-from-course.ts`, `app/routes/api.generate-mc-exam.ts`.

### E-2. Untested paths of the reliability fixes

- **What:** two paths were not exercised by a real test:
  1. Generating an AI exam for a course whose past exam was never parsed: the server answers `needsPastExamParse`, the exams page parses it (`/api/generate-exam-from-source` with `parseOnly`) and retries.
  2. The timeout message on the exams page (`readApiJson` in `app/routes/exams.tsx`).
- **Notes:** test 1 with a course that has a newly uploaded past exam that was not opened with "הצג כבחינה".

### E-3. Structured outputs with a JSON schema

- **What:** the AI routes use JSON mode (`json_object`), which guarantees valid JSON but not its shape. Use `text.format` of type `json_schema` (strict) with a schema for the exam and for grading results, and drop most of the manual shape checks.
- **Where:** `app/routes/api.generate-exam-from-course.ts`, `api.generate-mc-exam.ts`, `api.grade-exam.ts`, `app/services/past-exam.service.ts`, `app/lib/exam-ai.server.ts`.
- **Notes:** check that strict schemas work together with the `file_search` tool for the model used.

### E-4. Let the student choose the exam's sources

- **What:** an option on the exams page to build the exam from lectures, articles or both, or from selected sources only, instead of always all of the course's lectures and articles.
- **Where:** `app/routes/exams.tsx` (UI), the generation routes, `courseContentFilter` in `app/lib/openai.server.ts` (an extra filter on source ids or types).

### E-5. Source citation for each question

- **What:** ask the model to add the lecture or article each question is based on (for example a `source` field), and show it with the results. It helps the student review, and makes wrong questions easy to trace.
- **Where:** the system prompts of the generation routes, `app/lib/exam-ai.server.ts` (`ExamQuestion`), the results view in `app/routes/exams.tsx`.

### E-6. Better coverage for large courses

- **What:** generation retrieves at most 50 passages for the whole course. For courses with many lectures, generate questions per lecture or group of lectures (several smaller calls), or use each source's full extracted text instead of search passages.
- **Notes:** `sources.extracted_text` exists in the schema but the app does not fill it. Check E-1 first, since more calls take more time.

### E-7. Progress feedback while an exam is generated

- **What:** generation takes 20–40 s behind a static "בונה מבחן..." message. Show steps (searching the material, writing questions, checking) or stream the response.
- **Where:** `app/routes/exams.tsx` and the generation routes.

## Other issues noticed

### O-1. Hydration mismatch on the home page course picker

- **What:** the home page reads the selected course from localStorage in the `useState` initializer, so the server-rendered HTML (no course) differs from the first client render. React logs a hydration error and re-renders that part. Read localStorage in an effect after mount instead, or keep the value in a cookie the server can read.
- **Where:** `app/routes/home.tsx` (`readSelectedCourse`); other pages that use `readSelectedCourse` in `useState` may have the same issue.

### O-2. A removed guest keeps access for up to 60 s

- **What:** sessions are cached in memory for up to 60 s per token (`app/lib/auth.server.ts`), so a guest account that was deleted keeps working until the cache entry expires. Clear the cache entry when a guest is removed, or accept the delay.
- **Notes:** on Netlify each function instance has its own cache, so clearing it in one instance doesn't reach others. A shorter TTL is the simple option.

### O-3. Requests to /favicon.ico fail

- **What:** browsers request `/favicon.ico`, which has no route, so the server logs an error for every request. Add a `public/favicon.ico` (or a redirect to `favicon.svg`).
