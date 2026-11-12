import * as React from "react";
import { Link, redirect } from "react-router";
import { ChevronLeft, BookOpen, Hash, Download, FileText } from "lucide-react";
import type { Route } from "./+types/source-view";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { getSourceById } from "~/services/sources.service";
import { getCourses } from "~/services/settings.service";
import { getSession } from "~/lib/auth.server";
import { makeClientLoader } from "~/lib/client-auth-loader";
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

type LoaderData = { source: { topic: string; file_url: string | null; lecture_number: number | null; course_id: string; [key: string]: unknown }; courseName: string | null };

export function meta({ data }: Route.MetaArgs) {
  const loaderData = data as LoaderData | undefined;
  const title = loaderData?.source?.topic ?? "צפייה במקור";
  return [{ title: `${title} — מקורות לימוד` }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session) return redirect("/sources");
  // The session already holds the student id and name — no need to query them again
  const student = { id: session.studentId, name: session.studentName };

  const [source, courses] = await Promise.all([
    getSourceById(params.id, student.id, request),
    getCourses(student.id, request),
  ]);
  if (!source) throw new Response("Not Found", { status: 404 });

  const courseName =
    courses.find((c) => c.course_id === source.course_id)?.course_name ?? null;

  return { source, courseName };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

// ─── Page component ───────────────────────────────────────────────────────────

/**
 * Triggers a UTF-8 download of the given text content.
 * Prepends a BOM (\uFEFF) so that Windows apps (Notepad, Excel) detect the
 * encoding correctly and display Hebrew characters properly.
 */
function downloadTextFile(content: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SourceView({ loaderData }: Route.ComponentProps) {
  const { source, courseName } = loaderData as LoaderData;
  const isPdf = source.file_url?.toLowerCase().endsWith(".pdf") ?? false;
  const isTxt = source.file_url?.toLowerCase().endsWith(".txt") ?? false;
  const textContent = (source as Record<string, unknown>).content as string | undefined;

  const handleDownloadText = () => {
    if (!textContent) return;
    const safeTopic = source.topic.replace(/[^\w\u0590-\u05FF\s-]/g, "").trim() || "source";
    downloadTextFile(textContent, `${safeTopic}.txt`);
  };

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

          {isTxt && textContent && (
            <Button variant="outline" size="sm" onClick={handleDownloadText}>
              <Download style={{ width: 16, height: 16, marginLeft: 4 }} />
              הורד קובץ
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
        ) : isTxt && textContent ? (
          <div className={styles.textViewer}>
            <div className={styles.textViewerHeader}>
              <FileText style={{ width: 16, height: 16 }} />
              <span>{source.topic}</span>
            </div>
            <pre className={styles.textContent}>{textContent}</pre>
          </div>
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
