import * as React from "react";
import { Sparkles, Save, Trash2, Hash, BookOpen, ArrowLeft, FileText } from "lucide-react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/cards";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Textarea } from "~/components/ui/textarea/textarea";
import { RichTextEditor } from "~/components/rich-text-editor/rich-text-editor";
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
import { getStudentById, getActiveCourses } from "~/services/settings.service";
import { getSession, requireSession } from "~/lib/auth.server";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { getCards, addCard, updateCard, deleteCard, getNextCardNumber } from "~/services/cards.service";
import type { CardRow } from "~/services/cards.service";
import { makeClientLoader, makeClientAction } from "~/lib/client-auth-loader";
import styles from "./cards.module.css";
import { toEditorState, fromEditorState } from "~/lib/lexical-utils";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כרטיסי סיכום - מערכת ניהול לימודים" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session) return { courses: [], cards: [] };
  const student = await getStudentById(session.studentId, request);
  if (!student) return { courses: [], cards: [] };
  const [courses, cards] = await Promise.all([getActiveCourses(student.id, request), getCards(student.id, request)]);
  return { courses, cards };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

export const clientAction = makeClientAction<typeof action>();

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Handle delete first — it doesn't need the full form fields
  if (intent === "delete") {
    const cardId = formData.get("cardId") as string;
    if (!cardId) return { ok: false, error: "מזהה הכרטיס חסר" };
    return deleteCard(cardId, request);
  }

  // For create / edit, all fields are required
  const courseId = formData.get("courseId") as string;
  const title = formData.get("title") as string;
  const topic = formData.get("topic") as string;
  const lectureNumberRaw = formData.get("lectureNumber") as string;
  const cardNumberRaw = formData.get("cardNumber") as string;
  const content = formData.get("content") as string;

  if (!courseId || !title || !topic || !content) {
    return { ok: false, error: "יש למלא את כל השדות הנדרשים" };
  }

  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;
  const cardNumber = cardNumberRaw ? parseFloat(cardNumberRaw) : null;

  if (intent === "edit") {
    const cardId = formData.get("cardId") as string;
    if (!cardId) return { ok: false, error: "מזהה הכרטיס חסר" };
    return updateCard({ id: cardId, title, topic, lectureNumber, cardNumber, content, request });
  }

  return addCard({
    studentId: session.studentId,
    courseId,
    title,
    topic,
    lectureNumber,
    cardNumber,
    content,
    request,
  });
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Cards({ loaderData }: Route.ComponentProps) {
  const { courses, cards } = loaderData as LoaderData;
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";
  const actionData = fetcher.data;

  const [editingCard, setEditingCard] = React.useState<CardRow | null>(null);
  const [cardTitle, setCardTitle] = React.useState("");
  const [selectedCourse, setSelectedCourse] = React.useState(() => {
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return courses[0]?.course_id ?? "";
  });
  const [cardTopic, setCardTopic] = React.useState("");
  const [lectureNumber, setLectureNumber] = React.useState("");
  const [cardNumber, setCardNumber] = React.useState("");
  const [isAutoFilling, setIsAutoFilling] = React.useState(false);
  const [cardContent, setCardContent] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [feedbackSources, setFeedbackSources] = React.useState<{ topic: string; lectureNumber: number | null }[]>([]);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = React.useState(false);
  const [additionalInstruction, setAdditionalInstruction] = React.useState("");

  // Unsaved-changes guard
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const saveAndNextRef = React.useRef(false);
  const [editorKey, setEditorKey] = React.useState(0);

  /** Returns true when the form has unsaved content worth warning about */
  const isFormDirty = React.useCallback(() => {
    if (editingCard) {
      return (
        cardTitle !== editingCard.title ||
        cardTopic !== editingCard.topic ||
        cardContent !== editingCard.content ||
        lectureNumber !== (editingCard.lecture_number != null ? String(editingCard.lecture_number) : "") ||
        cardNumber !== (editingCard.card_number != null ? String(editingCard.card_number) : "")
      );
    }
    // Create mode: warn if any field has been touched
    return cardTitle.trim() !== "" || cardTopic.trim() !== "" || fromEditorState(cardContent).trim() !== "";
  }, [editingCard, cardTitle, cardTopic, cardContent, lectureNumber, cardNumber]);

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
    [isFormDirty],
  );

  const clearForm = () => {
    setEditingCard(null);
    setCardTitle("");
    setCardTopic("");
    setLectureNumber("");
    setCardNumber("");
    setCardContent("");
    setFeedback(null);
    setShowSuccess(false);
    setAdditionalInstruction("");
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

  const handleAutoFillCardNumber = async () => {
    if (!selectedCourse) return;
    setIsAutoFilling(true);
    try {
      const res = await fetch(`/api/next-card-number?courseId=${encodeURIComponent(selectedCourse)}`);
      if (res.ok) {
        const { nextNumber } = (await res.json()) as { nextNumber: number };
        setCardNumber(String(nextNumber));
      }
    } catch {
      // silently fail — user can type manually
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleCardClick = (card: CardRow) => {
    const doSwitch = () => {
      setEditingCard(card);
      setCardTitle(card.title);
      setCardTopic(card.topic);
      setLectureNumber(card.lecture_number != null ? String(card.lecture_number) : "");
      setCardNumber(card.card_number != null ? String(card.card_number) : "");
      // Convert plain-text (legacy) or pass through Lexical JSON
      setCardContent(toEditorState(card.content));
      setFeedback(null);
      setShowSuccess(false);
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
      if (saveAndNextRef.current) {
        // Save & Next flow: clear title + content, keep topic + lecture, increment card number
        saveAndNextRef.current = false;
        setCardTitle("");
        setCardContent("");
        setEditorKey((k) => k + 1);
        setCardNumber((prev) => {
          const n = parseFloat(prev);
          return isNaN(n) ? "" : String(Math.floor(n) + 1);
        });
        setShowSuccess(true);
      } else {
        // Keep the form as-is; just update the snapshot so isFormDirty() → false
        setEditingCard((prev) =>
          prev
            ? {
                ...prev,
                title: cardTitle,
                topic: cardTopic,
                content: cardContent,
                lecture_number: lectureNumber ? parseInt(lectureNumber, 10) : null,
                card_number: cardNumber ? parseFloat(cardNumber) : null,
              }
            : prev,
        );
        setShowSuccess(true);
        const pending = pendingActionRef.current;
        pendingActionRef.current = null;
        pending?.();
      }
    }
  }, [actionData]);

  const deleteFetcher = useFetcher<typeof action>();

  // When a delete succeeds, clear the editor if we were editing that card
  const deletingCardId = deleteFetcher.formData?.get("cardId") as string | undefined;
  React.useEffect(() => {
    if (deleteFetcher.data?.ok && deletingCardId && editingCard?.id === deletingCardId) {
      clearForm();
    }
  }, [deleteFetcher.data]);

  const filteredCards = selectedCourse ? cards.filter((c) => c.course_id === selectedCourse) : cards;

  const [isExporting, setIsExporting] = React.useState(false);
  const [exportSuccess, setExportSuccess] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const handleCardsToLecture = async () => {
    if (!selectedCourse || filteredCards.length === 0) return;
    setIsExporting(true);
    setExportSuccess(false);
    setExportError(null);
    try {
      const res = await fetch("/api/cards-to-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 4000);
      } else {
        setExportError(data.error ?? "שגיאה ביצוא הכרטיסים");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportError(`שגיאה: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedCourseName = courses.find((c) => c.course_id === selectedCourse)?.course_name ?? "";

  const isFormValid = selectedCourse && cardTitle.trim() && cardTopic.trim() && fromEditorState(cardContent).trim();

  const handleGetFeedback = async () => {
    if (!selectedCourse || !cardContent) return;
    setIsLoadingFeedback(true);
    setFeedback(null);
    setFeedbackSources([]);
    try {
      // Encode title + content together so the AI understands the concept/question
      // vs definition/answer structure of the card.
      // Extract plain text from Lexical JSON for the AI
      const plainContent = fromEditorState(cardContent);
      const encodedContent = cardTitle.trim() ? `${cardTitle.trim()}\n---\n${plainContent}` : plainContent;

      const res = await fetch("/api/card-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse,
          lectureNumber: lectureNumber || null,
          cardContent: encodedContent,
          additionalInstruction: additionalInstruction.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        feedback?: string;
        sourcesUsed?: { topic: string; lectureNumber: number | null }[];
        error?: string;
      };
      if (data.ok && data.feedback) {
        setFeedback(data.feedback);
        setFeedbackSources(data.sourcesUsed ?? []);
      } else {
        setFeedback(`שגיאה: ${data.error ?? "לא התקבל משוב"}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[card-feedback] client error:", message);
      setFeedback(`שגיאה בקבלת משוב: ${message}`);
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleCourseChange = (value: string) => {
    guardedAction(() => {
      setSelectedCourse(value);
      writeSelectedCourse(value);
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
            <h2 className={styles.editorTitle}>{editingCard ? "ערוך כרטיס" : "כרטיס סיכום חדש"}</h2>
            {selectedCourseName && <span className={styles.editorCourseTag}>{selectedCourseName}</span>}
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
            {editingCard && <input type="hidden" name="cardId" value={editingCard.id} />}

            <div>
              <Label htmlFor="cardTitle">שאלה</Label>
              <Input
                id="cardTitle"
                name="title"
                value={cardTitle}
                onChange={(e) => {
                  setCardTitle(e.target.value);
                  setShowSuccess(false);
                }}
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
                  onChange={(e) => {
                    setCardTopic(e.target.value);
                    setShowSuccess(false);
                  }}
                  placeholder="לדוגמה: תרכובות ארומטיות"
                />
              </div>
              <div>
                <Label htmlFor="cardLecture">מס. הרצאה</Label>
                <Input
                  id="cardLecture"
                  name="lectureNumber"
                  type="number"
                  min={1}
                  value={lectureNumber}
                  onChange={(e) => {
                    setLectureNumber(e.target.value);
                    setShowSuccess(false);
                  }}
                  placeholder="לדוגמה: 3"
                />
              </div>
              <div>
                <Label htmlFor="cardNumber">מס. כרטיס </Label>
                <div className={styles.cardNumberRow}>
                  <Input
                    id="cardNumber"
                    name="cardNumber"
                    type="text"
                    inputMode="decimal"
                    value={cardNumber}
                    onChange={(e) => {
                      setCardNumber(e.target.value);
                      setShowSuccess(false);
                    }}
                    placeholder="לדוגמה: 1.1"
                  />
                  <button
                    type="button"
                    className={styles.autoFillBtn}
                    onClick={handleAutoFillCardNumber}
                    disabled={isAutoFilling || !selectedCourse}
                    title="מלא אוטומטית את המספר הבא בקורס"
                    aria-label="מספר כרטיס הבא"
                  >
                    <Hash size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <Label>תוכן הסיכום</Label>
              {/* Hidden input carries the serialized editor state to the form action */}
              <input type="hidden" name="content" value={cardContent} />
              <RichTextEditor
                composerKey={editingCard?.id ?? `new-${editorKey}`}
                initialValue={cardContent}
                onChange={(serialized) => {
                  setCardContent(serialized);
                  setShowSuccess(false);
                }}
                placeholder="כתוב את הסיכום שלך כאן..."
                className={styles.richEditor}
              />
            </div>

            <div className={styles.additionalInstructionField}>
              <Label htmlFor="additionalInstruction">הוראות נוספות ל-AI (אופציונלי)</Label>
              <Textarea
                id="additionalInstruction"
                value={additionalInstruction}
                onChange={(e) => setAdditionalInstruction(e.target.value)}
                placeholder="לדוגמה: התמקד בהיבטים התרמודינמיים בלבד, או: השווה לשיטות חלופיות..."
                rows={2}
                style={{ fontFamily: "var(--font-body)", resize: "vertical" }}
                className={styles.textarea}
              />
            </div>

            <div className={styles.editorActions}>
              <Button type="submit" variant="outline" disabled={!isFormValid || isSaving}>
                <Save style={{ marginLeft: "var(--space-2)" }} />
                {isSaving ? "שומר..." : editingCard ? "שמור שינויים" : "שמור כרטיס"}
              </Button>
              {!editingCard && (
                <Button
                  type="submit"
                  variant="outline"
                  className={styles.saveAndNextBtn}
                  disabled={!isFormValid || isSaving}
                  onClick={() => { saveAndNextRef.current = true; }}
                >
                  <ArrowLeft style={{ marginLeft: "var(--space-2)" }} />
                  שמור והבא
                </Button>
              )}
              <Button type="button" onClick={handleGetFeedback} disabled={!cardContent || isLoadingFeedback}>
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isLoadingFeedback ? "מקבל משוב..." : "קבל משוב מה-AI"}
              </Button>
            </div>

            {actionData && !actionData.ok && actionData.error && (
              <div className={styles.errorMessage}>{actionData.error}</div>
            )}

            {showSuccess && <div className={styles.successMessage}>הכרטיס נשמר בהצלחה!</div>}

            {feedback && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackTitle}>
                  <Sparkles />
                  משוב מהבינה המלאכותית
                </h3>
                {feedbackSources.length > 0 && (
                  <div className={styles.feedbackSources}>
                    <BookOpen size={13} />
                    <span>מקורות ששימשו: </span>
                    {feedbackSources.map((s, i) => (
                      <span key={i} className={styles.feedbackSourceTag}>
                        {s.topic}
                        {s.lectureNumber ? ` (הרצאה ${s.lectureNumber})` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.feedbackContent}>{feedback}</div>
              </div>
            )}
          </fetcher.Form>
        </div>

        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              הכרטיסים שלי
              {selectedCourseName && <span className={styles.sectionCourse}>{selectedCourseName}</span>}
            </h2>
            {filteredCards.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className={styles.exportBtn}
                onClick={handleCardsToLecture}
                disabled={isExporting}
              >
                <FileText style={{ marginLeft: "var(--space-2)" }} />
                {isExporting ? "מייצא..." : "כרטיסים להרצאה"}
              </Button>
            )}
          </div>
          {exportSuccess && (
            <div className={styles.successMessage}>הכרטיסים יוצאו בהצלחה כהרצאה למקורות!</div>
          )}
          {exportError && (
            <div className={styles.errorMessage}>{exportError}</div>
          )}
          {filteredCards.length === 0 ? (
            <p className={styles.emptyState}>
              {selectedCourse
                ? `אין כרטיסים לקורס זה עדיין — צור כרטיס סיכום חדש למעלה`
                : `אין כרטיסים עדיין — בחר קורס וצור כרטיס סיכום`}
            </p>
          ) : (
            <div className={styles.cardsList}>
              {filteredCards.map((card) => {
                const isDeleting = deleteFetcher.state !== "idle" && deletingCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className={`${styles.savedCard} ${editingCard?.id === card.id ? styles.savedCardActive : ""} ${isDeleting ? styles.savedCardDeleting : ""}`}
                    onClick={() => handleCardClick(card)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleCardClick(card)}
                  >
                    <h3 className={styles.savedCardTitle}>{card.title}</h3>
                    <p className={styles.savedCardMeta}>
                      {card.card_number ? `#${card.card_number} · ` : ""}
                      {card.topic}
                      {card.lecture_number ? ` · הרצאה ${card.lecture_number}` : ""}
                    </p>
                    <p className={styles.savedCardContent}>{fromEditorState(card.content)}</p>
                    <div className={styles.savedCardFooter}>
                      <span className={styles.savedCardDate}>
                        {new Date(card.created_at).toLocaleDateString("he-IL")}
                      </span>
                      <deleteFetcher.Form method="post" onClick={(e) => e.stopPropagation()}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="cardId" value={card.id} />
                        <button
                          type="submit"
                          className={styles.deleteCardBtn}
                          disabled={isDeleting}
                          title="מחק כרטיס"
                          aria-label="מחק כרטיס"
                        >
                          <Trash2 size={14} />
                        </button>
                      </deleteFetcher.Form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>יש שינויים שלא נשמרו</AlertDialogTitle>
            <AlertDialogDescription>האם ברצונך לשמור את השינויים לפני המעבר?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardFromDialog}>בטל שינויים</AlertDialogCancel>
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
