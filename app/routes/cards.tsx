import * as React from "react";
import { Sparkles, Save } from "lucide-react";
import type { Route } from "./+types/cards";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Textarea } from "~/components/ui/textarea/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { mockSources } from "~/data/mock-data";
import { getStudent, getCourses } from "~/services/settings.service";
import styles from "./cards.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כרטיסי סיכום - מערכת ניהול לימודים" }];
}

export async function loader() {
  const student = await getStudent();
  if (!student) return { courses: [] };
  const courses = await getCourses(student.id);
  return { courses };
}

export default function Cards({ loaderData }: Route.ComponentProps) {
  const { courses } = loaderData;
  const [cardContent, setCardContent] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = React.useState(false);

  const existingCards = mockSources.filter((s) => s.source_type === "Card");

  const handleGetFeedback = async () => {
    setIsLoadingFeedback(true);
    // Simulate AI feedback
    setTimeout(() => {
      setFeedback(`משוב על הכרטיס:

✅ נקודות חוזק:
- הסיכום מכסה את המושגים העיקריים
- השפה ברורה ומדויקת
- המבנה לוגי וקל לקריאה

⚠️ מושגים חסרים:
- לא הוזכרה התופעה של רזוננס
- חסר הסבר על כללי הוקל
- לא נדונו דוגמאות של תרכובות הטרוציקליות

❌ טעויות לתיקון:
- בנזן אינו בעל "קשרים כפולים" אלא מערכת מצומדת
- מספר האלקטרונים המצומדים צריך להיות 4n+2 (כלל הוקל)

💡 המלצות:
- הוסף דיאגרמות של מבנים מולקולריים
- הרחב את הדוגמאות לתרכובות נוספות
- הוסף השוואה לתרכובות לא-ארומטיות`);
      setIsLoadingFeedback(false);
    }, 2000);
  };

  return (
    <AppLayout title="כרטיסי סיכום">
      <div className={styles.cards}>
        <div className={styles.editor}>
          <div className={styles.editorHeader}>
            <h2 className={styles.editorTitle}>כתוב כרטיס סיכום חדש</h2>
          </div>

          <form className={styles.editorForm}>
            <div>
              <Label htmlFor="cardCourse">קורס</Label>
              <Select>
                <SelectTrigger id="cardCourse">
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
            </div>

            <div className={styles.formRow}>
              <div>
                <Label htmlFor="cardTopic">נושא</Label>
                <Input id="cardTopic" placeholder="לדוגמה: תרכובות ארומטיות" />
              </div>
              <div>
                <Label htmlFor="cardLecture">מספר הרצאה (אופציונלי)</Label>
                <Input id="cardLecture" type="number" min={1} placeholder="לדוגמה: 3" />
              </div>
            </div>

            <div>
              <Label htmlFor="cardContent">תוכן הסיכום</Label>
              <Textarea
                id="cardContent"
                value={cardContent}
                onChange={(e) => setCardContent(e.target.value)}
                placeholder="כתוב את הסיכום שלך כאן..."
                rows={12}
                style={{ fontFamily: "var(--font-body)", resize: "vertical" }}
                className={styles.textarea}
              />
            </div>

            <div className={styles.editorActions}>
              <Button type="button" variant="outline">
                <Save style={{ marginLeft: "var(--space-2)" }} />
                שמור טיוטה
              </Button>
              <Button type="button" onClick={handleGetFeedback} disabled={!cardContent || isLoadingFeedback}>
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isLoadingFeedback ? "מקבל משוב..." : "קבל משוב מה-AI"}
              </Button>
            </div>

            {feedback && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackTitle}>
                  <Sparkles />
                  משוב מהבינה המלאכותית
                </h3>
                <div className={styles.feedbackContent}>{feedback}</div>
              </div>
            )}
          </form>
        </div>

        <div>
          <h2 style={{ font: "var(--font-heading)", color: "var(--color-neutral-12)", marginBottom: "var(--space-4)" }}>
            הכרטיסים שלי
          </h2>
          <div className={styles.cardsList}>
            {existingCards.map((card) => (
              <SourceCard key={card.id} source={card} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
