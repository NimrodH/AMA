import * as React from "react";
import { Shuffle, Eye, Layers, ArrowRight } from "lucide-react";
import type { Route } from "./+types/learn";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select/select";
import { getActiveCourses } from "~/services/settings.service";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { getCards } from "~/services/cards.service";
import type { CardRow } from "~/services/cards.service";
import { makeClientLoader } from "~/lib/client-auth-loader";
import { RichTextViewer } from "~/components/rich-text-viewer/rich-text-viewer";
import { toEditorState } from "~/lib/lexical-utils";
import styles from "./learn.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "למד בכרטיסים - מערכת ניהול לימודים" }];
}

export function loader() {
  return {
    courses: [] as Awaited<ReturnType<typeof getActiveCourses>>,
    cards: [] as CardRow[],
    accountType: "student" as "student" | "guest",
  };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Learn({ loaderData }: Route.ComponentProps) {
  const { courses, cards, accountType } = loaderData as LoaderData;
  const isGuest = accountType === "guest";

  const [selectedCourse, setSelectedCourse] = React.useState(() => {
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return "__all__";
  });
  const [currentCard, setCurrentCard] = React.useState<CardRow | null>(null);
  const [showContent, setShowContent] = React.useState(false);
  const [orderMode, setOrderMode] = React.useState<"random" | "ordered">("random");
  const [orderedIndex, setOrderedIndex] = React.useState(0);

  const filteredCards = React.useMemo(
    () =>
      selectedCourse === "__all__"
        ? cards
        : cards.filter((c) => c.course_id === selectedCourse),
    [selectedCourse, cards]
  );

  const sortedCards = React.useMemo(() => {
    if (orderMode !== "ordered") return filteredCards;
    return [...filteredCards].sort((a, b) => {
      if (a.card_number == null && b.card_number == null) return 0;
      if (a.card_number == null) return 1;
      if (b.card_number == null) return -1;
      return Number(a.card_number) - Number(b.card_number);
    });
  }, [filteredCards, orderMode]);

  const pickNextCard = () => {
    if (filteredCards.length === 0) return;

    // Track the session for the selected course (skip "all courses" mode and guest users)
    if (selectedCourse !== "__all__" && !isGuest) {
      fetch("/api/track-learn-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse }),
      }).catch(() => { /* fire-and-forget */ });
    }

    if (orderMode === "ordered") {
      const nextIndex = orderedIndex % sortedCards.length;
      setCurrentCard(sortedCards[nextIndex]);
      setOrderedIndex(nextIndex + 1);
    } else {
      // Avoid picking the same card twice in a row if possible
      let pool = filteredCards;
      if (pool.length > 1 && currentCard) {
        pool = pool.filter((c) => c.id !== currentCard.id);
      }
      const randomIndex = Math.floor(Math.random() * pool.length);
      setCurrentCard(pool[randomIndex]);
    }
    setShowContent(false);
  };

  const revealContent = () => {
    setShowContent(true);
  };

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    if (value !== "__all__") writeSelectedCourse(value);
    setCurrentCard(null);
    setShowContent(false);
    setOrderedIndex(0);
    if (value === "__all__") setOrderMode("random");
  };

  const handleOrderModeChange = (value: "random" | "ordered") => {
    setOrderMode(value);
    setCurrentCard(null);
    setShowContent(false);
    setOrderedIndex(0);
  };

  const courseName = React.useMemo(() => {
    if (!currentCard) return "";
    return courses.find((c) => c.course_id === currentCard.course_id)?.course_name ?? "";
  }, [currentCard, courses]);

  return (
    <AppLayout title="למד בכרטיסים">
      <div className={styles.learn}>
        <div className={styles.controls}>
          <Select value={selectedCourse} onValueChange={handleCourseChange}>
            <SelectTrigger className={styles.courseSelect}>
              <SelectValue placeholder="בחר קורס" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">כל הקורסים</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.course_id}>
                  {course.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedCourse !== "__all__" && (
            <div className={styles.orderModeGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="orderMode"
                  value="random"
                  checked={orderMode === "random"}
                  onChange={() => handleOrderModeChange("random")}
                  className={styles.radioInput}
                />
                <Shuffle size={14} />
                אקראי
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="orderMode"
                  value="ordered"
                  checked={orderMode === "ordered"}
                  onChange={() => handleOrderModeChange("ordered")}
                  className={styles.radioInput}
                />
                <ArrowRight size={14} />
                לפי סדר
              </label>
            </div>
          )}

          <Button
            onClick={pickNextCard}
            disabled={filteredCards.length === 0}
            variant="outline"
            className={styles.showTitleBtn}
          >
            {orderMode === "ordered" ? (
              <><ArrowRight size={16} />הבא</>  
            ) : (
              <><Shuffle size={16} />הצג כותרת</>
            )}
          </Button>

          <Button
            onClick={revealContent}
            disabled={!currentCard || showContent}
            className={styles.showContentBtn}
          >
            <Eye size={16} />
            הצג תוכן
          </Button>

          <span className={styles.counter}>
            {filteredCards.length > 0
              ? `${filteredCards.length} כרטיסים זמינים`
              : "אין כרטיסים"}
          </span>
        </div>

        {!currentCard ? (
          <div className={styles.emptyState}>
            <Layers size={48} className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              {filteredCards.length === 0
                ? "אין כרטיסים זמינים — צור כרטיסים בעמוד כרטיסי סיכום"
                : 'לחץ על "הצג כותרת" כדי להתחיל לתרגל'}
            </p>
          </div>
        ) : (
          <div className={styles.cardDisplay}>
            <div className={styles.cardMeta}>
              {courseName && <span className={styles.metaChip}>{courseName}</span>}
              {currentCard.topic && (
                <span className={styles.metaChip}>{currentCard.topic}</span>
              )}
              {currentCard.lecture_number != null && (
                <span className={styles.metaChip}>
                  הרצאה {currentCard.lecture_number}
                </span>
              )}
            </div>

            <h2 className={styles.cardTitle}>{currentCard.title}</h2>

            {!showContent ? (
              <p className={styles.revealHint}>
                נסה לזכור את התוכן בעצמך, ואז לחץ &quot;הצג תוכן&quot; לבדיקה
              </p>
            ) : (
              <>
                <hr className={styles.divider} />
                <RichTextViewer
                  viewerKey={currentCard.id}
                  serializedState={toEditorState(currentCard.content)}
                  className={styles.cardContent}
                />
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
