import * as React from "react";
import { Sparkles, Save } from "lucide-react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/cards";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Textarea } from "~/components/ui/textarea/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "~/components/ui/alert-dialog/alert-dialog";
import { getStudent, getCourses } from "~/services/settings.service";
import { getCards, addCard, updateCard } from "~/services/cards.service";
import type { CardRow } from "~/services/cards.service";
import styles from "./cards.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כרטיסי סיכום - מערכת ניהול לימודים" }];
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

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const courseId = formData.get("courseId") as string;
  const title = formData.get("title") as string;
  const topic = formData.get("topic") as string;
  const lectureNumberRaw = formData.get("lectureNumber") as string;
  const content = formData.get("content") as string;

  if (!courseId || !title || !topic || !content) {
    return { ok: false, error: "יש למלא את כל השדות הנדרשים" };
  }

  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;

  if (intent === "edit") {
    const cardId = formData.get("cardId") as string;
    if (!cardId) return { ok: false, error: "מזהה הכרטיס חסר" };
    return updateCard({ id: cardId, title, topic, lectureNumber, content });
  }

  const student = await getStudent();
  if (!student) {
    return { ok: false, error: "לא נמצא סטודנט — הגדר סטודנט בהגדרות" };
  }

  return addCard({
    studentId: student.id,
    courseId,
    title,
    topic,
    lectureNumber,
    content,
  });
}

export default function Cards({ loaderData }: Route.ComponentProps) {
  const { courses, cards } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";
  const actionData = fetcher.data;

  const [editingCard, setEditingCard] = React.useState<CardRow | null>(null);
  const [cardTitle, setCardTitle] = React.useState("");
  const [selectedCourse, setSelectedCourse] = React.useState(courses[0]?.course_id ?? "");
  const [cardTopic, setCardTopic] = React.useState("");
  const [lectureNumber, setLectureNumber] = React.useState("");
  const [cardContent, setCardContent] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = React.useState(false);

  // Unsaved-changes guard
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);

  /** Returns true when the form has unsaved content worth warning about */
  const isFormDirty = React.useCallback(() => {
    if (editingCard) {
      return (
        cardTitle !== editingCard.title ||
        cardTopic !== editingCard.topic ||
        cardContent !== editingCard.content ||
        lectureNumber !== (editingCard.lecture_number != null ? String(editingCard.lecture_number) : "")
      );
    }
    // Create mode: warn if any field has been touched
    return cardTitle.trim() !== "" || cardTopic.trim() !== "" || cardContent.trim() !== "";
  }, [editingCard, cardTitle, cardTopic, cardContent, lectureNumber]);

  /** Runs the pending action if form is clean, otherwise shows the dialog */
  const guardedAction = React.useCallback(
    (action: () => void) => {
      if (isFormDirty()) {
        pendingActionRef.current = action;
        setShowUnsavedDialog(true);
      } else {
        action();
      }
    },
    [isFormDirty]
  );

  const clearForm = () => {
    setEditingCard(null);
    setCardTitle("");
    setCardTopic("");
    setLectureNumber("");
    setCardContent("");
    setFeedback(null);
  };

  const handleSaveFromDialog = () => {
    setShowUnsavedDialog(false);
    // Submit the current form programmatically via fetcher
    const form = document.getElementById("card-editor-form") as HTMLFormElement | null;
    if (form) {
      const fd = new FormData(form);
      fetcher.submit(fd, { method: "post" });
    }
    // The pending action will run after the save effect fires
    // We store it so the useEffect can pick it up
  };

  const handleDiscardFromDialog = () => {
    setShowUnsavedDialog(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  };

  const handleCardClick = (card: CardRow) => {
    const doSwitch = () => {
      setEditingCard(card);
      setCardTitle(card.title);
      setCardTopic(card.topic);
      setLectureNumber(card.lecture_number != null ? String(card.lecture_number) : "");
      setCardContent(card.content);
      setFeedback(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    // Don't guard if clicking the already-active card
    if (editingCard?.id === card.id) return;
    guardedAction(doSwitch);
  };

  // After a successful save, sync editingCard snapshot so dirty-check resets,
  // then run any pending dialog action (without clearing the form).
  React.useEffect(() => {
    if (actionData?.ok) {
      // Keep the form as-is; just update the snapshot so isFormDirty() → false
      setEditingCard((prev) =>
        prev
          ? { ...prev, title: cardTitle, topic: cardTopic, content: cardContent, lecture_number: lectureNumber ? parseInt(lectureNumber, 10) : null }
          : prev
      );
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    }
  }, [actionData]);

  const filteredCards = selectedCourse
    ? cards.filter((c) => c.course_id === selectedCourse)
    : cards;

  const selectedCourseName =
    courses.find((c) => c.course_id === selectedCourse)?.course_name ?? "";

  const isFormValid = selectedCourse && cardTitle.trim() && cardTopic.trim() && cardContent.trim();

  const handleGetFeedback = async () => {
    setIsLoadingFeedback(true);
    setTimeout(() => {
      setFeedback(`משוב על הכרטיס:

✅ נקודות חוזק:
- הסיכום מכסה את המושגים העיקריים
- השפה ברורה ומדויקת
- המבנה לוגי וקל לקריאה

⚠️ מושגים חסרים:
- לא הוזכרה התופעה של רזוננס
- חסר הסבר על כללי הוקל
- לא נדונו דוגמאות של תרכובות הטרוציקליות

❌ טעויות לתיקון:
- בנזן אינו בעל "קשרים כפולים" אלא מערכת מצומדת
- מספר האלקטרונים המצומדים צריך להיות 4n+2 (כלל הוקל)

💡 המלצות:
- הוסף דיאגרמות של מבנים מולקולריים
- הרחב את הדוגמאות לתרכובות נוספות
- הוסף השוואה לתרכובות לא-ארומטיות`);
      setIsLoadingFeedback(false);
    }, 2000);
  };

  const handleCourseChange = (value: string) => {
    guardedAction(() => {
      setSelectedCourse(value);
      clearForm();
    });
  };

  const courseSelector = (
    <Select value={selectedCourse} onValueChange={handleCourseChange}>
      <SelectTrigger className={styles.headerCourseSelect}>
        <SelectValue placeholder="בחר קורס" />
      </SelectTrigger>
      <SelectContent>
        {courses.length === 0 ? (
          <SelectItem value="_none" disabled>
            אין קורסים — הוסף קורס בהגדרות
          </SelectItem>
        ) : (
          courses.map((course) => (
            <SelectItem key={course.id} value={course.course_id}>
              {course.course_name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout title="כרטיסי סיכום" headerExtra={courseSelector}>
      <div className={styles.cards}>
        <div className={styles.editor}>
          <div className={styles.editorHeader}>
            <h2 className={styles.editorTitle}>
              {editingCard ? "ערוך כרטיס" : "כרטיס סיכום חדש"}
            </h2>
            {selectedCourseName && (
              <span className={styles.editorCourseTag}>{selectedCourseName}</span>
            )}
            {editingCard && (
              <Button
                type="button"
                variant="outline"
                onClick={() => guardedAction(clearForm)}
                className={styles.newCardBtn}
              >
                + כרטיס חדש
              </Button>
            )}
          </div>

          <fetcher.Form id="card-editor-form" method="post" className={styles.editorForm}>
            <input type="hidden" name="courseId" value={selectedCourse} />
            <input type="hidden" name="intent" value={editingCard ? "edit" : "create"} />
            {editingCard && (
              <input type="hidden" name="cardId" value={editingCard.id} />
            )}

            <div>
              <Label htmlFor="cardTitle">כותרת</Label>
              <Input
                id="cardTitle"
                name="title"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="לדוגמה: סיכום הרצאה 5 - תרכובות ארומטיות"
              />
            </div>

            <div className={styles.formRow}>
              <div>
                <Label htmlFor="cardTopic">נושא</Label>
                <Input
                  id="cardTopic"
                  name="topic"
                  value={cardTopic}
                  onChange={(e) => setCardTopic(e.target.value)}
                  placeholder="לדוגמה: תרכובות ארומטיות"
                />
              </div>
              <div>
                <Label htmlFor="cardLecture">מספר הרצאה (אופציונלי)</Label>
                <Input
                  id="cardLecture"
                  name="lectureNumber"
                  type="number"
                  min={1}
                  value={lectureNumber}
                  onChange={(e) => setLectureNumber(e.target.value)}
                  placeholder="לדוגמה: 3"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cardContent">תוכן הסיכום</Label>
              <Textarea
                id="cardContent"
                name="content"
                value={cardContent}
                onChange={(e) => setCardContent(e.target.value)}
                placeholder="כתוב את הסיכום שלך כאן..."
                rows={12}
                style={{ fontFamily: "var(--font-body)", resize: "vertical" }}
                className={styles.textarea}
              />
            </div>

            <div className={styles.editorActions}>
              <Button type="submit" variant="outline" disabled={!isFormValid || isSaving}>
                <Save style={{ marginLeft: "var(--space-2)" }} />
                {isSaving ? "שומר..." : editingCard ? "שמור שינויים" : "שמור כרטיס"}
              </Button>
              <Button
                type="button"
                onClick={handleGetFeedback}
                disabled={!cardContent || isLoadingFeedback}
              >
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isLoadingFeedback ? "מקבל משוב..." : "קבל משוב מה-AI"}
              </Button>
            </div>

            {actionData && !actionData.ok && actionData.error && (
              <div className={styles.errorMessage}>{actionData.error}</div>
            )}

            {actionData?.ok && (
              <div className={styles.successMessage}>הכרטיס נשמר בהצלחה!</div>
            )}

            {feedback && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackTitle}>
                  <Sparkles />
                  משוב מהבינה המלאכותית
                </h3>
                <div className={styles.feedbackContent}>{feedback}</div>
              </div>
            )}
          </fetcher.Form>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>
            הכרטיסים שלי
            {selectedCourseName && (
              <span className={styles.sectionCourse}>{selectedCourseName}</span>
            )}
          </h2>
          {filteredCards.length === 0 ? (
            <p className={styles.emptyState}>
              {selectedCourse
                ? `אין כרטיסים לקורס זה עדיין — צור כרטיס סיכום חדש למעלה`
                : `אין כרטיסים עדיין — בחר קורס וצור כרטיס סיכום`}
            </p>
          ) : (
            <div className={styles.cardsList}>
              {filteredCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`${styles.savedCard} ${editingCard?.id === card.id ? styles.savedCardActive : ""}`}
                  onClick={() => handleCardClick(card)}
                >
                  <h3 className={styles.savedCardTitle}>{card.title}</h3>
                  <p className={styles.savedCardMeta}>
                    {card.topic}
                    {card.lecture_number ? ` · הרצאה ${card.lecture_number}` : ""}
                  </p>
                  <p className={styles.savedCardContent}>{card.content}</p>
                  <span className={styles.savedCardDate}>
                    {new Date(card.created_at).toLocaleDateString("he-IL")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>יש שינויים שלא נשמרו</AlertDialogTitle>
            <AlertDialogDescription>
              האם ברצונך לשמור את השינויים לפני המעבר?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardFromDialog}>
              בטל שינויים
            </AlertDialogCancel>
            <button
              type="button"
              className={styles.dialogSaveBtn}
              onClick={handleSaveFromDialog}
              disabled={!isFormValid}
            >
              <Save style={{ marginLeft: "var(--space-2)", width: 16, height: 16 }} />
              שמור שינויים
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
