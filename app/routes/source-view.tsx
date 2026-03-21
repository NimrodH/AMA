import * as React from "react";
import { Link, redirect } from "react-router";
import { ChevronLeft, BookOpen, Hash, Download } from "lucide-react";
import type { Route } from "./+types/source-view";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { getSourceById } from "~/services/sources.service";
import { getStudentById, getCourses } from "~/services/settings.service";
import { requireSession } from "~/lib/auth.server";
import styles from "./source-view.module.css";

/**
 * ClientOnly wrapper — renders children only on the client side.
 * During SSR this renders the fallback instead.
 */
function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

// Use .client.tsx so pdfjs-dist (browser-only globals like DOMMatrix) is
// completely excluded from the SSR bundle.
const PdfViewer = React.lazy(() => import("~/components/pdf-viewer/pdf-viewer.client"));

// ─── Meta ────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  const title = data?.source?.topic ?? "צפייה במקור";
  return [{ title: `${title} — מקורות לימוד` }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireSession(request);
  const student = await getStudentById(session.studentId);
  if (!student) return redirect("/setup");

  const [source, courses] = await Promise.all([
    getSourceById(params.id, student.id),
    getCourses(student.id),
  ]);
  if (!source) throw new Response("Not Found", { status: 404 });

  const courseName =
    courses.find((c) => c.course_id === source.course_id)?.course_name ?? null;

  return { source, courseName };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function SourceView({ loaderData }: Route.ComponentProps) {
  const { source, courseName } = loaderData;
  const isPdf = source.file_url?.toLowerCase().endsWith(".pdf") ?? false;

  return (
    <AppLayout title={source.topic}>
      <div className={styles.container}>
        <div className={styles.backBar}>
          <Button asChild variant="secondary" size="sm">
            <Link to="/sources">
              <ChevronLeft style={{ width: 16, height: 16, marginLeft: 4 }} />
              חזרה למקורות
            </Link>
          </Button>

          {isPdf && source.file_url && (
            <Button asChild variant="outline" size="sm">
              <a href={source.file_url} download target="_blank" rel="noopener noreferrer">
                <Download style={{ width: 16, height: 16, marginLeft: 4 }} />
                הורד קובץ
              </a>
            </Button>
          )}

          {(courseName || source.lecture_number != null) && (
            <div className={styles.metaChips}>
              {courseName && (
                <span className={styles.metaChip}>
                  <BookOpen style={{ width: 14, height: 14 }} />
                  {courseName}
                </span>
              )}
              {source.lecture_number != null && (
                <span className={styles.metaChip}>
                  <Hash style={{ width: 14, height: 14 }} />
                  שיעור {source.lecture_number}
                </span>
              )}
            </div>
          )}
        </div>

        {isPdf && source.file_url ? (
          <ClientOnly
            fallback={
              <div className={styles.loadingFallback}>
                <div className={styles.loadingSpinner} aria-hidden="true" />
                <p className={styles.loadingText}>טוען מציג PDF...</p>
              </div>
            }
          >
            <React.Suspense
              fallback={
                <div className={styles.loadingFallback}>
                  <div className={styles.loadingSpinner} aria-hidden="true" />
                  <p className={styles.loadingText}>טוען מציג PDF...</p>
                </div>
              }
            >
              <PdfViewer fileUrl={source.file_url} topic={source.topic} />
            </React.Suspense>
          </ClientOnly>
        ) : (
          <div className={styles.errorState}>
            <p className={styles.errorText}>
              {source.file_url
                ? "קובץ זה אינו PDF ולא ניתן להציגו כאן."
                : "לא נמצא קובץ עבור מקור זה."}
            </p>
            {source.file_url && (
              <Button asChild variant="outline">
                <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                  הורד קובץ
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
