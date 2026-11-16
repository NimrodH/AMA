import * as React from "react";
import { Shuffle, Eye, Layers, ArrowRight, RotateCcw, Repeat, CalendarClock, Trophy } from "lucide-react";
import type { Route } from "./+types/learn";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getActiveCourses } from "~/services/settings.service";
import { getSession } from "~/lib/auth.server";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { getCards } from "~/services/cards.service";
import type { CardRow } from "~/services/cards.service";
import { makeClientLoader } from "~/lib/client-auth-loader";
import { authFetch } from "~/lib/auth-fetch";
import { RichTextViewer } from "~/components/rich-text-viewer/rich-text-viewer";
import { toEditorState } from "~/lib/lexical-utils";
import styles from "./learn.module.css";
import classNames from "classnames";

export function meta({}: Route.MetaArgs) {
  return [{ title: "למד בכרטיסים - מערכת ניהול לימודים" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session) return { courses: [], cards: [], accountType: "student" as const };
  // The session already holds the student id and name — no need to query them again
  const student = { id: session.studentId, name: session.studentName };
  const [courses, cards] = await Promise.all([getActiveCourses(student.id, request), getCards(student.id, request)]);
  return { courses, cards, accountType: session.accountType };
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
  const [orderMode, setOrderMode] = React.useState<"random" | "ordered">("random");
  // Temporary study list: null = not started yet, [] = finished, otherwise the first card is the current one
  const [queue, setQueue] = React.useState<CardRow[] | null>(null);
  const [showContent, setShowContent] = React.useState(false);
  const [totalInRound, setTotalInRound] = React.useState(0);

  const currentCard = queue && queue.length > 0 ? queue[0] : null;
  const finished = queue !== null && queue.length === 0;

  const filteredCards = React.useMemo(
    () => (selectedCourse === "__all__" ? cards : cards.filter((c) => c.course_id === selectedCourse)),
    [selectedCourse, cards],
  );

  const buildQueue = (): CardRow[] => {
    if (orderMode === "ordered") {
      return [...filteredCards].sort((a, b) => {
        if (a.card_number == null && b.card_number == null) return 0;
        if (a.card_number == null) return 1;
        if (b.card_number == null) return -1;
        return Number(a.card_number) - Number(b.card_number);
      });
    }
    // Fisher-Yates shuffle
    const shuffled = [...filteredCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const startRound = () => {
    if (filteredCards.length === 0) return;

    // Track the session for the selected course (skip "all courses" mode and guest users)
    if (selectedCourse !== "__all__" && !isGuest) {
      authFetch("/api/track-learn-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse }),
      }).catch(() => {
        /* fire-and-forget */
      });
    }

    const next = buildQueue();
    setQueue(next);
    setTotalInRound(next.length);
    setShowContent(false);
  };

  const revealContent = () => {
    setShowContent(true);
  };

  // "לשינון חוזר": move the current card to the end of the list
  const studyAgain = () => {
    setQueue((q) => (q && q.length > 0 ? [...q.slice(1), q[0]] : q));
    setShowContent(false);
  };

  // "שינון בעתיד": remove the current card from the list
  const studyLater = () => {
    setQueue((q) => (q && q.length > 0 ? q.slice(1) : q));
    setShowContent(false);
  };

  const resetRound = () => {
    setQueue(null);
    setShowContent(false);
    setTotalInRound(0);
  };

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    if (value !== "__all__") writeSelectedCourse(value);
    resetRound();
    if (value === "__all__") setOrderMode("random");
  };

  const handleOrderModeChange = (value: "random" | "ordered") => {
    setOrderMode(value);
    resetRound();
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
            onClick={startRound}
            disabled={filteredCards.length === 0}
            variant={currentCard ? "outline" : "default"}
            size="sm"
            className={styles.startBtn}
          >
            <RotateCcw size={14} />
            אתחול
          </Button>

          <span className={styles.counter}>
            {currentCard
              ? `נותרו ${queue!.length} מתוך ${totalInRound} כרטיסים`
              : filteredCards.length > 0
                ? `${filteredCards.length} כרטיסים זמינים`
                : "אין כרטיסים"}
          </span>
        </div>

        {finished ? (
          <div className={styles.doneState} role="status">
            <div className={styles.confetti} aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} className={styles.confettiPiece} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </div>
            <Trophy size={56} className={styles.doneIcon} />
            <p className={styles.doneText}>כל הכבוד סיימת שינון כל הכרטיסים</p>
          </div>
        ) : !currentCard ? (
          <div className={styles.emptyState}>
            <Layers size={48} className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              {filteredCards.length === 0
                ? "אין כרטיסים זמינים — צור כרטיסים בעמוד כרטיסי סיכום"
                : 'לחץ על "אתחול" כדי להתחיל לשנן'}
            </p>
          </div>
        ) : (
          <div key={`${currentCard.id}-${queue!.length}`} className={styles.cardDisplay}>
            <div className={styles.cardMeta}>
              {courseName && <span className={styles.metaChip}>{courseName}</span>}
              {currentCard.topic && <span className={styles.metaChip}>{currentCard.topic}</span>}
              {currentCard.lecture_number != null && (
                <span className={styles.metaChip}>הרצאה {currentCard.lecture_number}</span>
              )}
            </div>

            <h2 className={styles.cardTitle}>{currentCard.title}</h2>

            {!showContent ? (
              <p className={styles.revealHint}>נסה לזכור את התוכן בעצמך, ואז לחץ &quot;הצג תוכן&quot; לבדיקה</p>
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
      <div className={classNames(styles.myFooter, styles.div2)}>
        {currentCard && !showContent && (
          <Button onClick={revealContent} className={styles.footerBtn}>
            <Eye size={16} />
            הצג תוכן
          </Button>
        )}
        {currentCard && showContent && (
          <>
            <Button onClick={studyAgain} variant="outline" className={styles.footerBtn}>
              <Repeat size={16} />
              לשינון חוזר
            </Button>
            <Button onClick={studyLater} className={styles.footerBtn}>
              <CalendarClock size={16} />
              שינון בעתיד
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
