import * as React from "react";
import { Plus, Trash2, Bell, BookOpen, Code, X } from "lucide-react";
import type { Route } from "./+types/settings";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Switch } from "~/components/ui/switch/switch";
import { mockStudent, mockCourses } from "~/data/mock-data";
import styles from "./settings.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "הגדרות - מערכת ניהול לימודים" }];
}

type Course = { id: string; course_id: string; course_name: string };
type Reminder = { id: string; type: string; time: string; icon: "book" | "bell"; enabled: boolean };

const INITIAL_REMINDERS: Reminder[] = [
  { id: "r1", type: "תזכורת להוספת כרטיס סיכום", time: "כל יום ב-20:00", icon: "book", enabled: true },
  { id: "r2", type: "תזכורת לביצוע מבחן אימון", time: "כל שבוע ביום ראשון ב-18:00", icon: "bell", enabled: true },
];

export default function Settings() {
  const [studentName, setStudentName] = React.useState(mockStudent.name);
  const [courses, setCourses] = React.useState<Course[]>(mockCourses);
  const [reminders, setReminders] = React.useState<Reminder[]>(INITIAL_REMINDERS);

  // Add course form state
  const [showAddCourse, setShowAddCourse] = React.useState(false);
  const [newCourseId, setNewCourseId] = React.useState("");
  const [newCourseName, setNewCourseName] = React.useState("");

  // Add reminder form state
  const [showAddReminder, setShowAddReminder] = React.useState(false);
  const [newReminderType, setNewReminderType] = React.useState("");
  const [newReminderTime, setNewReminderTime] = React.useState("");

  function handleRemoveCourse(id: string) {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }

  function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseId.trim() || !newCourseName.trim()) return;
    setCourses((prev) => [
      ...prev,
      { id: `course_${Date.now()}`, course_id: newCourseId.trim(), course_name: newCourseName.trim() },
    ]);
    setNewCourseId("");
    setNewCourseName("");
    setShowAddCourse(false);
  }

  function handleCancelAddCourse() {
    setNewCourseId("");
    setNewCourseName("");
    setShowAddCourse(false);
  }

  function handleToggleReminder(id: string, enabled: boolean) {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }

  function handleRemoveReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderType.trim() || !newReminderTime.trim()) return;
    setReminders((prev) => [
      ...prev,
      { id: `rem_${Date.now()}`, type: newReminderType.trim(), time: newReminderTime.trim(), icon: "bell", enabled: true },
    ]);
    setNewReminderType("");
    setNewReminderTime("");
    setShowAddReminder(false);
  }

  function handleCancelAddReminder() {
    setNewReminderType("");
    setNewReminderTime("");
    setShowAddReminder(false);
  }

  return (
    <AppLayout title="הגדרות">
      <div className={styles.settings}>
        {/* Personal Info */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>פרטים אישיים</h2>
            <p className={styles.sectionDescription}>עדכן את הפרטים האישיים שלך</p>
          </div>
          <form className={styles.form}>
            <div>
              <Label htmlFor="studentName">שם מלא</Label>
              <Input id="studentName" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="studentId">מספר תעודת זהות</Label>
              <Input id="studentId" value={mockStudent.id} disabled />
            </div>
            <Button type="submit">שמור שינויים</Button>
          </form>
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
                <Button variant="outline" size="sm" onClick={() => handleRemoveCourse(course.id)}>
                  <Trash2 style={{ marginLeft: "var(--space-2)" }} />
                  הסר
                </Button>
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
                  <Button type="submit" size="sm" disabled={!newCourseName.trim() || !newCourseId.trim()}>
                    הוסף
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCancelAddCourse}>
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
                  <div className={styles.reminderIcon}>
                    {reminder.icon === "book" ? <BookOpen /> : <Bell />}
                  </div>
                  <div className={styles.reminderDetails}>
                    <h3 className={styles.reminderType}>{reminder.type}</h3>
                    <p className={styles.reminderTime}>{reminder.time}</p>
                  </div>
                </div>
                <div className={styles.reminderActions}>
                  <Switch
                    checked={reminder.enabled}
                    onCheckedChange={(enabled) => handleToggleReminder(reminder.id, enabled)}
                  />
                  <Button variant="outline" size="sm" onClick={() => handleRemoveReminder(reminder.id)} className={styles.removeReminderBtn}>
                    <X />
                  </Button>
                </div>
              </div>
            ))}

            {showAddReminder && (
              <form className={styles.addCourseForm} onSubmit={handleAddReminder}>
                <div className={styles.addCourseFields}>
                  <Input
                    placeholder="תיאור התזכורת"
                    value={newReminderType}
                    onChange={(e) => setNewReminderType(e.target.value)}
                    autoFocus
                  />
                  <Input
                    placeholder="זמן (לדוג׳ כל יום ב-19:00)"
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                  />
                </div>
                <div className={styles.addFormActions}>
                  <Button type="submit" size="sm" disabled={!newReminderType.trim() || !newReminderTime.trim()}>
                    הוסף
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCancelAddReminder}>
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

        {/* API Settings */}
        <div className={`${styles.section} ${styles.apiSection}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} style={{ color: "var(--color-accent-12)" }}>
              <Code style={{ display: "inline", marginLeft: "var(--space-2)", verticalAlign: "middle" }} />
              הגדרות API ופרומפטים
            </h2>
            <p className={styles.sectionDescription} style={{ color: "var(--color-accent-11)" }}>
              הוראות להגדרת חשבונות Supabase ו-OpenAI
            </p>
          </div>

          <div className={styles.apiInstructions}>
            <h3>הגדרת Supabase:</h3>
            <ol>
              <li>
                היכנס ל-
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
                  supabase.com
                </a>{" "}
                וצור פרויקט חדש
              </li>
              <li>
                צור את הטבלאות הבאות בפרויקט שלך:
                <ul style={{ marginTop: "var(--space-2)" }}>
                  <li><code>students</code> - פרטי סטודנטים</li>
                  <li><code>courses</code> - קורסים</li>
                  <li><code>sources</code> - מקורות לימוד</li>
                  <li><code>exams</code> - מבחנים</li>
                  <li><code>reminders</code> - תזכורות</li>
                </ul>
              </li>
              <li>העתק את ה-URL וה-anon key מהגדרות הפרויקט</li>
              <li>
                הוסף אותם לקובץ <code>.env</code>:
                <br />
                <code>VITE_SUPABASE_URL=your-url</code>
                <br />
                <code>VITE_SUPABASE_ANON_KEY=your-key</code>
              </li>
            </ol>

            <h3 style={{ marginTop: "var(--space-5)" }}>הגדרת OpenAI API:</h3>
            <ol>
              <li>
                היכנס ל-
                <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">
                  platform.openai.com
                </a>
              </li>
              <li>עבור ל-API Keys ויצור מפתח חדש</li>
              <li>
                הוסף את המפתח לקובץ <code>.env</code>:
                <br />
                <code>VITE_OPENAI_API_KEY=your-api-key</code>
              </li>
            </ol>

            <h3 style={{ marginTop: "var(--space-5)" }}>עריכת פרומפטים:</h3>
            <p>
              כל הפרומפטים של ה-AI נמצאים בקובץ <code>app/lib/openai.ts</code> באובייקט <code>PROMPTS</code>.
              <br />
              תוכל לערוך אותם בקלות כדי להתאים את התגובות של ה-AI לצרכים שלך.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
