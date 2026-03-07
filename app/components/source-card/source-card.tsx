import * as React from "react";
import { FileText, Calendar, Hash, BookOpen } from "lucide-react";
import classNames from "classnames";
import { Button } from "~/components/ui/button/button";
import type { Database } from "~/lib/supabase";
import styles from "./source-card.module.css";

type Source = Database["public"]["Tables"]["sources"]["Row"];

interface SourceCardProps {
  /**
   * The source data to display
   * @important
   */
  source: Source;
  /**
   * Callback when view button is clicked
   */
  onView?: (source: Source) => void;
  /**
   * Callback when delete button is clicked
   */
  onDelete?: (source: Source) => void;
  /**
   * Additional CSS class
   */
  className?: string;
}

export function SourceCard({ source, onView, onDelete, className }: SourceCardProps) {
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

  return (
    <div className={classNames(styles.card, typeClass, className)}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <span className={classNames(styles.type, typeStyle)}>
            <FileText style={{ width: "14px", height: "14px" }} />
            {source.source_type === "Lecture" ? "הרצאה" : source.source_type === "Card" ? "כרטיס" : "מבחן עבר"}
          </span>
          <h3 className={styles.title}>{source.topic}</h3>
        </div>
      </div>

      <div className={styles.metadata}>
        {source.lecture_number && (
          <div className={styles.metadataItem}>
            <Hash />
            <span>
              {source.source_type === "Lecture"
                ? `הרצאה ${source.lecture_number}`
                : `משויך להרצאה ${source.lecture_number}`}
            </span>
          </div>
        )}
        <div className={styles.metadataItem}>
          <Calendar />
          <span>
            {source.upload_date
              ? new Date(source.upload_date).toLocaleDateString("he-IL")
              : "—"}
          </span>
        </div>
        <div className={styles.metadataItem}>
          <BookOpen />
          <span>{source.course_id}</span>
        </div>
      </div>

      {source.content && (
        <div className={styles.content}>
          <p>{source.content}</p>
        </div>
      )}

      <div className={styles.footer}>
        {onView && (
          <Button variant="outline" size="sm" onClick={() => onView(source)} style={{ flex: 1 }}>
            צפייה
          </Button>
        )}
        {onDelete && (
          <Button variant="outline" size="sm" onClick={() => onDelete(source)}>
            מחיקה
          </Button>
        )}
      </div>
    </div>
  );
}
