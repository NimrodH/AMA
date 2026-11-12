import * as React from "react";
import { Bell, CheckCircle2, Brain, ClipboardCheck, BookOpen } from "lucide-react";
import type { Route } from "./+types/home";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getReminders, getActiveCourses } from "~/services/settings.service";
import { getSession } from "~/lib/auth.server";
import { getAllCourseStats, type CourseStats } from "~/services/stats.service";
import {
  isReminderDueToday,
  formatReminderTime,
  loadPendingReminders,
  addPendingReminders,
  completeReminder,
} from "~/lib/reminder-utils";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { makeClientLoader } from "~/lib/client-auth-loader";
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

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session) return { studentId: null, studentName: null, guestName: null, accountType: "student" as const, activeReminders: [], courses: [], courseStats: [] };
  const isGuestSession = session.accountType === "guest";
  // The session already holds the student id and name — no need to query them again
  const student = { id: session.studentId, name: session.studentName };

  const [allReminders, courses, allCourseStats] = await Promise.all([
    getReminders(student.id, request),
    getActiveCourses(student.id, request),
    getAllCourseStats(student.id, request),
  ]);

  // Show activity only for courses that are enabled in settings
  const activeCourseIds = new Set(courses.map((c) => c.course_id));
  const courseStats = allCourseStats.filter((s) => activeCourseIds.has(s.course_id));

  // Return all active reminders — client-side manages which are pending/visible
  const activeReminders = allReminders.filter((r) => r.is_active);

  return {
    studentId: student.id,
    // Owner student's name (for guests: the student they belong to)
    studentName: student.name || null,
    // Guest's own display name — only set for guest accounts
    guestName: isGuestSession ? session.studentName : null,
    accountType: session.accountType as "student" | "guest",
    activeReminders,
    courses,
    courseStats,
  };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Course Stats Table ──────────────────────────────────────────────────────

function CourseStatsTable({
  stats,
  courses,
}: {
  stats: CourseStats[];
  courses: { course_id: string; course_name: string }[];
}) {
  const courseNameById = React.useMemo(
    () => Object.fromEntries(courses.map((c) => [c.course_id, c.course_name])),
    [courses]
  );

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <Brain className={styles.sectionTitleIcon} />
          פעילות לפי קורס
        </h2>
      </div>
      <div className={styles.courseStatsPanel}>
        <div className={styles.courseStatsHeader}>
          <span className={styles.courseStatName}>קורס</span>
          <div className={styles.courseStatsColGroup}>
            <span className={styles.courseStatsColLabel}>שינון כרטיסים</span>
            <span className={styles.courseStatsColLabel}>בחינות עבר</span>
            <span className={styles.courseStatsColLabel}>בחינות AI</span>
          </div>
        </div>
        {stats.map((s) => (
          <div key={s.course_id} className={styles.courseStatRow}>
            <p className={styles.courseStatName}>
              {courseNameById[s.course_id] ?? s.course_id}
            </p>
            <div className={styles.courseStatCells}>
              <div className={styles.courseStatCell}>
                <Brain className={styles.courseStatIcon} />
                <span className={styles.courseStatValue}>{s.learn_sessions}</span>
                <span className={styles.courseStatCellLabel}>שינון</span>
              </div>
              <div className={styles.courseStatCell}>
                <ClipboardCheck className={styles.courseStatIcon} />
                <span className={styles.courseStatValue}>{s.past_exam_attempts}</span>
                <span className={styles.courseStatCellLabel}>עבר</span>
              </div>
              <div className={styles.courseStatCell}>
                <BookOpen className={styles.courseStatIcon} />
                <span className={styles.courseStatValue}>{s.ai_exam_attempts}</span>
                <span className={styles.courseStatCellLabel}>AI</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    studentName,
    guestName,
    accountType,
    activeReminders,
    courses,
    courseStats,
  } = loaderData as LoaderData;

  const isGuest = accountType === "guest";

  // Selected course — persisted in localStorage
  const [selectedCourse, setSelectedCourse] = React.useState<string>(() => readSelectedCourse());

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    writeSelectedCourse(value);
  };

  /**
   * Pending reminders: a persistent set of IDs shown but not yet completed.
   *
   * On mount:
   *  1. Load existing pending set from localStorage.
   *  2. Add any reminders that are due today (they may already be in the set,
   *     that's fine — Set deduplicates). This ensures recurring reminders
   *     re-appear on each new due day even if previously completed.
   *
   * A reminder banner is shown for every ID in `pending`.
   * Clicking "בוצע" removes the ID from `pending` permanently.
   */
  const [pending, setPending] = React.useState<Set<string>>(() => {
    const stored = loadPendingReminders();
    // Eagerly add today's due reminders so first render already shows them
    const todayIds = activeReminders
      .filter((r) => isReminderDueToday(r.reminder_time))
      .map((r) => r.id);
    return addPendingReminders(todayIds, stored);
  });

  // Show banners for reminders that are in the pending set
  const visibleReminders = activeReminders.filter((r) => pending.has(r.id));

  function handleDismiss(id: string) {
    setPending((prev) => completeReminder(id, prev));
  }

  return (
    <AppLayout title="דף הבית">
      <div className={styles.home}>
        <div className={styles.welcome}>
          <div className={styles.welcomeTop}>
            <div>
              <h1 className={styles.welcomeTitle}>
                {isGuest
                  ? `שלום, ${guestName ?? "אורח"}, אורח/ת של ${studentName ?? "סטודנט"}!`
                  : `שלום, ${studentName ?? "סטודנט"}!`}
              </h1>
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
              </div>
            )}
          </div>
        </div>

        {/* Due Reminders */}
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

        {/* Course Activity Table — hidden for guests */}
        {!isGuest && courseStats.length > 0 && (
          <CourseStatsTable stats={courseStats} courses={courses} />
        )}

      </div>
    </AppLayout>
  );
}
