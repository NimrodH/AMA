import * as React from "react";
import { Sparkles, Save } from "lucide-react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/cards";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Textarea } from "~/components/ui/textarea/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { getStudent, getCourses } from "~/services/settings.service";
import { getCards, addCard } from "~/services/cards.service";
import styles from "./cards.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כרטיסי סיכום - מערכת ניהול לימודים" }];
}

export async function loader() {
  const student = await getStudent();
  if (!student) return { courses: [], cards: [] };
  const [courses, cards] = await Promise.all([
    getCourses(student.id),
    getCards(student.id),
  ]);
  return { courses, cards };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const courseId = formData.get("courseId") as string;
  const title = formData.get("title") as string;
  const topic = formData.get("topic") as string;
  const lectureNumberRaw = formData.get("lectureNumber") as string;
  const content = formData.get("content") as string;

  if (!courseId || !title || !topic || !content) {
    return { ok: false, error: "יש למלא את כל השדות הנדרשים" };
  }

  const student = await getStudent();
  if (!student) {
    return { ok: false, error: "לא נמצא סטודנט — הגדר סטודנט בהגדרות" };
  }

  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;

  return addCard({
    studentId: student.id,
    courseId,
    title,
    topic,
    lectureNumber,
    content,
  });
}

export default function Cards({ loaderData }: Route.ComponentProps) {
  const { courses, cards } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";
  const actionData = fetcher.data;

  const [cardTitle, setCardTitle] = React.useState("");
  const [selectedCourse, setSelectedCourse] = React.useState("");
  const [cardTopic, setCardTopic] = React.useState("");
  const [lectureNumber, setLectureNumber] = React.useState("");
  const [cardContent, setCardContent] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = React.useState(false);

  // Reset form after successful save
  React.useEffect(() => {
    if (actionData?.ok) {
      setCardTitle("");
      setSelectedCourse("");
      setCardTopic("");
      setLectureNumber("");
      setCardContent("");
      setFeedback(null);
    }
  }, [actionData]);

  const isFormValid = selectedCourse && cardTitle.trim() && cardTopic.trim() && cardContent.trim();

  const handleGetFeedback = async () => {
    setIsLoadingFeedback(true);
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

          <fetcher.Form method="post" className={styles.editorForm}>
            <div>
              <Label htmlFor="cardTitle">כותרת</Label>
              <Input
                id="cardTitle"
                name="title"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="לדוגמה: סיכום הרצאה 5 - תרכובות ארומטיות"
              />
            </div>

            <div>
              <Label htmlFor="cardCourse">קורס</Label>
              <Select value={selectedCourse} onValueChange={setSelectedCourse} name="courseId">
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
                <Input
                  id="cardTopic"
                  name="topic"
                  value={cardTopic}
                  onChange={(e) => setCardTopic(e.target.value)}
                  placeholder="לדוגמה: תרכובות ארומטיות"
                />
              </div>
              <div>
                <Label htmlFor="cardLecture">מספר הרצאה (אופציונלי)</Label>
                <Input
                  id="cardLecture"
                  name="lectureNumber"
                  type="number"
                  min={1}
                  value={lectureNumber}
                  onChange={(e) => setLectureNumber(e.target.value)}
                  placeholder="לדוגמה: 3"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cardContent">תוכן הסיכום</Label>
              <Textarea
                id="cardContent"
                name="content"
                value={cardContent}
                onChange={(e) => setCardContent(e.target.value)}
                placeholder="כתוב את הסיכום שלך כאן..."
                rows={12}
                style={{ fontFamily: "var(--font-body)", resize: "vertical" }}
                className={styles.textarea}
              />
            </div>

            <div className={styles.editorActions}>
              <Button type="submit" variant="outline" disabled={!isFormValid || isSaving}>
                <Save style={{ marginLeft: "var(--space-2)" }} />
                {isSaving ? "שומר..." : "שמור כרטיס"}
              </Button>
              <Button
                type="button"
                onClick={handleGetFeedback}
                disabled={!cardContent || isLoadingFeedback}
              >
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isLoadingFeedback ? "מקבל משוב..." : "קבל משוב מה-AI"}
              </Button>
            </div>

            {actionData && !actionData.ok && actionData.error && (
              <div className={styles.errorMessage}>{actionData.error}</div>
            )}

            {actionData?.ok && (
              <div className={styles.successMessage}>הכרטיס נשמר בהצלחה!</div>
            )}

            {feedback && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackTitle}>
                  <Sparkles />
                  משוב מהבינה המלאכותית
                </h3>
                <div className={styles.feedbackContent}>{feedback}</div>
              </div>
            )}
          </fetcher.Form>
        </div>

        <div>
          <h2 style={{ font: "var(--font-heading)", color: "var(--color-neutral-12)", marginBottom: "var(--space-4)" }}>
            הכרטיסים שלי
          </h2>
          {cards.length === 0 ? (
            <p className={styles.emptyState}>אין כרטיסים עדיין — צור כרטיס סיכום חדש למעלה</p>
          ) : (
            <div className={styles.cardsList}>
              {cards.map((card) => (
                <div key={card.id} className={styles.savedCard}>
                  <h3 className={styles.savedCardTitle}>{card.title}</h3>
                  <p className={styles.savedCardMeta}>
                    {card.topic}
                    {card.lecture_number ? ` · הרצאה ${card.lecture_number}` : ""}
                  </p>
                  <p className={styles.savedCardContent}>{card.content}</p>
                  <span className={styles.savedCardDate}>
                    {new Date(card.created_at).toLocaleDateString("he-IL")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
