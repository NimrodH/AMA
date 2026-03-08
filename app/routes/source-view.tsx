import * as React from "react";
import { Link, redirect } from "react-router";
import { ChevronLeft, BookOpen, Hash } from "lucide-react";
import type { Route } from "./+types/source-view";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { getSourceById } from "~/services/sources.service";
import { getStudent, getCourses } from "~/services/settings.service";
import styles from "./source-view.module.css";

// Lazy-load PdfViewer so pdfjs-dist (which references browser-only globals like
// DOMMatrix) is never evaluated during SSR — it only runs in the browser.
const PdfViewer = React.lazy(() => import("~/components/pdf-viewer/pdf-viewer"));

// ─── Meta ────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  const title = data?.source?.topic ?? "צפייה במקור";
  return [{ title: `${title} — מקורות לימוד` }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ params }: Route.LoaderArgs) {
  const student = await getStudent();
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
