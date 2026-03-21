import * as React from "react";
import {
  Sparkles,
  GraduationCap,
  Send,
  RotateCcw,
  Loader2,
  ClipboardList,
  ListChecks,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Calendar,
  Trophy,
} from "lucide-react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/exams";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Textarea } from "~/components/ui/textarea/textarea";
import { Input } from "~/components/ui/input/input";
import { Badge } from "~/components/ui/badge/badge";
import { getStudentById, getActiveCourses } from "~/services/settings.service";
import { requireSession } from "~/lib/auth.server";
import { getExamsByCourse, type ExamRow } from "~/services/exams.service";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { makeClientLoader } from "~/lib/client-auth-loader";
import styles from "./exams.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "מבחנים - מערכת ניהול לימודים" }];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: number;
  type: "multiple_choice" | "open" | "true_false";
  question: string;
  options?: string[];
  correct_answer?: string;
  points: number;
}

interface ExamData {
  title: string;
  instructions: string;
  questions: Question[];
  isMcExam?: boolean;
}

interface GradingResult {
  total_grade: number;
  question_grades: {
    question_id: number;
    grade: number;
    max_points: number;
    feedback: string;
    correct_answer?: string;
  }[];
  overall_feedback: string;
  recommendations: string[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);
  const student = await getStudentById(session.studentId);
  if (!student) return { courses: [] as Awaited<ReturnType<typeof getActiveCourses>>, savedExams: [] as ExamRow[], studentId: "" };
  const courses = await getActiveCourses(student.id);
  // Load exams for all courses (we'll filter client-side by selected course)
  const savedExams = courses.length > 0
    ? (await Promise.all(courses.map((c) => getExamsByCourse(student.id, c.course_id)))).flat()
    : [];
  return { courses, savedExams, studentId: student.id };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExamDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

function examTypeLabel(type: string | null): string {
  switch (type) {
    case "ai": return "מבחן אימון";
    case "mc": return "מבחן אמריקאי";
    case "past": return "מבחן עבר";
    default: return "מבחן";
  }
}

function examTypeBadgeVariant(type: string | null): "default" | "secondary" | "outline" {
  if (type === "mc") return "default";
  if (type === "past") return "secondary";
  return "outline";
}

// ─── Page component ───────────────────────────────────────────────────────────

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Exams({ loaderData }: Route.ComponentProps) {
  const { courses, savedExams } = loaderData as LoaderData;
  const [searchParams] = useSearchParams();
  const sourceIdParam = searchParams.get("sourceId");

  const [selectedCourse, setSelectedCourse] = React.useState(() => {
    if (courses.length === 0) return "_empty";
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return courses[0].course_id;
  });

  React.useEffect(() => {
    if (courses.length === 0) {
      setSelectedCourse("_empty");
      return;
    }
    setSelectedCourse((prev) => {
      if (prev === "_empty" || !courses.some((c) => c.course_id === prev)) {
        const stored = readSelectedCourse();
        if (stored && courses.some((c) => c.course_id === stored)) return stored;
        return courses[0].course_id;
      }
      return prev;
    });
  }, [courses]);

  const [exam, setExam] = React.useState<ExamData | null>(null);
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [results, setResults] = React.useState<GradingResult | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isGrading, setIsGrading] = React.useState(false);
  const [generateError, setGenerateError] = React.useState<string | null>(null);
  const [gradeError, setGradeError] = React.useState<string | null>(null);
  const [examCourseId, setExamCourseId] = React.useState<string>("");
  const [examType, setExamType] = React.useState<"past" | "ai" | "mc">("ai");

  const [showMcOptions, setShowMcOptions] = React.useState(false);
  const [mcQuestionCount, setMcQuestionCount] = React.useState(10);

  // Saved exams filtered by selected course
  const courseExams = React.useMemo(
    () => savedExams.filter((e) => e.course_id === selectedCourse),
    [savedExams, selectedCourse]
  );

  // Auto-generate exam from source when sourceId is in URL
  React.useEffect(() => {
    if (!sourceIdParam) return;
    generateFromSource(sourceIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdParam]);

  const generateFromSource = async (sourceId: string) => {
    setIsGenerating(true);
    setGenerateError(null);
    setExam(null);
    setAnswers({});
    setResults(null);

    try {
      const res = await fetch("/api/generate-exam-from-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });

      const data = (await res.json()) as { ok: boolean; exam?: ExamData; error?: string };

      if (!data.ok || !data.exam) {
        setGenerateError(data.error ?? "שגיאה בייצור המבחן");
      } else {
        setExam(data.exam);
        setExamCourseId(selectedCourse);
        setExamType("past");
      }
    } catch {
      setGenerateError("שגיאת רשת — נסה שוב");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateExam = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setExam(null);
    setAnswers({});
    setResults(null);
    setShowMcOptions(false);

    try {
      const res = await fetch("/api/generate-exam-from-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse }),
      });

      const data = (await res.json()) as { ok: boolean; exam?: ExamData; error?: string };

      if (!data.ok || !data.exam) {
        setGenerateError(data.error ?? "שגיאה בייצור המבחן");
      } else {
        setExam(data.exam);
        setExamCourseId(selectedCourse);
        setExamType("ai");
      }
    } catch {
      setGenerateError("שגיאת רשת — נסה שוב");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMcExam = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setExam(null);
    setAnswers({});
    setResults(null);
    setShowMcOptions(false);

    try {
      const res = await fetch("/api/generate-mc-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse, questionCount: mcQuestionCount }),
      });

      const data = (await res.json()) as { ok: boolean; exam?: ExamData; error?: string };

      if (!data.ok || !data.exam) {
        setGenerateError(data.error ?? "שגיאה בייצור המבחן");
      } else {
        const mcExam: ExamData = { ...data.exam, isMcExam: true };
        setExam(mcExam);
        setExamCourseId(selectedCourse);
        setExamType("mc");
      }
    } catch {
      setGenerateError("שגיאת רשת — נסה שוב");
    } finally {
      setIsGenerating(false);
    }
  };

  /** Load a saved exam from the DB row and open it for answering. */
  const handleOpenSavedExam = (row: ExamRow) => {
    try {
      const parsed = JSON.parse(row.exam_content) as ExamData;
      const withFlag: ExamData = row.exam_type === "mc" ? { ...parsed, isMcExam: true } : parsed;
      setExam(withFlag);
      setExamCourseId(row.course_id);
      setExamType((row.exam_type as "ai" | "mc" | "past") ?? "ai");
      setAnswers({});
      setResults(null);
      setGenerateError(null);
    } catch {
      setGenerateError("לא ניתן לטעון את המבחן — הנתון פגום");
    }
  };

  const gradeMcExamLocally = (): GradingResult => {
    if (!exam) throw new Error("No exam");

    const question_grades = exam.questions.map((q) => {
      const selected = answers[q.id] ?? "";
      const isCorrect = selected === q.correct_answer;
      return {
        question_id: q.id,
        grade: isCorrect ? q.points : 0,
        max_points: q.points,
        feedback: isCorrect ? "✓ תשובה נכונה" : `✗ תשובה שגויה — התשובה הנכונה היא: ${q.correct_answer ?? ""}`,
        correct_answer: q.correct_answer,
      };
    });

    const earned = question_grades.reduce((sum, g) => sum + g.grade, 0);
    const total = question_grades.reduce((sum, g) => sum + g.max_points, 0);
    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

    let overall_feedback: string;
    let recommendations: string[] = [];

    if (pct >= 90) {
      overall_feedback = `מצוין! ענית נכון על ${earned} מתוך ${total} שאלות (${pct}%). שליטה מעולה בחומר.`;
    } else if (pct >= 70) {
      overall_feedback = `טוב! ענית נכון על ${earned} מתוך ${total} שאלות (${pct}%). יש מקום לשיפור בנושאים שנכשלת בהם.`;
      recommendations = ["חזור על הנושאים שבהם טעית", "למד מחדש את ההרצאות הרלוונטיות"];
    } else if (pct >= 50) {
      overall_feedback = `יש מקום לשיפור — ענית נכון על ${earned} מתוך ${total} שאלות (${pct}%). מומלץ לחזור על חומר הקורס.`;
      recommendations = ["חזור על כל חומרי הקורס", "שים לב לנושאים שבהם טעית", "נסה שוב לאחר חזרה"];
    } else {
      overall_feedback = `ציון נמוך — ענית נכון על ${earned} מתוך ${total} שאלות (${pct}%). מומלץ לעבור מחדש על כל ההרצאות.`;
      recommendations = ["קרא מחדש את כל הרצאות הקורס", "השתמש בכרטיסיות הלמידה", "פנה לעזרה מהמרצה אם נדרש"];
    }

    return { total_grade: pct, question_grades, overall_feedback, recommendations };
  };

  const handleSubmitExam = async () => {
    if (!exam) return;

    if (exam.isMcExam) {
      const localResults = gradeMcExamLocally();
      setResults(localResults);
      return;
    }

    if (examType === "past") {
      setIsGrading(true);
      setGradeError(null);

      try {
        const closedQuestions = exam.questions.filter(
          (q) => q.type === "multiple_choice" || q.type === "true_false"
        );
        const openQuestions = exam.questions.filter((q) => q.type === "open");

        const closedGrades = closedQuestions.map((q) => {
          const selected = answers[q.id] ?? "";
          const isCorrect = selected === q.correct_answer;
          return {
            question_id: q.id,
            grade: isCorrect ? q.points : 0,
            max_points: q.points,
            feedback: isCorrect
              ? "✓ תשובה נכונה"
              : `✗ תשובה שגויה — התשובה הנכונה היא: ${q.correct_answer ?? ""}`,
            correct_answer: q.correct_answer,
          };
        });

        let openGrades: GradingResult["question_grades"] = [];
        let aiOverallFeedback = "";
        let aiRecommendations: string[] = [];

        if (openQuestions.length > 0) {
          const res = await fetch("/api/grade-exam", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exam,
              answers,
              courseId: examCourseId || selectedCourse,
              examType,
              questionsSubset: openQuestions.map((q) => q.id),
            }),
          });
          const data = (await res.json()) as { ok: boolean; results?: GradingResult; error?: string };

          if (!data.ok || !data.results) {
            setGradeError(data.error ?? "שגיאה בבדיקת השאלות הפתוחות");
            return;
          }

          openGrades = data.results.question_grades;
          aiOverallFeedback = data.results.overall_feedback;
          aiRecommendations = data.results.recommendations ?? [];
        }

        const allGrades = [...closedGrades, ...openGrades].sort(
          (a, b) => a.question_id - b.question_id
        );

        const earned = allGrades.reduce((s, g) => s + g.grade, 0);
        const total = allGrades.reduce((s, g) => s + g.max_points, 0);
        const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

        let overall_feedback = aiOverallFeedback;
        if (!overall_feedback) {
          if (pct >= 90) overall_feedback = `מצוין! קיבלת ${pct}% (${earned}/${total} נקודות). שליטה מעולה בחומר.`;
          else if (pct >= 70) overall_feedback = `טוב! קיבלת ${pct}% (${earned}/${total} נקודות). יש מקום לשיפור.`;
          else if (pct >= 50) overall_feedback = `יש מקום לשיפור — קיבלת ${pct}% (${earned}/${total} נקודות).`;
          else overall_feedback = `ציון נמוך — ${pct}% (${earned}/${total} נקודות). מומלץ לעבור שוב על החומר.`;
        }

        setResults({ total_grade: pct, question_grades: allGrades, overall_feedback, recommendations: aiRecommendations });
      } catch {
        setGradeError("שגיאת רשת — נסה שוב");
      } finally {
        setIsGrading(false);
      }
      return;
    }

    setIsGrading(true);
    setGradeError(null);

    try {
      const res = await fetch("/api/grade-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          answers,
          courseId: examCourseId || selectedCourse,
          examType,
        }),
      });
      const data = (await res.json()) as { ok: boolean; results?: GradingResult; error?: string };

      if (!data.ok || !data.results) {
        setGradeError(data.error ?? "שגיאה בבדיקת המבחן");
        return;
      }

      setResults(data.results);
    } catch {
      setGradeError("שגיאת רשת — נסה שוב");
    } finally {
      setIsGrading(false);
    }
  };

  const handleAnswerChange = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleReset = () => {
    setExam(null);
    setAnswers({});
    setResults(null);
    setGenerateError(null);
    setGradeError(null);
  };

  // Loading state
  if (isGenerating) {
    return (
      <AppLayout title="מבחנים">
        <div className={styles.exams}>
          <div className={styles.loadingState}>
            <Loader2 className={styles.loadingSpinner} />
            <h2 className={styles.loadingTitle}>
              {examType === "mc"
                ? `בונה מבחן אמריקאי עם ${mcQuestionCount} שאלות...`
                : sourceIdParam
                  ? "טוען מבחן מהקובץ..."
                  : "מייצר מבחן אימון..."}
            </h2>
            <p className={styles.loadingSubtitle}>
              {examType === "mc"
                ? "קורא את כל חומרי הקורס ובונה שאלות אמריקאיות מכל ההרצאות"
                : sourceIdParam
                  ? "OpenAI קורא את מבחן העבר ומכין את השאלות"
                  : "קורא מבחני עבר + הרצאות ובונה מבחן חדש בעל אותו מבנה"}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="מבחנים">
      <div className={styles.exams}>
        {!exam ? (
          <>
            {/* ── Generator card ── */}
            <div className={styles.generator}>
              <div className={styles.generatorHeader}>
                <div className={styles.generatorIcon}>
                  <GraduationCap />
                </div>
                <h2 className={styles.generatorTitle}>צור מבחן אימון חדש</h2>
              </div>

              {generateError && (
                <div className={styles.generateError}>
                  <p>{generateError}</p>
                </div>
              )}

              <form className={styles.generatorForm}>
                <div>
                  <Label htmlFor="examCourse">קורס</Label>
                  <Select
                    value={selectedCourse}
                    onValueChange={(v) => {
                      setSelectedCourse(v);
                      writeSelectedCourse(v);
                    }}
                  >
                    <SelectTrigger id="examCourse">
                      <SelectValue placeholder="בחר קורס" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.length === 0 ? (
                        <SelectItem value="_empty" disabled>
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

                <div>
                  <Label htmlFor="examTopic">נושאים (אופציונלי)</Label>
                  <Select>
                    <SelectTrigger id="examTopic">
                      <SelectValue placeholder="כל הנושאים" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הנושאים</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className={styles.examButtons}>
                  <Button
                    type="button"
                    onClick={handleGenerateExam}
                    disabled={isGenerating || selectedCourse === "_empty"}
                    size="lg"
                    variant="outline"
                  >
                    <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                    צור מבחן סיכום
                  </Button>

                  <div className={styles.mcButtonGroup}>
                    <Button
                      type="button"
                      onClick={() => setShowMcOptions((v) => !v)}
                      disabled={isGenerating || selectedCourse === "_empty"}
                      size="lg"
                    >
                      <ListChecks style={{ marginLeft: "var(--space-2)" }} />
                      צור מבחן אמריקאי
                      {showMcOptions ? (
                        <ChevronUp style={{ marginRight: "var(--space-2)", width: 16, height: 16 }} />
                      ) : (
                        <ChevronDown style={{ marginRight: "var(--space-2)", width: 16, height: 16 }} />
                      )}
                    </Button>

                    {showMcOptions && (
                      <div className={styles.mcOptions}>
                        <Label htmlFor="mcCount">מספר שאלות</Label>
                        <div className={styles.mcCountRow}>
                          <Input
                            id="mcCount"
                            type="number"
                            min={5}
                            max={50}
                            value={mcQuestionCount}
                            onChange={(e) =>
                              setMcQuestionCount(Math.max(5, Math.min(50, parseInt(e.target.value) || 10)))
                            }
                            className={styles.mcCountInput}
                          />
                          <Button
                            type="button"
                            onClick={handleGenerateMcExam}
                            disabled={isGenerating || selectedCourse === "_empty"}
                            size="lg"
                          >
                            <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                            בנה מבחן
                          </Button>
                        </div>
                        <p className={styles.mcHint}>5–50 שאלות • 4 תשובות לכל שאלה • מכסה את כל ההרצאות</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.fromSourceHint}>
                  <ClipboardList style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span>
                    כדי לתרגל מבחן עבר ספציפי, עבור למקורות לימוד ולחץ על <strong>הצג כבחינה</strong> על מבחן עבר
                  </span>
                </div>
              </form>
            </div>

            {/* ── Saved exams list ── */}
            {courseExams.length > 0 && (
              <div className={styles.savedExams}>
                <div className={styles.savedExamsHeader}>
                  <BookOpen className={styles.savedExamsIcon} />
                  <h3 className={styles.savedExamsTitle}>מבחנים שמורים לקורס זה</h3>
                  <span className={styles.savedExamsCount}>{courseExams.length}</span>
                </div>

                <div className={styles.savedExamsList}>
                  {courseExams.map((row) => {
                    const questionCount = (() => {
                      try {
                        const parsed = JSON.parse(row.exam_content) as { questions?: unknown[] };
                        return parsed.questions?.length ?? 0;
                      } catch {
                        return 0;
                      }
                    })();

                    return (
                      <div key={row.id} className={styles.savedExamCard}>
                        <div className={styles.savedExamInfo}>
                          <div className={styles.savedExamTitleRow}>
                            <span className={styles.savedExamTitle}>{row.title ?? "מבחן ללא כותרת"}</span>
                            <Badge variant={examTypeBadgeVariant(row.exam_type)}>
                              {examTypeLabel(row.exam_type)}
                            </Badge>
                          </div>

                          <div className={styles.savedExamMeta}>
                            {row.created_at && (
                              <span className={styles.savedExamMetaItem}>
                                <Calendar style={{ width: 13, height: 13 }} />
                                {formatExamDate(row.created_at)}
                              </span>
                            )}
                            {questionCount > 0 && (
                              <span className={styles.savedExamMetaItem}>
                                <ClipboardList style={{ width: 13, height: 13 }} />
                                {questionCount} שאלות
                              </span>
                            )}
                            {row.grade !== null && (
                              <span className={styles.savedExamMetaItem}>
                                <Trophy style={{ width: 13, height: 13 }} />
                                ציון אחרון: {row.grade}%
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenSavedExam(row)}
                        >
                          <BookOpen style={{ width: 14, height: 14, marginLeft: "var(--space-1)" }} />
                          פתח מבחן
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.exam}>
              <div className={styles.examHeader}>
                <h1 className={styles.examTitle}>{exam.title}</h1>
                {exam.isMcExam && (
                  <span className={styles.mcBadge}>
                    <ListChecks style={{ width: 14, height: 14 }} />
                    מבחן אמריקאי — {exam.questions.length} שאלות
                  </span>
                )}
                {exam.instructions && <p className={styles.examInstructions}>{exam.instructions}</p>}
              </div>

              <div className={styles.questions}>
                {exam.questions.map((question) => {
                  const questionGrade = results?.question_grades?.find((g) => g.question_id === question.id);

                  return (
                    <div key={question.id} className={styles.question}>
                      <div className={styles.questionHeader}>
                        <span className={styles.questionNumber}>שאלה {question.id}</span>
                        <p className={styles.questionText}>{question.question}</p>
                        <span className={styles.questionPoints}>
                          {results ? `${questionGrade?.grade ?? 0}/${question.points}` : `${question.points} נקודות`}
                        </span>
                      </div>

                      {question.type === "multiple_choice" || question.type === "true_false" ? (
                        <div className={styles.options}>
                          {question.options?.map((option, idx) => {
                            const isSelected = answers[question.id] === option;
                            const isCorrect =
                              results &&
                              (questionGrade?.correct_answer === option || question.correct_answer === option);
                            const isWrong =
                              results &&
                              isSelected &&
                              questionGrade?.correct_answer !== option &&
                              question.correct_answer !== option;

                            return (
                              <label
                                key={idx}
                                className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${isCorrect ? styles.optionCorrect : ""} ${isWrong ? styles.optionWrong : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value={option}
                                  checked={isSelected}
                                  onChange={(e) => !results && handleAnswerChange(question.id, e.target.value)}
                                  disabled={!!results}
                                />
                                <span>{option}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.answerArea}>
                          <Textarea
                            value={answers[question.id] || ""}
                            onChange={(e) => !results && handleAnswerChange(question.id, e.target.value)}
                            placeholder={results ? "" : "כתוב את תשובתך כאן..."}
                            rows={6}
                            className={styles.textarea}
                            readOnly={!!results}
                          />
                        </div>
                      )}

                      {results && questionGrade && (
                        <div
                          className={`${styles.questionFeedback} ${
                            questionGrade.grade === questionGrade.max_points
                              ? styles.questionFeedbackCorrect
                              : styles.questionFeedbackWrong
                          }`}
                        >
                          <span className={styles.questionFeedbackScore}>
                            {questionGrade.grade}/{questionGrade.max_points}
                          </span>
                          <span>{questionGrade.feedback}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {gradeError && (
                <div className={styles.gradeError}>
                  <p>{gradeError}</p>
                </div>
              )}

              <div className={styles.examActions}>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw style={{ marginLeft: "var(--space-2)" }} />
                  {results ? "מבחן חדש" : "חזור"}
                </Button>
                {!results && (
                  <Button onClick={handleSubmitExam} disabled={isGrading} size="lg">
                    <Send style={{ marginLeft: "var(--space-2)" }} />
                    {isGrading ? (
                      <>
                        <Loader2
                          style={{
                            width: 16,
                            height: 16,
                            marginLeft: "var(--space-2)",
                            animation: "var(--animation-spin)",
                          }}
                        />
                        בודק תשובות...
                      </>
                    ) : (
                      "שלח לבדיקה"
                    )}
                  </Button>
                )}
              </div>
            </div>

            {results && (
              <div className={styles.results}>
                <div className={styles.resultsHeader}>
                  <p className={styles.resultsGrade}>{results.total_grade}%</p>
                  <p className={styles.resultsLabel}>הציון שלך</p>
                </div>
                <div className={styles.resultsFeedback}>{results.overall_feedback}</div>
                {results.recommendations?.length > 0 && (
                  <ul className={styles.recommendations}>
                    {results.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
