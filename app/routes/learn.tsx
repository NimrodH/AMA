import * as React from "react";
import { Shuffle, Eye, Layers } from "lucide-react";
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
import { getStudent, getCourses } from "~/services/settings.service";
import { getCards } from "~/services/cards.service";
import type { CardRow } from "~/services/cards.service";
import styles from "./learn.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "למד בכרטיסים - מערכת ניהול לימודים" }];
}

export async function loader() {
  const student = await getStudent();
  if (!student) return { courses: [], cards: [] };
  const [courses, cards] = await Promise.all([
    getCourses(student.id),
    getCards(student.id),
  ]);
  return { courses, cards };
}

export default function Learn({ loaderData }: Route.ComponentProps) {
  const { courses, cards } = loaderData;

  const [selectedCourse, setSelectedCourse] = React.useState("__all__");
  const [currentCard, setCurrentCard] = React.useState<CardRow | null>(null);
  const [showContent, setShowContent] = React.useState(false);

  const filteredCards = React.useMemo(
    () =>
      selectedCourse === "__all__"
        ? cards
        : cards.filter((c) => c.course_id === selectedCourse),
    [selectedCourse, cards]
  );

  const pickRandomCard = () => {
    if (filteredCards.length === 0) return;
    // Avoid picking the same card twice in a row if possible
    let pool = filteredCards;
    if (pool.length > 1 && currentCard) {
      pool = pool.filter((c) => c.id !== currentCard.id);
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    setCurrentCard(pool[randomIndex]);
    setShowContent(false);
  };

  const revealContent = () => {
    setShowContent(true);
  };

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    setCurrentCard(null);
    setShowContent(false);
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

          <Button
            onClick={pickRandomCard}
            disabled={filteredCards.length === 0}
            variant="outline"
            className={styles.showTitleBtn}
          >
            <Shuffle size={16} />
            הצג כותרת
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
                <div className={styles.cardContent}>{currentCard.content}</div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
