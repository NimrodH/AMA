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
} from "lucide-react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/exams";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Textarea } from "~/components/ui/textarea/textarea";
import { Input } from "~/components/ui/input/input";
import { getStudent, getActiveCourses } from "~/services/settings.service";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
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
  /** Present in MC exam — the correct answer string */
  correct_answer?: string;
  points: number;
}

interface ExamData {
  title: string;
  instructions: string;
  questions: Question[];
  /** Marks this as a pure MC exam (4 options, AI grading with explanations) */
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

export async function loader() {
  const student = await getStudent();
  if (!student) return { courses: [] as Awaited<ReturnType<typeof getActiveCourses>> };
  const courses = await getActiveCourses(student.id);
  return { courses };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function Exams({ loaderData }: Route.ComponentProps) {
  const { courses } = loaderData;
  const [searchParams] = useSearchParams();
  const sourceIdParam = searchParams.get("sourceId");

  const [selectedCourse, setSelectedCourse] = React.useState(() => {
    if (courses.length === 0) return "_empty";
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return courses[0].course_id;
  });

  // Sync selected course when courses list changes (e.g. after hydration)
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

  // MC exam question count selector
  const [showMcOptions, setShowMcOptions] = React.useState(false);
  const [mcQuestionCount, setMcQuestionCount] = React.useState(10);

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
        // Tag the exam as MC so the grading + display logic is optimised for it
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

  /** Grade the MC exam client-side — no server round-trip needed for pure MC */
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

    return {
      total_grade: pct,
      question_grades,
      overall_feedback,
      recommendations,
    };
  };

  const handleSubmitExam = async () => {
    if (!exam) return;

    // Pure MC exams (generated by AI) — grade fully locally
    if (exam.isMcExam) {
      const localResults = gradeMcExamLocally();
      setResults(localResults);
      return;
    }

    // Past exams: grade MC/true_false locally, send open questions to AI
    if (examType === "past") {
      setIsGrading(true);
      setGradeError(null);

      try {
        const closedQuestions = exam.questions.filter(
          (q) => q.type === "multiple_choice" || q.type === "true_false"
        );
        const openQuestions = exam.questions.filter((q) => q.type === "open");

        // ── Grade MC / true-false locally ──────────────────────────────────
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

        // ── Grade open questions via AI ────────────────────────────────────
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

        // ── Merge results ──────────────────────────────────────────────────
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

        setResults({
          total_grade: pct,
          question_grades: allGrades,
          overall_feedback,
          recommendations: aiRecommendations,
        });
      } catch {
        setGradeError("שגיאת רשת — נסה שוב");
      } finally {
        setIsGrading(false);
      }
      return;
    }

    // AI / summary exam — send everything to AI
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

  // Loading state — generating exam from source
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

              {/* ── Action buttons ── */}
              <div className={styles.examButtons}>
                {/* Existing: full summary exam (renamed) */}
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

                {/* New: MC quiz */}
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

                      {/* Per-question feedback after grading */}
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
