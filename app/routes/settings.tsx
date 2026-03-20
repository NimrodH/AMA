import * as React from "react";
import { Plus, Bell, X, Trash2, HelpCircle, GripVertical } from "lucide-react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Switch } from "~/components/ui/switch/switch";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "~/components/ui/alert-dialog/alert-dialog";
import {
  getStudent,
  getCourses,
  getReminders,
  updateStudentName,
  addCourse,
  toggleCourse,
  deleteCourse,
  addReminder,
  toggleReminder,
  deleteReminder,
  getArticleQuestions,
  addArticleQuestion,
  deleteArticleQuestion,
  type ArticleQuestionRow,
} from "~/services/settings.service";
import { DAY_OPTIONS, formatReminderTime } from "~/lib/reminder-utils";
import styles from "./settings.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "הגדרות - מערכת ניהול לימודים" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader() {
  const student = await getStudent();
  if (!student) return { student: null, courses: [], reminders: [], articleQuestions: [] };

  const [courses, reminders, articleQuestions] = await Promise.all([
    getCourses(student.id),
    getReminders(student.id),
    getArticleQuestions(student.id),
  ]);

  return { student, courses, reminders, articleQuestions };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const studentId = formData.get("student_id") as string;

  switch (intent) {
    case "update_name": {
      const name = formData.get("name") as string;
      if (name?.trim()) await updateStudentName(studentId, name.trim());
      break;
    }
    case "add_course": {
      const courseId = formData.get("course_id") as string;
      const courseName = formData.get("course_name") as string;
      if (courseId?.trim() && courseName?.trim()) {
        await addCourse(studentId, courseId.trim(), courseName.trim());
      }
      break;
    }
    case "toggle_course": {
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleCourse(id, isActive);
      break;
    }
    case "delete_course": {
      const id = formData.get("id") as string;
      const courseId = formData.get("course_id") as string;
      if (id && studentId && courseId) await deleteCourse(id, studentId, courseId);
      break;
    }
    case "add_reminder": {
      const reminderType = formData.get("reminder_type") as string;
      const reminderTime = formData.get("reminder_time") as string;
      if (reminderType?.trim() && reminderTime?.trim()) {
        await addReminder(studentId, reminderType.trim(), reminderTime.trim());
      }
      break;
    }
    case "toggle_reminder": {
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleReminder(id, isActive);
      break;
    }
    case "delete_reminder": {
      const id = formData.get("id") as string;
      if (id) await deleteReminder(id);
      break;
    }
    case "add_article_question": {
      const question = formData.get("question") as string;
      const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
      if (question?.trim()) await addArticleQuestion(studentId, question.trim(), sortOrder);
      break;
    }
    case "delete_article_question": {
      const id = formData.get("id") as string;
      if (id) await deleteArticleQuestion(id);
      break;
    }
  }

  return { ok: true };
}

// ─── Course Delete Dialog ────────────────────────────────────────────────────

const CONFIRM_PHRASE = "delete all";

interface CourseDeleteDialogProps {
  courseName: string;
  onConfirm: () => void;
}

function CourseDeleteDialog({ courseName, onConfirm }: CourseDeleteDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setInputValue("");
  }

  function handleConfirm() {
    if (inputValue.trim().toLowerCase() !== CONFIRM_PHRASE) return;
    onConfirm();
    setOpen(false);
    setInputValue("");
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className={styles.deleteCourseBtn} title="Delete course permanently">
          <Trash2 size={15} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{courseName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the course and <strong>all its cards, sources, and exams</strong>. This action
            cannot be undone.
            <br />
            <br />
            Type <strong>{CONFIRM_PHRASE}</strong> to confirm:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={inputValue.trim().toLowerCase() !== CONFIRM_PHRASE}
            onClick={handleConfirm}
          >
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { student, courses, reminders, articleQuestions } = loaderData;
  const fetcher = useFetcher();

  // Add course form state
  const [showAddCourse, setShowAddCourse] = React.useState(false);
  const [newCourseId, setNewCourseId] = React.useState("");
  const [newCourseName, setNewCourseName] = React.useState("");

  // Add article question form state
  const [showAddQuestion, setShowAddQuestion] = React.useState(false);
  const [newQuestion, setNewQuestion] = React.useState("");

  // Add reminder form state
  const [showAddReminder, setShowAddReminder] = React.useState(false);
  const [newReminderType, setNewReminderType] = React.useState("");
  const [newReminderDay, setNewReminderDay] = React.useState("daily");
  const [newReminderHour, setNewReminderHour] = React.useState("08:00");

  // Reset forms after successful submission
  const prevFetcherState = React.useRef(fetcher.state);
  React.useEffect(() => {
    if (prevFetcherState.current !== "idle" && fetcher.state === "idle") {
      setShowAddCourse(false);
      setNewCourseId("");
      setNewCourseName("");
      setShowAddReminder(false);
      setNewReminderType("");
      setNewReminderDay("daily");
      setNewReminderHour("08:00");
      setShowAddQuestion(false);
      setNewQuestion("");
    }
    prevFetcherState.current = fetcher.state;
  }, [fetcher.state]);

  function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    submitIntent({
      intent: "add_article_question",
      question: newQuestion,
      sort_order: String(articleQuestions.length),
    });
  }

  if (!student) {
    return (
      <AppLayout title="הגדרות">
        <p style={{ padding: "var(--space-6)", color: "var(--color-error-11)" }}>לא נמצא סטודנט במסד הנתונים.</p>
      </AppLayout>
    );
  }

  function submitIntent(data: Record<string, string>) {
    fetcher.submit({ student_id: student!.id, ...data }, { method: "POST" });
  }

  function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseId.trim() || !newCourseName.trim()) return;
    submitIntent({
      intent: "add_course",
      course_id: newCourseId,
      course_name: newCourseName,
    });
  }

  function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderType.trim() || !newReminderHour.trim()) return;
    // Store as structured "DAY_CODE|HH:MM" string
    const reminderTime = `${newReminderDay}|${newReminderHour}`;
    submitIntent({
      intent: "add_reminder",
      reminder_type: newReminderType,
      reminder_time: reminderTime,
    });
  }

  return (
    <AppLayout title="הגדרות">
      <div className={styles.settings}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>תזכורות</h2>
            <p className={styles.sectionDescription}>הגדר תזכורות לפעולות שונות</p>
          </div>

          <div className={styles.remindersList}>
            {reminders.map((reminder) => (
              <div key={reminder.id} className={styles.reminderItem}>
                <div className={styles.reminderInfo}>
                  <div className={styles.reminderIcon}>
                    <Bell />
                  </div>
                  <div className={styles.reminderDetails}>
                    <h3 className={styles.reminderType}>{reminder.reminder_type}</h3>
                    <p className={styles.reminderTime}>{formatReminderTime(reminder.reminder_time)}</p>
                  </div>
                </div>
                <div className={styles.reminderActions}>
                  <Switch
                    checked={reminder.is_active}
                    onCheckedChange={(checked) =>
                      submitIntent({ intent: "toggle_reminder", id: reminder.id, is_active: String(checked) })
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitIntent({ intent: "delete_reminder", id: reminder.id })}
                    className={styles.removeReminderBtn}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            ))}

            {showAddReminder && (
              <form className={styles.addCourseForm} onSubmit={handleAddReminder}>
                <div className={styles.addCourseFields}>
                  <Input
                    placeholder="תיאור התזכורת (למשל: לחזור על חומר)"
                    value={newReminderType}
                    onChange={(e) => setNewReminderType(e.target.value)}
                    autoFocus
                  />
                  <div className={styles.reminderTimeRow}>
                    <select
                      className={styles.reminderSelect}
                      value={newReminderDay}
                      onChange={(e) => setNewReminderDay(e.target.value)}
                    >
                      {DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.reminderTimeLabel}>בשעה</span>
                    <input
                      type="time"
                      className={styles.reminderSelect}
                      value={newReminderHour}
                      onChange={(e) => setNewReminderHour(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newReminderType.trim() || fetcher.state !== "idle"}>
                    הוסף
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddReminder(false);
                      setNewReminderType("");
                      setNewReminderDay("daily");
                      setNewReminderHour("08:00");
                    }}
                  >
                    <X style={{ marginLeft: "var(--space-2)" }} />
                    ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>

          {!showAddReminder && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddReminder(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />
              הוסף תזכורת חדשה
            </Button>
          )}
        </div>
        {/* Personal Info */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>פרטים אישיים</h2>
            <p className={styles.sectionDescription}>עדכן את הפרטים האישיים שלך</p>
          </div>
          <fetcher.Form method="POST" className={styles.form}>
            <input type="hidden" name="intent" value="update_name" />
            <input type="hidden" name="student_id" value={student.id} />
            <div>
              <Label htmlFor="studentName">שם מלא</Label>
              <Input id="studentName" name="name" defaultValue={student.name} />
            </div>
            <div>
              <Label htmlFor="studentId">מזהה סטודנט</Label>
              <Input id="studentId" value={student.id} disabled />
            </div>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              שמור שינויים
            </Button>
          </fetcher.Form>
        </div>

        {/* Courses */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>הקורסים שלי</h2>
            <p className={styles.sectionDescription}>נהל את רשימת הקורסים שלך</p>
          </div>

          <div className={styles.coursesList}>
            {courses.map((course) => (
              <div key={course.id} className={styles.courseItem}>
                <div className={styles.courseInfo}>
                  <h3 className={styles.courseName}>{course.course_name}</h3>
                  <p className={styles.courseId}>{course.course_id}</p>
                </div>
                <div className={styles.courseActions}>
                  <Switch
                    checked={course.is_active}
                    onCheckedChange={(checked) =>
                      submitIntent({ intent: "toggle_course", id: course.id, is_active: String(checked) })
                    }
                  />
                  <CourseDeleteDialog
                    courseName={course.course_name}
                    onConfirm={() =>
                      submitIntent({
                        intent: "delete_course",
                        id: course.id,
                        course_id: course.course_id,
                      })
                    }
                  />
                </div>
              </div>
            ))}

            {showAddCourse && (
              <form className={styles.addCourseForm} onSubmit={handleAddCourse}>
                <div className={styles.addCourseFields}>
                  <Input
                    placeholder="שם הקורס"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    autoFocus
                  />
                  <Input
                    placeholder="קוד קורס (לדוג׳ chem101)"
                    value={newCourseId}
                    onChange={(e) => setNewCourseId(e.target.value)}
                  />
                </div>
                <div className={styles.addFormActions}>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newCourseName.trim() || !newCourseId.trim() || fetcher.state !== "idle"}
                  >
                    הוסף
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddCourse(false);
                      setNewCourseId("");
                      setNewCourseName("");
                    }}
                  >
                    <X style={{ marginLeft: "var(--space-2)" }} />
                    ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>

          {!showAddCourse && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddCourse(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />
              הוסף קורס חדש
            </Button>
          )}
        </div>
        {/* Article Analysis Questions */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>שאלות לניתוח מאמר</h2>
            <p className={styles.sectionDescription}>
              הגדר את רשימת השאלות שישמשו לניתוח מאמרים. השאלות יוצגו בעמוד ניתוח המאמר.
            </p>
          </div>

          <div className={styles.questionsList}>
            {articleQuestions.map((q, idx) => (
              <div key={q.id} className={styles.questionItem}>
                <div className={styles.questionIndex}>
                  <GripVertical size={16} />
                  <span>{idx + 1}</span>
                </div>
                <p className={styles.questionText}>{q.question}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitIntent({ intent: "delete_article_question", id: q.id })}
                  className={styles.removeReminderBtn}
                  title="מחק שאלה"
                >
                  <X />
                </Button>
              </div>
            ))}

            {articleQuestions.length === 0 && !showAddQuestion && (
              <div className={styles.emptyQuestions}>
                <HelpCircle size={32} />
                <p>טרם הוגדרו שאלות לניתוח מאמר</p>
              </div>
            )}

            {showAddQuestion && (
              <form className={styles.addCourseForm} onSubmit={handleAddQuestion}>
                <div className={styles.addCourseFields}>
                  <textarea
                    className={styles.questionTextarea}
                    placeholder="כתוב את השאלה כאן..."
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newQuestion.trim() || fetcher.state !== "idle"}>
                    הוסף
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddQuestion(false);
                      setNewQuestion("");
                    }}
                  >
                    <X style={{ marginLeft: "var(--space-2)" }} />
                    ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>

          {!showAddQuestion && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddQuestion(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />
              הוסף שאלה חדשה
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
