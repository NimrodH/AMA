import * as React from "react";
import { ChevronDown, ChevronUp, FileText, Presentation } from "lucide-react";
import { Button } from "~/components/ui/button/button";
import { Checkbox } from "~/components/ui/checkbox/checkbox";
import { Label } from "~/components/ui/label/label";
import styles from "./exam-source-picker.module.css";

export interface ExamSourceOption {
  id: string;
  source_type: "Lecture" | "Article";
  lecture_number: number | null;
  topic: string | null;
  /** In the AI's search index; when false the AI only sees the source's title */
  indexed: boolean;
}

interface ExamSourcePickerProps {
  /** Lectures and articles of the selected course */
  sources: ExamSourceOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  disabled?: boolean;
}

function sourceLabel(source: ExamSourceOption): string {
  const topic = source.topic?.trim() || "ללא נושא";
  if (source.source_type === "Lecture" && source.lecture_number) return `הרצאה ${source.lecture_number} — ${topic}`;
  return topic;
}

/** Chooses which lectures and articles of the course an AI exam is built from. */
export function ExamSourcePicker({ sources, selected, onChange, disabled }: ExamSourcePickerProps) {
  const [expanded, setExpanded] = React.useState(false);

  const lectures = sources.filter((s) => s.source_type === "Lecture");
  const articles = sources.filter((s) => s.source_type === "Article");
  const selectedCount = sources.filter((s) => selected.has(s.id)).length;

  const selectOnly = (items: ExamSourceOption[]) => onChange(new Set(items.map((s) => s.id)));

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  const toggleGroup = (items: ExamSourceOption[], checked: boolean) => {
    const next = new Set(selected);
    for (const s of items) {
      if (checked) next.add(s.id);
      else next.delete(s.id);
    }
    onChange(next);
  };

  const isOnly = (items: ExamSourceOption[]) =>
    items.length > 0 && selectedCount === items.length && items.every((s) => selected.has(s.id));

  const summary =
    sources.length === 0
      ? "אין הרצאות או מאמרים בקורס זה"
      : selectedCount === sources.length
        ? `כל החומר (${sources.length} מקורות)`
        : isOnly(lectures)
          ? `הרצאות בלבד (${lectures.length})`
          : isOnly(articles)
            ? `מאמרים בלבד (${articles.length})`
            : `נבחרו ${selectedCount} מתוך ${sources.length} מקורות`;

  const notIndexedCount = sources.filter((s) => !s.indexed && selected.has(s.id)).length;

  const renderGroup = (title: string, icon: React.ReactNode, items: ExamSourceOption[]) => {
    if (items.length === 0) return null;
    const count = items.filter((s) => selected.has(s.id)).length;
    const groupState = count === 0 ? false : count === items.length ? true : "indeterminate";
    const groupId = `exam-src-group-${title}`;
    return (
      <div className={styles.group}>
        <div className={styles.groupHeader}>
          <Checkbox
            id={groupId}
            checked={groupState}
            onCheckedChange={(v) => toggleGroup(items, v === true)}
            disabled={disabled}
          />
          <Label htmlFor={groupId} className={styles.groupTitle}>
            {icon}
            {title}
            <span className={styles.groupCount}>
              {count}/{items.length}
            </span>
          </Label>
        </div>
        <ul className={styles.items}>
          {items.map((s) => {
            const id = `exam-src-${s.id}`;
            return (
              <li key={s.id} className={styles.item}>
                <Checkbox
                  id={id}
                  checked={selected.has(s.id)}
                  onCheckedChange={(v) => toggle(s.id, v === true)}
                  disabled={disabled}
                />
                <Label htmlFor={id} className={styles.itemLabel}>
                  {sourceLabel(s)}
                  {!s.indexed && <span className={styles.notIndexed}> (לא זמין ל-AI — סנכרן בעמוד המקורות)</span>}
                </Label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <span className={styles.title}>חומרי לימוד למבחן</span>
        <span className={styles.summary}>{summary}</span>
      </div>

      {sources.length > 0 && (
        <>
          <div className={styles.quickRow}>
            <Button
              type="button"
              size="sm"
              variant={selectedCount === sources.length ? "default" : "outline"}
              onClick={() => selectOnly(sources)}
              disabled={disabled}
            >
              כל החומר
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isOnly(lectures) && articles.length > 0 ? "default" : "outline"}
              onClick={() => selectOnly(lectures)}
              disabled={disabled || lectures.length === 0}
            >
              הרצאות בלבד
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isOnly(articles) && lectures.length > 0 ? "default" : "outline"}
              onClick={() => selectOnly(articles)}
              disabled={disabled || articles.length === 0}
            >
              מאמרים בלבד
            </Button>
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={styles.expandButton}
            >
              בחירת מקורות
              {expanded ? <ChevronUp className={styles.chevron} /> : <ChevronDown className={styles.chevron} />}
            </Button>
          </div>

          {notIndexedCount > 0 && (
            <p className={styles.warning}>
              {notIndexedCount === 1 ? "מקור אחד שנבחר אינו זמין" : `${notIndexedCount} מקורות שנבחרו אינם זמינים`} לחיפוש
              של ה-AI, ולכן הוא לא יוכל לקרוא את תוכנם. אפשר להוסיף אותם בלחיצה על &quot;סנכרן&quot; בעמוד המקורות.
            </p>
          )}

          {expanded && (
            <div className={styles.list}>
              {renderGroup("הרצאות", <Presentation className={styles.groupIcon} />, lectures)}
              {renderGroup("מאמרים", <FileText className={styles.groupIcon} />, articles)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
