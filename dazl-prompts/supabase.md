
## Configuration (Already Set Up)

This project has Supabase integration enabled.
Use the pre-installed packages and environment variables directly — no additional setup required.

- Available packages: @supabase/supabase-js
- Available env vars:
  - `SUPABASE_API_KEY` — API key for authentication
  - `SUPABASE_PROJECT_URL` — Project URL (Example: `https://project-id.supabase.co`)

## Guidelines

- Initialize the Supabase client in a dedicated module (e.g., `lib/supabase.ts`)
- Follow a layered architecture: routes/loaders => services/helpers => database client
- Route handlers and loaders should only call service/helper functions, never query the database directly
- UI components must not interact with the database or database services/helpers
- All database operations must run server-side only — never import Supabase modules or call database functions from client components
- Use TypeScript types generated from your database schema when available
- Always keep an eye on a database and table schema, ensuring your queries align with the current structure. Do not assume or guess table names, column names or types
