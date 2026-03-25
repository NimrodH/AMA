/**
 * One-time database setup & verification route.
 * Visit /setup to verify the Supabase connection and see the current database state.
 * Tables are created via Supabase migrations (already applied).
 */
import { createServerClient } from "~/lib/supabase";
import type { Route } from "./+types/setup";
import styles from "./setup.module.css";

type SupabaseClient = ReturnType<typeof createServerClient>;

interface SetupStep {
  name: string;
  ok: boolean;
  detail?: string;
}

interface TableInfo {
  name: string;
  rows: number;
}

async function verifyConnection(supabase: SupabaseClient): Promise<SetupStep> {
  try {
    const { error } = await supabase.from("students").select("id").limit(1);
    if (error) {
      return {
        name: "Verify Supabase connection",
        ok: false,
        detail: error.message,
      };
    }
    return { name: "Verify Supabase connection", ok: true };
  } catch (e) {
    return {
      name: "Verify Supabase connection",
      ok: false,
      detail: String(e),
    };
  }
}

async function getTableCounts(supabase: SupabaseClient): Promise<TableInfo[]> {
  const tableNames = ["students", "courses", "sources", "exams", "reminders"];
  const results: TableInfo[] = [];

  for (const table of tableNames) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      results.push({
        name: table,
        rows: error ? -1 : (count ?? 0),
      });
    } catch {
      results.push({ name: table, rows: -1 });
    }
  }

  return results;
}

async function seedTaliHuberman(supabase: SupabaseClient): Promise<SetupStep> {
  try {
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .eq("name", "Tali Huberman")
      .maybeSingle();

    if (existing) {
      return {
        name: "Seed student: Tali Huberman",
        ok: true,
        detail: `Already exists (id: ${existing.id})`,
      };
    }

    const { data, error } = await supabase
      .from("students")
      .insert({ name: "Tali Huberman" })
      .select()
      .single();

    if (error) {
      return { name: "Seed student: Tali Huberman", ok: false, detail: error.message };
    }

    return {
      name: "Seed student: Tali Huberman",
      ok: true,
      detail: `Created with id: ${data.id}`,
    };
  } catch (e) {
    return { name: "Seed student: Tali Huberman", ok: false, detail: String(e) };
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL ?? null;

  let supabase: SupabaseClient;
  try {
    supabase = createServerClient();
  } catch {
    return {
      success: false,
      error:
        "Missing Supabase environment variables. Make sure Supabase is connected to the project.",
      steps: [] as SetupStep[],
      tables: [] as TableInfo[],
      supabaseUrl,
    };
  }
  const steps: SetupStep[] = [];

  // Step 1: Verify connection
  const connectionStep = await verifyConnection(supabase);
  steps.push(connectionStep);

  // Step 2: Seed Tali Huberman (only if connection works)
  if (connectionStep.ok) {
    const seedStep = await seedTaliHuberman(supabase);
    steps.push(seedStep);
  }

  // Step 3: Get table row counts
  const tables = connectionStep.ok ? await getTableCounts(supabase) : [];

  if (tables.length > 0) {
    const allTablesExist = tables.every((t) => t.rows >= 0);
    steps.push({
      name: "Verify all tables exist",
      ok: allTablesExist,
      detail: allTablesExist
        ? `Found ${tables.length} tables`
        : "Some tables are missing — see table details below",
    });
  }

  const allOk = steps.every((s) => s.ok);

  return {
    success: allOk,
    steps,
    tables,
    supabaseUrl,
    error: null,
  };
}

export default function Setup({ loaderData }: Route.ComponentProps) {
  const { success, steps, tables, supabaseUrl, error } = loaderData;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>🗄️ Database Setup</h1>
        <p className={styles.subtitle}>
          Supabase:{" "}
          <code>{supabaseUrl ?? "Not connected"}</code>
        </p>

        {error && (
          <div className={styles.errorBanner}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Verification Steps */}
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

        {/* Table Overview */}
        {tables.length > 0 && (
          <div className={styles.tableOverview}>
            <h2 className={styles.tableOverviewTitle}>📊 Tables Overview</h2>
            <div className={styles.tableGrid}>
              {tables.map((t) => (
                <div key={t.name} className={styles.tableItem}>
                  <span className={styles.tableName}>{t.name}</span>
                  <span className={styles.tableRows}>
                    {t.rows >= 0 ? `${t.rows} row${t.rows !== 1 ? "s" : ""}` : "❌ missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {success && (
          <div className={styles.successBanner}>
            ✅ All done! Connection verified, tables exist, and Tali Huberman is seeded as the first student.
          </div>
        )}
      </div>
    </div>
  );
}
