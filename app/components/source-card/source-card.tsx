import * as React from "react";
import { FileText, Trash2, Eye, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
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

export function SourceCard({ source, studentId, className }: SourceCardProps) {
  const fetcher = useFetcher();
  const reuploadFetcher = useFetcher<{ ok: boolean; message?: string; error?: string; fileStatus?: string }>();
  const isDeleting = fetcher.state !== "idle";
  const isReuploading = reuploadFetcher.state !== "idle";
  const reuploadResult = reuploadFetcher.data;

  const handleReupload = () => {
    reuploadFetcher.submit(
      JSON.stringify({ sourceId: source.id }),
      { method: "post", action: "/api/reupload-source", encType: "application/json" }
    );
  };

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

  if (isDeleting) {
    return (
      <div className={classNames(styles.card, typeClass, styles.cardDeleting, className)}>
        <p className={styles.deletingText}>מוחק...</p>
      </div>
    );
  }

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
        <div className={classNames(styles.reuploadStatus, reuploadResult.ok ? styles.reuploadOk : styles.reuploadErr)}>
          {reuploadResult.ok ? (
            <><CheckCircle style={{ width: 13, height: 13 }} /> הועלה מחדש ({reuploadResult.fileStatus})</>
          ) : (
            <><AlertCircle style={{ width: 13, height: 13 }} /> {reuploadResult.error}</>
          )}
        </div>
      )}

      {/* ── Footer: view + re-upload + delete ── */}
      <div className={styles.footer}>
        {source.file_url && (
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
          disabled={isReuploading}
          title="העלה מחדש ל-OpenAI"
        >
          <RefreshCw style={{ width: 14, height: 14, animation: isReuploading ? "var(--animation-spin)" : "none" }} />
          {isReuploading ? "מעלה..." : "סנכרן"}
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
