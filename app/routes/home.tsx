import * as React from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import type { Route } from "./+types/home";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getStudent, getReminders, getActiveCourses } from "~/services/settings.service";
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
  const [allReminders, courses] = await Promise.all([
    student ? getReminders(student.id) : Promise.resolve([]),
    student ? getActiveCourses(student.id) : Promise.resolve([]),
  ]);

  // Only surface active reminders that are due today
  const dueReminders = allReminders.filter(
    (r) => r.is_active && isReminderDueToday(r.reminder_time)
  );

  return {
    studentId: student?.id ?? null,
    studentName: student?.name ?? null,
    dueReminders,
    courses,
  };
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    studentName,
    dueReminders,
    courses,
  } = loaderData;

  // Selected course — persisted in localStorage
  const [selectedCourse, setSelectedCourse] = React.useState<string>(() => readSelectedCourse());

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    writeSelectedCourse(value);
  };

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


      </div>
    </AppLayout>
  );
}
