import * as React from "react";
import type { Route } from "./+types/summary";
import { AppLayout } from "~/components/layout/app-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Button } from "~/components/ui/button/button";
import { getSession, requireSession } from "~/lib/auth.server";
import { getStudentById, getActiveCourses } from "~/services/settings.service";
import { saveSummary } from "~/services/summaries.service";
import { makeClientLoader } from "~/lib/client-auth-loader";
import { getToken } from "~/lib/auth.client";
import { Save, FileText } from "lucide-react";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import styles from "./summary.module.css";

// ─── Lazy-load the editor (client-only) ──────────────────────────────────────

const RichTextEditor = React.lazy(() =>
  import("~/components/rich-text-editor/rich-text-editor").then((m) => ({
    default: m.RichTextEditor,
  }))
);

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta({}: Route.MetaArgs) {
  return [{ title: "סיכומים - מערכת ניהול לימודים" }];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  // Use getSession (non-throwing) so SSR doesn't redirect when the cookie
  // is absent — the clientLoader enforces auth client-side via localStorage.
  const session = await getSession(request);
  if (!session) {
    return { accountType: "student" as const, courses: [] };
  }

  const student = await getStudentById(session.studentId, request);
  const courses = student ? await getActiveCourses(student.id, request) : [];

  return {
    accountType: session.accountType as "student" | "guest",
    courses,
  };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

// ─── Action (save summary) ────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const courseId = formData.get("courseId") as string;
  const content = formData.get("content") as string;

  if (!courseId || content === null) {
    return { ok: false, error: "נתונים חסרים" };
  }

  await saveSummary(session.studentId, courseId, content, request);
  return { ok: true };
}

// ─── Page Component ───────────────────────────────────────────────────────────

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Summary({ loaderData }: Route.ComponentProps) {
  const { accountType, courses } = loaderData as LoaderData;

  const [selectedCourseId, setSelectedCourseId] = React.useState<string>(() => {
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return courses[0]?.course_id ?? "";
  });
  const [editorContent, setEditorContent] = React.useState<string>("");
  const [loadedCourseId, setLoadedCourseId] = React.useState<string>("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const [editorKey, setEditorKey] = React.useState(0);

  // Load summary from server whenever the selected course changes
  React.useEffect(() => {
    if (!selectedCourseId || selectedCourseId === loadedCourseId) return;

    let cancelled = false;
    async function fetchSummary() {
      try {
        const token = getToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(
          `/api/summaries?courseId=${encodeURIComponent(selectedCourseId)}`,
          { headers }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json() as { content: string };
        if (!cancelled) {
          setEditorContent(data.content ?? "");
          setLoadedCourseId(selectedCourseId);
          setEditorKey((k) => k + 1); // remount editor with new content
          setSaveStatus("idle");
        }
      } catch {
        // keep existing content on error
      }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, [selectedCourseId, loadedCourseId]);

  async function handleSave() {
    if (!selectedCourseId) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const formData = new FormData();
      formData.append("courseId", selectedCourseId);
      formData.append("content", editorContent);
      const token = getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/summary", { method: "POST", body: formData, headers });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedCourseName =
    courses.find((c) => c.course_id === selectedCourseId)?.course_name ?? "";

  return (
    <AppLayout title="סיכומים" accountType={accountType}>
      <div className={styles.page}>
        {/* ── Toolbar row ── */}
        <div className={styles.topBar}>
          <div className={styles.courseSelect}>
            <label className={styles.courseLabel}>
              <FileText size={16} />
              קורס
            </label>
            {courses.length === 0 ? (
              <span className={styles.noCourses}>אין קורסים פעילים</span>
            ) : (
              <Select
                value={selectedCourseId}
                onValueChange={(value) => {
                  setSelectedCourseId(value);
                  writeSelectedCourse(value);
                }}
              >
                <SelectTrigger className={styles.selectTrigger}>
                  <SelectValue placeholder="בחר קורס..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.course_id}>
                      {c.course_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className={styles.saveArea}>
            {saveStatus === "saved" && (
              <span className={styles.savedMsg}>✓ נשמר בהצלחה</span>
            )}
            {saveStatus === "error" && (
              <span className={styles.errorMsg}>שגיאה בשמירה</span>
            )}
            <Button
              onClick={handleSave}
              disabled={isSaving || !selectedCourseId}
              size="sm"
            >
              <Save size={15} style={{ marginLeft: "var(--space-2)" }} />
              {isSaving ? "שומר..." : "שמור"}
            </Button>
          </div>
        </div>

        {/* ── Editor ── */}
        {selectedCourseId ? (
          <div className={styles.editorArea}>
            {selectedCourseName && (
              <h2 className={styles.editorTitle}>{selectedCourseName}</h2>
            )}
            <React.Suspense
              fallback={<div className={styles.editorLoading}>טוען עורך...</div>}
            >
              <RichTextEditor
                key={editorKey}
                initialValue={editorContent}
                onChange={setEditorContent}
                placeholder="כתוב את הסיכום שלך כאן..."
                className={styles.editor}
              />
            </React.Suspense>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <FileText size={40} />
            <p>בחר קורס כדי לפתוח את הסיכום שלו</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
