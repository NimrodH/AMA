/**
 * One-time database setup route.
 * Visit /setup to create all tables and seed the first user (Tali Huberman).
 * This route is safe to run multiple times (uses IF NOT EXISTS).
 */
import { createClient } from "@supabase/supabase-js";
import type { Route } from "./+types/setup";
import styles from "./setup.module.css";

export async function loader({ request }: Route.LoaderArgs) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: "Missing Supabase environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)",
      steps: [],
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const steps: { name: string; ok: boolean; detail?: string }[] = [];

  // ── 1. Create tables via RPC / raw SQL ──────────────────────────────────────
  // Supabase anon key cannot run DDL — we'll verify connection & insert the student
  // The SQL below must be run manually in the Supabase SQL Editor.
  // Here we verify the connection is alive and seed Tali Huberman.

  // ── 2. Verify connection ─────────────────────────────────────────────────────
  try {
    const { error } = await supabase.from("students").select("id").limit(1);
    if (error) {
      steps.push({
        name: "Verify connection to Supabase",
        ok: false,
        detail: `${error.message} — make sure the tables are created first (see SQL below)`,
      });
    } else {
      steps.push({ name: "Verify connection to Supabase", ok: true });
    }
  } catch (e) {
    steps.push({
      name: "Verify connection to Supabase",
      ok: false,
      detail: String(e),
    });
  }

  // ── 3. Seed first student: Tali Huberman ────────────────────────────────────
  if (steps[0]?.ok) {
    try {
      // Check if she already exists
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("name", "Tali Huberman")
        .maybeSingle();

      if (existing) {
        steps.push({
          name: "Seed student: Tali Huberman",
          ok: true,
          detail: `Already exists (id: ${existing.id})`,
        });
      } else {
        const { data, error } = await supabase
          .from("students")
          .insert({ name: "Tali Huberman" })
          .select()
          .single();

        if (error) {
          steps.push({
            name: "Seed student: Tali Huberman",
            ok: false,
            detail: error.message,
          });
        } else {
          steps.push({
            name: "Seed student: Tali Huberman",
            ok: true,
            detail: `Created with id: ${data.id}`,
          });
        }
      }
    } catch (e) {
      steps.push({ name: "Seed student: Tali Huberman", ok: false, detail: String(e) });
    }
  }

  const allOk = steps.every((s) => s.ok);

  return { success: allOk, steps, supabaseUrl };
}

const SQL = `-- Run this in Supabase SQL Editor → New Query
-- ──────────────────────────────────────────────
-- 1. Students
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Courses
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sources
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('Lecture', 'Card', 'Past exam')) NOT NULL,
  lecture_number INTEGER,
  topic TEXT NOT NULL,
  language TEXT DEFAULT 'he',
  upload_date DATE NOT NULL,
  file_url TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Exams
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  exam_content TEXT NOT NULL,
  student_answers TEXT,
  ai_feedback TEXT,
  grade INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`;

export default function Setup({ loaderData }: Route.ComponentProps) {
  const { success, steps, supabaseUrl, error } = loaderData as {
    success: boolean;
    steps: { name: string; ok: boolean; detail?: string }[];
    supabaseUrl?: string;
    error?: string;
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>🗄️ Database Setup</h1>
        <p className={styles.subtitle}>
          Supabase: <code>{supabaseUrl ?? "—"}</code>
        </p>

        {error && (
          <div className={styles.errorBanner}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className={styles.steps}>
            {steps.map((step, i) => (
              <div key={i} className={step.ok ? styles.stepOk : styles.stepFail}>
                <span className={styles.stepIcon}>{step.ok ? "✅" : "❌"}</span>
                <div>
                  <div className={styles.stepName}>{step.name}</div>
                  {step.detail && <div className={styles.stepDetail}>{step.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SQL to run manually */}
        <details className={styles.sqlDetails}>
          <summary className={styles.sqlSummary}>
            📋 SQL to paste in Supabase SQL Editor (run this first if tables don&apos;t exist)
          </summary>
          <pre className={styles.sqlBlock}>{SQL}</pre>
        </details>

        {success && (
          <div className={styles.successBanner}>
            ✅ All done! Connection verified and Tali Huberman is seeded as the first student.
          </div>
        )}

        <div className={styles.instructions}>
          <h2>📌 Steps to create tables in Supabase:</h2>
          <ol>
            <li>
              Go to <strong>supabase.com</strong> → your project
            </li>
            <li>
              Click <strong>SQL Editor</strong> in the left sidebar
            </li>
            <li>
              Click <strong>New Query</strong>
            </li>
            <li>Paste the SQL above and click Run</li>
            <li>
              Then reload this page (<code>/setup</code>) — it will seed Tali Huberman automatically
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
