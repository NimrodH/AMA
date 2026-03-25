import * as React from "react";
import { FileSearch, BookOpen, HelpCircle } from "lucide-react";
import type { Route } from "./+types/article-analysis";
import { AppLayout } from "~/components/layout/app-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "~/components/ui/accordion/accordion";
import { getStudentById, getActiveCourses, getArticleQuestions, saveArticleAnswers } from "~/services/settings.service";
import { getSession, requireSession, hasAuthToken } from "~/lib/auth.server";
import { makeClientLoader, makeClientAction } from "~/lib/client-auth-loader";
import styles from "./article-analysis.module.css";

// Article-analysis has its own localStorage key so its course selection
// stays independent from other pages (Sources, Cards, etc.) which share
// the global "selectedCourseId" key. When those pages switch to course "22",
// coming back here should NOT reset the article-analysis course to "22".
const ARTICLE_COURSE_KEY = "articleAnalysisSelectedCourseId";

function readArticleCourse(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ARTICLE_COURSE_KEY) ?? "";
}

function writeArticleCourse(courseId: string): void {
  if (typeof window === "undefined") return;
  if (courseId) {
    localStorage.setItem(ARTICLE_COURSE_KEY, courseId);
  } else {
    localStorage.removeItem(ARTICLE_COURSE_KEY);
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "ניתוח מאמר - מערכת ניהול לימודים" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!hasAuthToken(request)) return { courses: [], questions: [], studentId: "", accountType: "student" as const };
  const session = await getSession(request);
  if (!session) return { courses: [], questions: [], studentId: "", accountType: "student" as const };
  const student = await getStudentById(session.studentId, request);
  if (!student) return { courses: [], questions: [], studentId: "", accountType: session.accountType };

  const courses = await getActiveCourses(student.id, request);
  const questions = await getArticleQuestions(student.id, request);

  return { courses, questions, studentId: student.id, accountType: session.accountType };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

export const clientAction = makeClientAction<typeof action>();

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_answers") {
    const sourceId = formData.get("source_id") as string;
    const answersJson = formData.get("answers") as string;
    let answers: Record<string, string> = {};
    try { answers = JSON.parse(answersJson); } catch { answers = {}; }
    await saveArticleAnswers(session.studentId, sourceId, answers, request);
    return { ok: true };
  }

  return { ok: false };
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function ArticleAnalysis({ loaderData }: Route.ComponentProps) {
  const { courses, questions, studentId, accountType } = loaderData as LoaderData;
  const isGuest = accountType === "guest";

  const [selectedCourse, setSelectedCourse] = React.useState<string>("");

  // Resolve selectedCourse once courses are loaded (handles SSR hydration gap).
  // Uses a page-specific localStorage key so other pages (Sources, Cards…)
  // selecting a different course don't bleed into this page's selection.
  React.useEffect(() => {
    if (courses.length === 0) return;
    setSelectedCourse((prev) => {
      if (prev && courses.some((c) => c.course_id === prev)) return prev;
      const stored = readArticleCourse();
      if (stored && courses.some((c) => c.course_id === stored)) return stored;
      return courses[0].course_id;
    });
  }, [courses]);

  const [articles, setArticles] = React.useState<{ id: string; topic: string }[]>([]);
  const [selectedArticleId, setSelectedArticleId] = React.useState<string>("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [loadingArticles, setLoadingArticles] = React.useState(false);
  const [loadingAnswers, setLoadingAnswers] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Fetch articles (sources of type "Article") for selected course.
  React.useEffect(() => {
    if (!selectedCourse || !studentId) return;
    setLoadingArticles(true);
    setSelectedArticleId("");
    setAnswers({});

    fetch(`/api/article-sources?studentId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourse)}`)
      .then((r) => r.json())
      .then((data) => {
        setArticles(data.sources ?? []);
      })
      .catch(() => setArticles([]))
      .finally(() => setLoadingArticles(false));
  }, [selectedCourse, studentId]);

  // Fetch saved answers when article changes
  React.useEffect(() => {
    if (!selectedArticleId || !studentId) { setAnswers({}); return; }
    setLoadingAnswers(true);
    fetch(`/api/article-answers?studentId=${encodeURIComponent(studentId)}&sourceId=${encodeURIComponent(selectedArticleId)}`)
      .then((r) => r.json())
      .then((data) => setAnswers(data.answers ?? {}))
      .catch(() => setAnswers({}))
      .finally(() => setLoadingAnswers(false));
  }, [selectedArticleId, studentId]);

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    writeArticleCourse(value);
  };

  const handleAnswerChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleSave = async () => {
    if (!selectedArticleId) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("intent", "save_answers");
      formData.append("source_id", selectedArticleId);
      formData.append("answers", JSON.stringify(answers));
      await fetch("", { method: "POST", body: formData });
    } finally {
      setSaving(false);
    }
  };

  const courseSelector = (
    <Select value={selectedCourse} onValueChange={handleCourseChange}>
      <SelectTrigger className={styles.headerCourseSelect}>
        <SelectValue placeholder="בחר קורס" />
      </SelectTrigger>
      <SelectContent>
        {courses.length === 0 ? (
          <SelectItem value="_none" disabled>אין קורסים — הוסף קורס בהגדרות</SelectItem>
        ) : (
          courses.map((course) => (
            <SelectItem key={course.id} value={course.course_id}>{course.course_name}</SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );

  const hasQuestions = questions.length > 0;
  const hasArticle = !!selectedArticleId;

  return (
    <AppLayout title="ניתוח מאמר" headerExtra={courseSelector}>
      <div className={styles.page}>

        {/* Article picker */}
        <div className={styles.pickerSection}>
          <label className={styles.pickerLabel}>
            <BookOpen size={16} />
            בחר מאמר
          </label>
          <Select
            value={selectedArticleId}
            onValueChange={setSelectedArticleId}
            disabled={loadingArticles || articles.length === 0}
          >
            <SelectTrigger className={styles.articleSelect}>
              <SelectValue placeholder={
                loadingArticles ? "טוען..." :
                articles.length === 0 ? "אין מאמרים בקורס זה" :
                "בחר מאמר לניתוח"
              } />
            </SelectTrigger>
            <SelectContent>
              {articles.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.topic}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Questions accordion */}
        {!hasArticle && (
          <div className={styles.placeholder}>
            <FileSearch className={styles.placeholderIcon} />
            <h2 className={styles.placeholderTitle}>בחר מאמר לניתוח</h2>
            <p className={styles.placeholderText}>לאחר בחירת מאמר תוכל לענות על שאלות הניתוח.</p>
            {!hasQuestions && (
              <p className={styles.placeholderSub}>הגדר שאלות ניתוח בדף ההגדרות כדי להתחיל.</p>
            )}
          </div>
        )}

        {hasArticle && !hasQuestions && (
          <div className={styles.placeholder}>
            <HelpCircle className={styles.placeholderIcon} />
            <h2 className={styles.placeholderTitle}>אין שאלות מוגדרות</h2>
            <p className={styles.placeholderText}>הוסף שאלות ניתוח מאמר בדף ההגדרות.</p>
          </div>
        )}

        {hasArticle && hasQuestions && (
          <div className={styles.questionsSection}>
            {loadingAnswers ? (
              <div className={styles.loadingAnswers}>טוען תשובות...</div>
            ) : (
              <>
                <Accordion type="multiple" className={styles.accordion}>
                  {questions.map((q, idx) => (
                    <AccordionItem key={q.id} value={q.id} className={styles.accordionItem}>
                      <AccordionTrigger className={styles.accordionTrigger}>
                        <span className={styles.questionNumber}>{idx + 1}</span>
                        <span className={styles.questionText}>{q.question}</span>
                        {answers[q.id]?.trim() && (
                          <span className={styles.answeredBadge}>✓ נענה</span>
                        )}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className={styles.answerArea}>
                          <textarea
                            className={styles.answerTextarea}
                            placeholder="כתוב את תשובתך כאן..."
                            value={answers[q.id] ?? ""}
                            onChange={isGuest ? undefined : (e) => handleAnswerChange(q.id, e.target.value)}
                            readOnly={isGuest}
                            rows={5}
                            dir="rtl"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {!isGuest && (
                  <div className={styles.saveRow}>
                    <button
                      className={styles.saveButton}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "שומר..." : "שמור תשובות"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
