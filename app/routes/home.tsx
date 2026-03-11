import * as React from "react";
import { Link } from "react-router";
import { FileText, BookOpen, GraduationCap, Plus, TrendingUp, Bell, CheckCircle2 } from "lucide-react";
import type { Route } from "./+types/home";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { getStudent, getReminders } from "~/services/settings.service";
import { getSources } from "~/services/sources.service";
import { isReminderDueToday, formatReminderTime } from "~/lib/reminder-utils";
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
  const sources = student ? await getSources(student.id) : [];
  const allReminders = student ? await getReminders(student.id) : [];

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
    totalSources: sources.length,
    totalLectures: sources.filter((s) => s.source_type === "Lecture").length,
    totalCards: sources.filter((s) => s.source_type === "Card").length,
    totalExams: sources.filter((s) => s.source_type === "Past exam").length,
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
    studentId,
    recentSources,
    dueReminders,
    totalSources,
    totalLectures,
    totalCards,
    totalExams,
  } = loaderData;

  // Client-side dismissal — does NOT delete from DB so recurring reminders reappear next time
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
  const visibleReminders = dueReminders.filter((r) => !dismissedIds.has(r.id));

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
  }

  return (
    <AppLayout title="דף הבית">
      <div className={styles.home}>
        <div className={styles.welcome}>
          <h1 className={styles.welcomeTitle}>שלום, {studentName ?? "סטודנט"}!</h1>
          <p className={styles.welcomeText}>ברוך הבא למערכת ניהול הלימודים החכמה שלך</p>
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
