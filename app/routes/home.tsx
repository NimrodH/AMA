import * as React from "react";
import { Link } from "react-router";
import { FileText, BookOpen, GraduationCap, Plus, TrendingUp, Bell, CheckCircle2, Brain, ClipboardCheck, Sparkles, Star } from "lucide-react";
import type { Route } from "./+types/home";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getStudent, getReminders, getActiveCourses } from "~/services/settings.service";
import { getSources } from "~/services/sources.service";
import { getAllCourseStats, type CourseStats } from "~/services/stats.service";
import { isReminderDueToday, formatReminderTime, loadDismissedToday, saveDismissedToday } from "~/lib/reminder-utils";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import styles from "./home.module.css";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "דף הבית - מערכת ניהול לימודים" },
    {
      name: "description",
      content: "מערכת ניהול לימודים חכמה עם בינה מלאכותית",
    },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const student = await getStudent();
  const [sources, allReminders, courses, courseStats] = await Promise.all([
    student ? getSources(student.id) : Promise.resolve([]),
    student ? getReminders(student.id) : Promise.resolve([]),
    student ? getActiveCourses(student.id) : Promise.resolve([]),
    student ? getAllCourseStats(student.id) : Promise.resolve([]),
  ]);

  // Only surface active reminders that are due today
  const dueReminders = allReminders.filter(
    (r) => r.is_active && isReminderDueToday(r.reminder_time)
  );

  const recentSources = sources.slice(0, 3);
  return {
    studentId: student?.id ?? null,
    studentName: student?.name ?? null,
    recentSources,
    dueReminders,
    courses,
    courseStats,
    totalSources: sources.length,
    totalLectures: sources.filter((s) => s.source_type === "Lecture").length,
    totalCards: sources.filter((s) => s.source_type === "Card").length,
    totalExams: sources.filter((s) => s.source_type === "Past exam").length,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CourseStatRow({ stat, courseName }: { stat: CourseStats; courseName: string }) {
  const lastDate = stat.last_exam_date
    ? new Date(stat.last_exam_date).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : null;

  const examTypeLabel = stat.last_exam_type === "past" ? "מבחן עבר" : "AI";

  return (
    <div className={styles.courseStatRow}>
      <p className={styles.courseStatName} title={courseName}>{courseName}</p>
      <div className={styles.courseStatCells}>
        <div className={styles.courseStatCell}>
          <Brain size={14} className={styles.courseStatIcon} />
          <span className={styles.courseStatValue}>{stat.learn_sessions}</span>
          <span className={styles.courseStatCellLabel}>תרגולים</span>
        </div>
        <div className={styles.courseStatCell}>
          <ClipboardCheck size={14} className={styles.courseStatIcon} />
          <span className={styles.courseStatValue}>{stat.past_exam_attempts}</span>
          <span className={styles.courseStatCellLabel}>מבחני עבר</span>
        </div>
        <div className={styles.courseStatCell}>
          <Sparkles size={14} className={styles.courseStatIcon} />
          <span className={styles.courseStatValue}>{stat.ai_exam_attempts}</span>
          <span className={styles.courseStatCellLabel}>מבחני AI</span>
        </div>
        <div className={styles.courseStatCell}>
          <Star size={14} className={styles.courseStatIcon} />
          {stat.last_exam_grade != null ? (
            <>
              <span className={styles.courseStatValue}>{stat.last_exam_grade}</span>
              <span className={styles.courseStatCellLabel}>
                {examTypeLabel}{lastDate ? ` · ${lastDate}` : ""}
              </span>
            </>
          ) : (
            <span className={styles.courseStatCellLabel}>טרם נבדק</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ReminderBanner({
  reminder,
  onDismiss,
}: {
  reminder: { id: string; reminder_type: string; reminder_time: string };
  onDismiss: (id: string) => void;
}) {
  return (
    <div className={styles.reminderBanner}>
      <div className={styles.reminderBannerIcon}>
        <Bell />
      </div>
      <div className={styles.reminderBannerContent}>
        <p className={styles.reminderBannerTitle}>{reminder.reminder_type}</p>
        <p className={styles.reminderBannerTime}>{formatReminderTime(reminder.reminder_time)}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={styles.reminderBannerBtn}
        onClick={() => onDismiss(reminder.id)}
      >
        <CheckCircle2 style={{ marginLeft: "var(--space-2)" }} />
        בוצע
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    studentName,
    studentId,
    recentSources,
    dueReminders,
    courses,
    courseStats,
    totalSources,
    totalLectures,
    totalCards,
    totalExams,
  } = loaderData;

  // Selected course — persisted in localStorage
  const [selectedCourse, setSelectedCourse] = React.useState<string>(() => readSelectedCourse());

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    writeSelectedCourse(value);
  };

  const selectedCourseName = courses.find((c) => c.course_id === selectedCourse)?.course_name ?? null;

  // Load dismissed IDs from localStorage (today only — auto-resets at midnight)
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => loadDismissedToday());
  const visibleReminders = dueReminders.filter((r) => !dismissedIds.has(r.id));

  function handleDismiss(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(id);
      saveDismissedToday(next);
      return next;
    });
  }

  return (
    <AppLayout title="דף הבית">
      <div className={styles.home}>
        <div className={styles.welcome}>
          <div className={styles.welcomeTop}>
            <div>
              <h1 className={styles.welcomeTitle}>שלום, {studentName ?? "סטודנט"}!</h1>
              <p className={styles.welcomeText}>ברוך הבא למערכת ניהול הלימודים החכמה שלך</p>
            </div>
            {courses.length > 0 && (
              <div className={styles.coursePickerWrap}>
                <label className={styles.coursePickerLabel}>קורס פעיל</label>
                <Select value={selectedCourse} onValueChange={handleCourseChange}>
                  <SelectTrigger className={styles.coursePicker}>
                    <SelectValue placeholder="בחר קורס..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.course_id}>
                        {c.course_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCourseName && (
                  <p className={styles.coursePickerHint}>ברירת מחדל בכל הדפים</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Due Reminders — shown before Quick Actions */}
        {visibleReminders.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <Bell className={styles.sectionTitleIcon} />
                תזכורות להיום
              </h2>
            </div>
            <div className={styles.remindersList}>
              {visibleReminders.map((reminder) => (
                <ReminderBanner key={reminder.id} reminder={reminder} onDismiss={handleDismiss} />
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>פעולות מהירות</h2>
          </div>
          <div className={styles.grid}>
            <Button asChild variant="outline" size="lg" style={{ height: "80px" }}>
              <Link to="/cards">
                <BookOpen style={{ marginLeft: "var(--space-2)" }} />
                כתוב כרטיס סיכום חדש
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" style={{ height: "80px" }}>
              <Link to="/exams">
                <GraduationCap style={{ marginLeft: "var(--space-2)" }} />
                צור מבחן אימון
              </Link>
            </Button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>מקורות אחרונים</h2>
            <Button asChild variant="outline">
              <Link to="/sources">
                <Plus style={{ marginLeft: "var(--space-2)" }} />
                הוסף מקור חדש
              </Link>
            </Button>
          </div>

          {recentSources.length > 0 ? (
            <div className={styles.grid}>
              {recentSources.map((source) => (
                <SourceCard key={source.id} source={source} studentId={studentId ?? ""} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <FileText className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>אין מקורות עדיין</h3>
              <p className={styles.emptyStateText}>התחל להעלות חומרי לימוד, כרטיסי סיכום ומבחני עבר</p>
              <Button asChild>
                <Link to="/sources">הוסף מקור ראשון</Link>
              </Button>
            </div>
          )}
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <FileText />
              </div>
              <p className={styles.statLabel}>הרצאות</p>
            </div>
            <p className={styles.statValue}>{totalLectures}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <BookOpen />
              </div>
              <p className={styles.statLabel}>כרטיסי סיכום</p>
            </div>
            <p className={styles.statValue}>{totalCards}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <GraduationCap />
              </div>
              <p className={styles.statLabel}>מבחני עבר</p>
            </div>
            <p className={styles.statValue}>{totalExams}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <TrendingUp />
              </div>
              <p className={styles.statLabel}>סה״כ מקורות</p>
            </div>
            <p className={styles.statValue}>{totalSources}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
