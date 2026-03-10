import * as React from "react";
import { Link } from "react-router";
import { FileText, BookOpen, GraduationCap, Plus, TrendingUp } from "lucide-react";
import type { Route } from "./+types/home";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { mockSources, mockCourses, mockStudent } from "~/data/mock-data";
import { getStudent } from "~/services/settings.service";
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
  return { studentName: student?.name ?? null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { studentName } = loaderData;
  const recentSources = mockSources.slice(0, 3);

  const stats = {
    lectures: mockSources.filter((s) => s.source_type === "Lecture").length,
    cards: mockSources.filter((s) => s.source_type === "Card").length,
    exams: mockSources.filter((s) => s.source_type === "Past exam").length,
    courses: mockCourses.length,
  };

  return (
    <AppLayout title="דף הבית">
      <div className={styles.home}>
        <div className={styles.welcome}>
          <h1 className={styles.welcomeTitle}>שלום, {studentName ?? "סטודנט"}!</h1>
          <p className={styles.welcomeText}>ברוך הבא למערכת ניהול הלימודים החכמה שלך</p>
        </div>
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
                <SourceCard key={source.id} source={source} studentId={mockStudent.id} />
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
            <p className={styles.statValue}>{stats.lectures}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <BookOpen />
              </div>
              <p className={styles.statLabel}>כרטיסי סיכום</p>
            </div>
            <p className={styles.statValue}>{stats.cards}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <GraduationCap />
              </div>
              <p className={styles.statLabel}>מבחני עבר</p>
            </div>
            <p className={styles.statValue}>{stats.exams}</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <TrendingUp />
              </div>
              <p className={styles.statLabel}>קורסים פעילים</p>
            </div>
            <p className={styles.statValue}>{stats.courses}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
