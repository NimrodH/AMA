import * as React from "react";
import { Plus, Trash2, Bell, BookOpen, Code } from "lucide-react";
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

export default function Settings() {
  const [studentName, setStudentName] = React.useState(mockStudent.name);

  return (
    <AppLayout title="הגדרות">
      <div className={styles.settings}>
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

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>הקורסים שלי</h2>
            <p className={styles.sectionDescription}>נהל את רשימת הקורסים שלך</p>
          </div>

          <div className={styles.coursesList}>
            {mockCourses.map((course) => (
              <div key={course.id} className={styles.courseItem}>
                <div className={styles.courseInfo}>
                  <h3 className={styles.courseName}>{course.course_name}</h3>
                  <p className={styles.courseId}>{course.course_id}</p>
                </div>
                <Button variant="outline" size="sm">
                  <Trash2 style={{ marginLeft: "var(--space-2)" }} />
                  הסר
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline">
            <Plus style={{ marginLeft: "var(--space-2)" }} />
            הוסף קורס חדש
          </Button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>תזכורות</h2>
            <p className={styles.sectionDescription}>הגדר תזכורות לפעולות שונות</p>
          </div>

          <div className={styles.remindersList}>
            <div className={styles.reminderItem}>
              <div className={styles.reminderInfo}>
                <div className={styles.reminderIcon}>
                  <BookOpen />
                </div>
                <div className={styles.reminderDetails}>
                  <h3 className={styles.reminderType}>תזכורת להוספת כרטיס סיכום</h3>
                  <p className={styles.reminderTime}>כל יום ב-20:00</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>

            <div className={styles.reminderItem}>
              <div className={styles.reminderInfo}>
                <div className={styles.reminderIcon}>
                  <Bell />
                </div>
                <div className={styles.reminderDetails}>
                  <h3 className={styles.reminderType}>תזכורת לביצוע מבחן אימון</h3>
                  <p className={styles.reminderTime}>כל שבוע ביום ראשון ב-18:00</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>

          <Button variant="outline">
            <Plus style={{ marginLeft: "var(--space-2)" }} />
            הוסף תזכורת חדשה
          </Button>
        </div>

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
                  <li>
                    <code>students</code> - פרטי סטודנטים
                  </li>
                  <li>
                    <code>courses</code> - קורסים
                  </li>
                  <li>
                    <code>sources</code> - מקורות לימוד
                  </li>
                  <li>
                    <code>exams</code> - מבחנים
                  </li>
                  <li>
                    <code>reminders</code> - תזכורות
                  </li>
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
