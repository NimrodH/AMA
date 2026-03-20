import * as React from "react";
import { FileSearch } from "lucide-react";
import type { Route } from "./+types/article-analysis";
import { AppLayout } from "~/components/layout/app-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getStudent, getActiveCourses } from "~/services/settings.service";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import styles from "./article-analysis.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ניתוח מאמר - מערכת ניהול לימודים" }];
}

export async function loader({}: Route.LoaderArgs) {
  const student = await getStudent();
  if (!student) return { courses: [] };
  const courses = await getActiveCourses(student.id);
  return { courses };
}

export default function ArticleAnalysis({ loaderData }: Route.ComponentProps) {
  const { courses } = loaderData;

  const [selectedCourse, setSelectedCourse] = React.useState<string>(() => {
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return courses[0]?.course_id ?? "";
  });

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    writeSelectedCourse(value);
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
    <AppLayout title="ניתוח מאמר" headerExtra={courseSelector}>
      <div className={styles.page}>
        <div className={styles.placeholder}>
          <FileSearch className={styles.placeholderIcon} />
          <h2 className={styles.placeholderTitle}>ניתוח מאמר</h2>
          <p className={styles.placeholderText}>כאן תוכל לנתח מאמרים אקדמיים בעזרת בינה מלאכותית.</p>
          <p className={styles.placeholderSub}>הפונקציונליות תתווסף בקרוב.</p>
        </div>
      </div>
    </AppLayout>
  );
}
