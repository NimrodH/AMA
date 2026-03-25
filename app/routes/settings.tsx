import * as React from "react";
import { Plus, Bell, X, Trash2, HelpCircle, GripVertical, Users, Mail, Lock } from "lucide-react";
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
  getStudentById,
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
import { listGuests, createGuest, deleteGuest, type GuestRow } from "~/services/guests.service";
import { getSession, requireSession, hasAuthToken } from "~/lib/auth.server";
import { DAY_OPTIONS, formatReminderTime } from "~/lib/reminder-utils";
import { makeClientLoader, makeClientAction } from "~/lib/client-auth-loader";
import styles from "./settings.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "הגדרות - מערכת ניהול לימודים" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  if (!hasAuthToken(request)) return { student: null, courses: [], reminders: [], articleQuestions: [], guests: [], accountType: "student" as const };
  const session = await getSession(request);
  if (!session) return { student: null, courses: [], reminders: [], articleQuestions: [], guests: [], accountType: "student" as const };
  const student = await getStudentById(session.studentId, request);
  if (!student) return { student: null, courses: [], reminders: [], articleQuestions: [], guests: [], accountType: session.accountType };

  const [courses, reminders, articleQuestions, guests] = await Promise.all([
    getCourses(student.id, request),
    getReminders(student.id, request),
    getArticleQuestions(student.id, request),
    session.accountType === "student"
      ? listGuests(session.studentId, request).catch(() => [] as GuestRow[])
      : Promise.resolve([] as GuestRow[]),
  ]);

  return { student, courses, reminders, articleQuestions, guests, accountType: session.accountType };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

export const clientAction = makeClientAction<typeof action>();

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const studentId = session.studentId;

  switch (intent) {
    case "update_name": {
      if (session.accountType !== "student") break;
      const name = formData.get("name") as string;
      if (name?.trim()) await updateStudentName(studentId, name.trim(), request);
      break;
    }
    case "add_course": {
      if (session.accountType !== "student") break;
      const courseId = formData.get("course_id") as string;
      const courseName = formData.get("course_name") as string;
      if (courseId?.trim() && courseName?.trim()) {
        await addCourse(studentId, courseId.trim(), courseName.trim(), request);
      }
      break;
    }
    case "toggle_course": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleCourse(id, isActive, request);
      break;
    }
    case "delete_course": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const courseId = formData.get("course_id") as string;
      if (id && studentId && courseId) await deleteCourse(id, studentId, courseId, request);
      break;
    }
    case "add_reminder": {
      if (session.accountType !== "student") break;
      const reminderType = formData.get("reminder_type") as string;
      const reminderTime = formData.get("reminder_time") as string;
      if (reminderType?.trim() && reminderTime?.trim()) {
        await addReminder(studentId, reminderType.trim(), reminderTime.trim(), request);
      }
      break;
    }
    case "toggle_reminder": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleReminder(id, isActive, request);
      break;
    }
    case "delete_reminder": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      if (id) await deleteReminder(id, request);
      break;
    }
    case "add_article_question": {
      if (session.accountType !== "student") break;
      const question = formData.get("question") as string;
      const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
      if (question?.trim()) await addArticleQuestion(studentId, question.trim(), sortOrder, request);
      break;
    }
    case "delete_article_question": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      if (id) await deleteArticleQuestion(id, request);
      break;
    }
    case "add_guest": {
      if (session.accountType !== "student") break;
      const guestName = (formData.get("guest_name") as string)?.trim();
      const guestEmail = (formData.get("guest_email") as string)?.trim();
      const guestPassword = (formData.get("guest_password") as string)?.trim();
      if (guestName && guestEmail && guestPassword) {
        try {
          await createGuest(guestName, guestEmail, guestPassword, studentId, request);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
      break;
    }
    case "delete_guest": {
      if (session.accountType !== "student") break;
      const guestId = formData.get("guest_id") as string;
      if (guestId) {
        try {
          await deleteGuest(guestId, studentId, request);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
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

// ─── Guests Section ──────────────────────────────────────────────────────────

interface GuestsSectionProps {
  guests: GuestRow[];
  onAdd: (name: string, email: string, password: string) => void;
  onDelete: (guestId: string) => void;
  isBusy: boolean;
  actionError?: string | null;
}

function GuestsSection({ guests, onAdd, onDelete, isBusy, actionError }: GuestsSectionProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    onAdd(name.trim(), email.trim(), password.trim());
    setShowForm(false);
    setName(""); setEmail(""); setPassword("");
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>אורחים</h2>
        <p className={styles.sectionDescription}>אורחים יכולים לצפות בכל הנתונים שלך במצב קריאה בלבד</p>
      </div>

      {actionError && <p className={styles.guestError}>{actionError}</p>}

      <div className={styles.guestsList}>
        {guests.length === 0 && !showForm && (
          <div className={styles.emptyGuests}>
            <Users size={32} />
            <p>לא הוגדרו אורחים עדיין</p>
          </div>
        )}
        {guests.map((guest) => (
          <div key={guest.id} className={styles.guestItem}>
            <div className={styles.guestInfo}>
              <div className={styles.guestIcon}><Users size={18} /></div>
              <div className={styles.guestDetails}>
                <h3 className={styles.guestName}>{guest.guest_name}</h3>
                <p className={styles.guestEmail}>{guest.guest_email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className={styles.removeReminderBtn}
              onClick={() => onDelete(guest.guest_id)} title="מחק אורח">
              <X />
            </Button>
          </div>
        ))}
        {showForm && (
          <form className={styles.addCourseForm} onSubmit={handleSubmit}>
            <div className={styles.addCourseFields}>
              <div className={styles.guestFieldRow}>
                <Users size={16} className={styles.guestFieldIcon} />
                <Input placeholder="שם האורח" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className={styles.guestFieldRow}>
                <Mail size={16} className={styles.guestFieldIcon} />
                <Input type="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </div>
              <div className={styles.guestFieldRow}>
                <Lock size={16} className={styles.guestFieldIcon} />
                <Input type="text" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              </div>
            </div>
            <div className={styles.addFormActions}>
              <Button type="submit" size="sm" disabled={!name.trim() || !email.trim() || !password.trim() || isBusy}>
                הוסף
              </Button>
              <Button type="button" variant="outline" size="sm"
                onClick={() => { setShowForm(false); setName(""); setEmail(""); setPassword(""); }}>
                <X style={{ marginLeft: "var(--space-2)" }} />ביטול
              </Button>
            </div>
          </form>
        )}
      </div>
      {!showForm && (
        <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowForm(true)}>
          <Plus style={{ marginLeft: "var(--space-2)" }} />הוסף אורח חדש
        </Button>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { student, courses, reminders, articleQuestions, guests, accountType } = loaderData as LoaderData;
  const fetcher = useFetcher<typeof action>();

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
      setNewCourseId(""); setNewCourseName("");
      setShowAddReminder(false);
      setNewReminderType(""); setNewReminderDay("daily"); setNewReminderHour("08:00");
      setShowAddQuestion(false);
      setNewQuestion("");
    }
    prevFetcherState.current = fetcher.state;
  }, [fetcher.state]);

  if (!student) {
    return (
      <AppLayout title="הגדרות">
        <p style={{ padding: "var(--space-6)", color: "var(--color-error-11)" }}>לא נמצא סטודנט במסד הנתונים.</p>
      </AppLayout>
    );
  }

  function submitIntent(data: Record<string, string>) {
    fetcher.submit({ ...data }, { method: "POST" });
  }

  function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseId.trim() || !newCourseName.trim()) return;
    submitIntent({ intent: "add_course", course_id: newCourseId, course_name: newCourseName });
  }

  function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderType.trim() || !newReminderHour.trim()) return;
    const reminderTime = `${newReminderDay}|${newReminderHour}`;
    submitIntent({ intent: "add_reminder", reminder_type: newReminderType, reminder_time: reminderTime });
  }

  function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    submitIntent({ intent: "add_article_question", question: newQuestion, sort_order: String(articleQuestions.length) });
  }

  const fetcherActionData = fetcher.data as { ok: boolean; error?: string } | undefined;
  const guestActionError = fetcherActionData?.ok === false ? fetcherActionData.error : null;

  return (
    <AppLayout title="הגדרות">
      <div className={styles.settings}>

        {/* Reminders */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>תזכורות</h2>
            <p className={styles.sectionDescription}>הגדר תזכורות לפעולות שונות</p>
          </div>
          <div className={styles.remindersList}>
            {reminders.map((reminder) => (
              <div key={reminder.id} className={styles.reminderItem}>
                <div className={styles.reminderInfo}>
                  <div className={styles.reminderIcon}><Bell /></div>
                  <div className={styles.reminderDetails}>
                    <h3 className={styles.reminderType}>{reminder.reminder_type}</h3>
                    <p className={styles.reminderTime}>{formatReminderTime(reminder.reminder_time)}</p>
                  </div>
                </div>
                <div className={styles.reminderActions}>
                  {accountType === "student" && (
                    <Switch
                      checked={reminder.is_active}
                      onCheckedChange={(checked) =>
                        submitIntent({ intent: "toggle_reminder", id: reminder.id, is_active: String(checked) })
                      }
                    />
                  )}
                  {accountType === "student" && (
                    <Button variant="outline" size="sm"
                      onClick={() => submitIntent({ intent: "delete_reminder", id: reminder.id })}
                      className={styles.removeReminderBtn}>
                      <X />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {showAddReminder && (
              <form className={styles.addCourseForm} onSubmit={handleAddReminder}>
                <div className={styles.addCourseFields}>
                  <Input placeholder="תיאור התזכורת (למשל: לחזור על חומר)" value={newReminderType}
                    onChange={(e) => setNewReminderType(e.target.value)} autoFocus />
                  <div className={styles.reminderTimeRow}>
                    <select className={styles.reminderSelect} value={newReminderDay}
                      onChange={(e) => setNewReminderDay(e.target.value)}>
                      {DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className={styles.reminderTimeLabel}>בשעה</span>
                    <input type="time" className={styles.reminderSelect} value={newReminderHour}
                      onChange={(e) => setNewReminderHour(e.target.value)} />
                  </div>
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newReminderType.trim() || fetcher.state !== "idle"}>הוסף</Button>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { setShowAddReminder(false); setNewReminderType(""); setNewReminderDay("daily"); setNewReminderHour("08:00"); }}>
                    <X style={{ marginLeft: "var(--space-2)" }} />ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>
          {!showAddReminder && accountType === "student" && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddReminder(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />הוסף תזכורת חדשה
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
            <div>
              <Label htmlFor="studentName">שם מלא</Label>
              <Input id="studentName" name="name" defaultValue={student.name} disabled={accountType !== "student"} />
            </div>
            <div>
              <Label htmlFor="studentId">מזהה סטודנט</Label>
              <Input id="studentId" value={student.id} disabled />
            </div>
            {accountType === "student" && (
              <Button type="submit" disabled={fetcher.state !== "idle"}>שמור שינויים</Button>
            )}
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
                  {accountType === "student" && (
                    <>
                      <Switch
                        checked={course.is_active}
                        onCheckedChange={(checked) =>
                          submitIntent({ intent: "toggle_course", id: course.id, is_active: String(checked) })
                        }
                      />
                      <CourseDeleteDialog
                        courseName={course.course_name}
                        onConfirm={() => submitIntent({ intent: "delete_course", id: course.id, course_id: course.course_id })}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
            {showAddCourse && (
              <form className={styles.addCourseForm} onSubmit={handleAddCourse}>
                <div className={styles.addCourseFields}>
                  <Input placeholder="שם הקורס" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} autoFocus />
                  <Input placeholder="קוד קורס (לדוג׳ chem101)" value={newCourseId} onChange={(e) => setNewCourseId(e.target.value)} />
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newCourseName.trim() || !newCourseId.trim() || fetcher.state !== "idle"}>הוסף</Button>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { setShowAddCourse(false); setNewCourseId(""); setNewCourseName(""); }}>
                    <X style={{ marginLeft: "var(--space-2)" }} />ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>
          {!showAddCourse && accountType === "student" && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddCourse(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />הוסף קורס חדש
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
                {accountType === "student" && (
                  <Button variant="outline" size="sm"
                    onClick={() => submitIntent({ intent: "delete_article_question", id: q.id })}
                    className={styles.removeReminderBtn} title="מחק שאלה">
                    <X />
                  </Button>
                )}
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
                  <textarea className={styles.questionTextarea} placeholder="כתוב את השאלה כאן..."
                    value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} rows={3} autoFocus />
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newQuestion.trim() || fetcher.state !== "idle"}>הוסף</Button>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { setShowAddQuestion(false); setNewQuestion(""); }}>
                    <X style={{ marginLeft: "var(--space-2)" }} />ביטול
                  </Button>
                </div>
              </form>
            )}
          </div>
          {!showAddQuestion && accountType === "student" && (
            <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={() => setShowAddQuestion(true)}>
              <Plus style={{ marginLeft: "var(--space-2)" }} />הוסף שאלה חדשה
            </Button>
          )}
        </div>

        {/* Guests — only for students */}
        {accountType === "student" && (
          <GuestsSection
            guests={guests}
            onAdd={(name, email, password) =>
              submitIntent({ intent: "add_guest", guest_name: name, guest_email: email, guest_password: password })
            }
            onDelete={(guestId) => submitIntent({ intent: "delete_guest", guest_id: guestId })}
            isBusy={fetcher.state !== "idle"}
            actionError={guestActionError}
          />
        )}
      </div>
    </AppLayout>
  );
}
