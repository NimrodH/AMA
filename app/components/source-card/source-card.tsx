import * as React from "react";
import { FileText, Trash2, Eye, RefreshCw, CheckCircle, AlertCircle, Loader2, ClipboardList } from "lucide-react";
import classNames from "classnames";
import { Link, useFetcher } from "react-router";
import { Button } from "~/components/ui/button/button";
import type { Database } from "~/lib/supabase";
import styles from "./source-card.module.css";

type Source = Database["public"]["Tables"]["sources"]["Row"];

interface SourceCardProps {
  source: Source;
  studentId: string;
  className?: string;
}

const TYPE_LABELS: Record<Source["source_type"], string> = {
  Lecture: "הרצאה",
  Card: "כרטיס",
  "Past exam": "מבחן עבר",
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export function SourceCard({ source, studentId, className }: SourceCardProps) {
  const fetcher = useFetcher();
  const reuploadFetcher = useFetcher<{ ok: boolean; message?: string; error?: string; fileStatus?: string; newVectorStoreFileId?: string }>();
  const isDeleting = fetcher.state !== "idle";
  const isReuploading = reuploadFetcher.state !== "idle";
  const reuploadResult = reuploadFetcher.data;

  // Polling state — tracks the live file status after a successful reupload
  const [polledStatus, setPolledStatus] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const pollAttemptsRef = React.useRef(0);
  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start polling when the reupload finishes with in_progress status
  React.useEffect(() => {
    const fileId = reuploadResult?.newVectorStoreFileId;
    const initialStatus = reuploadResult?.fileStatus;

    if (!reuploadResult?.ok || !fileId) return;

    // Reset polled status each time a new reupload completes
    setPolledStatus(initialStatus ?? null);

    if (initialStatus === "in_progress") {
      startPolling(fileId);
    }

    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuploadResult]);

  // Cleanup on unmount
  React.useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
    pollAttemptsRef.current = 0;
  }

  function startPolling(fileId: string) {
    setIsPolling(true);
    pollAttemptsRef.current = 0;
    schedulePoll(fileId);
  }

  function schedulePoll(fileId: string) {
    pollTimerRef.current = setTimeout(() => poll(fileId), POLL_INTERVAL_MS);
  }

  async function poll(fileId: string) {
    pollAttemptsRef.current += 1;

    try {
      const res = await fetch(`/api/file-status?fileId=${encodeURIComponent(fileId)}`);
      const data = (await res.json()) as { status?: string; error?: string };

      if (data.status) {
        setPolledStatus(data.status);

        if (data.status !== "in_progress" || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          stopPolling();
          return;
        }
      }
    } catch {
      // Network hiccup — keep polling
    }

    if (pollAttemptsRef.current < MAX_POLL_ATTEMPTS) {
      schedulePoll(fileId);
    } else {
      stopPolling();
    }
  }

  const typeClass =
    source.source_type === "Lecture"
      ? styles.cardLecture
      : source.source_type === "Card"
        ? styles.cardCard
        : styles.cardExam;

  const typeStyle =
    source.source_type === "Lecture"
      ? styles.typeLecture
      : source.source_type === "Card"
        ? styles.typeCard
        : styles.typeExam;

  const formattedDate = source.upload_date
    ? new Date(source.upload_date).toLocaleDateString("he-IL")
    : null;

  const handleDelete = () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set("sourceId", source.id);
    formData.set("studentId", studentId);
    fetcher.submit(formData, { method: "post" });
  };

  const handleReupload = () => {
    stopPolling();
    setPolledStatus(null);
    reuploadFetcher.submit(
      JSON.stringify({ sourceId: source.id }),
      { method: "post", action: "/api/reupload-source", encType: "application/json" }
    );
  };

  if (isDeleting) {
    return (
      <div className={classNames(styles.card, typeClass, styles.cardDeleting, className)}>
        <p className={styles.deletingText}>מוחק...</p>
      </div>
    );
  }

  // Derive the display status — polledStatus overrides the initial fileStatus
  const displayStatus = polledStatus ?? reuploadResult?.fileStatus;
  const statusIsCompleted = displayStatus === "completed";
  const statusIsFailed = displayStatus === "failed";

  return (
    <div className={classNames(styles.card, typeClass, className)}>
      {/* ── First line: type badge · date · course id · lecture number ── */}
      <div className={styles.topRow}>
        <span className={classNames(styles.type, typeStyle)}>
          <FileText style={{ width: "12px", height: "12px" }} />
          {TYPE_LABELS[source.source_type]}
        </span>

        <div className={styles.topMeta}>
          {formattedDate && <span className={styles.metaChip}>{formattedDate}</span>}
          {source.course_id && <span className={styles.metaChip}>{source.course_id}</span>}
          {source.lecture_number && (
            <span className={styles.metaChip}>#{source.lecture_number}</span>
          )}
        </div>
      </div>

      {/* ── Title ── */}
      <h3 className={styles.title}>{source.topic}</h3>

      {/* ── Content preview ── */}
      {source.content && (
        <div className={styles.content}>
          <p>{source.content}</p>
        </div>
      )}

      {/* ── Re-upload status ── */}
      {reuploadResult && (
        <div
          className={classNames(
            styles.reuploadStatus,
            reuploadResult.ok
              ? statusIsFailed
                ? styles.reuploadErr
                : statusIsCompleted
                  ? styles.reuploadOk
                  : styles.reuploadPending
              : styles.reuploadErr
          )}
        >
          {reuploadResult.ok ? (
            isPolling ? (
              <><Loader2 style={{ width: 13, height: 13, animation: "var(--animation-spin)" }} /> מאנדקס... ({displayStatus})</>
            ) : statusIsCompleted ? (
              <><CheckCircle style={{ width: 13, height: 13 }} /> הועלה מחדש בהצלחה</>
            ) : statusIsFailed ? (
              <><AlertCircle style={{ width: 13, height: 13 }} /> האינדוקס נכשל</>
            ) : (
              <><CheckCircle style={{ width: 13, height: 13 }} /> הועלה מחדש ({displayStatus})</>
            )
          ) : (
            <><AlertCircle style={{ width: 13, height: 13 }} /> {reuploadResult.error}</>
          )}
        </div>
      )}

      {/* ── Footer: view + re-upload + delete ── */}
      <div className={styles.footer}>
        {source.source_type === "Past exam" && (
          <Button asChild variant="outline" size="sm" className={styles.examBtn} style={{ flex: 1 }}>
            <Link to={`/exams?sourceId=${source.id}`}>
              <ClipboardList style={{ width: 14, height: 14, marginLeft: "var(--space-2)" }} />
              הצג כבחינה
            </Link>
          </Button>
        )}
        {source.file_url && source.source_type !== "Past exam" && (
          <Button asChild variant="outline" size="sm" style={{ flex: 1 }}>
            <Link to={`/sources/${source.id}/view`}>
              <Eye style={{ width: 14, height: 14, marginLeft: "var(--space-2)" }} />
              צפייה
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={styles.reuploadBtn}
          onClick={handleReupload}
          disabled={isReuploading || isPolling}
          title="העלה מחדש ל-OpenAI"
        >
          <RefreshCw style={{ width: 14, height: 14, animation: (isReuploading || isPolling) ? "var(--animation-spin)" : "none" }} />
          {isReuploading ? "מעלה..." : isPolling ? "מאנדקס..." : "סנכרן"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={styles.deleteBtn}
          onClick={handleDelete}
          title="מחק מקור"
        >
          <Trash2 style={{ width: 14, height: 14 }} />
          מחיקה
        </Button>
      </div>
    </div>
  );
}
