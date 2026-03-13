import * as React from "react";
import { Sparkles, GraduationCap, Send, RotateCcw, Loader2, ClipboardList } from "lucide-react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/exams";
import { AppLayout } from "~/components/layout/app-layout";
import { Button } from "~/components/ui/button/button";
import { Label } from "~/components/ui/label/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Textarea } from "~/components/ui/textarea/textarea";
import { getStudent, getCourses } from "~/services/settings.service";
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
  points: number;
}

interface ExamData {
  title: string;
  instructions: string;
  questions: Question[];
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
  if (!student) return { courses: [] as Awaited<ReturnType<typeof getCourses>> };
  const courses = await getCourses(student.id);
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
  // Track which course the currently displayed exam belongs to
  const [examCourseId, setExamCourseId] = React.useState<string>("");

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
      }
    } catch {
      setGenerateError("שגיאת רשת — נסה שוב");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitExam = async () => {
    if (!exam) return;
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
              {sourceIdParam ? "טוען מבחן מהקובץ..." : "מייצר מבחן אימון..."}
            </h2>
            <p className={styles.loadingSubtitle}>
              {sourceIdParam
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

              <Button type="button" onClick={handleGenerateExam} disabled={isGenerating || selectedCourse === "_empty"} size="lg">
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isGenerating ? "מייצר מבחן..." : "צור מבחן עם AI"}
              </Button>

              <div className={styles.fromSourceHint}>
                <ClipboardList style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>
                  כדי לתרגל מבחן עבר ספציפי, עבור למקורות לימוד ולחץ על{" "}
                  <strong>הצג כבחינה</strong> על מבחן עבר
                </span>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className={styles.exam}>
              <div className={styles.examHeader}>
                <h1 className={styles.examTitle}>{exam.title}</h1>
                {exam.instructions && (
                  <p className={styles.examInstructions}>{exam.instructions}</p>
                )}
              </div>

              <div className={styles.questions}>
                {exam.questions.map((question) => {
                  const questionGrade = results?.question_grades?.find(
                    (g) => g.question_id === question.id
                  );

                  return (
                    <div key={question.id} className={styles.question}>
                      <div className={styles.questionHeader}>
                        <span className={styles.questionNumber}>שאלה {question.id}</span>
                        <p className={styles.questionText}>{question.question}</p>
                        <span className={styles.questionPoints}>
                          {results
                            ? `${questionGrade?.grade ?? 0}/${question.points}`
                            : `${question.points} נקודות`}
                        </span>
                      </div>

                      {question.type === "multiple_choice" || question.type === "true_false" ? (
                        <div className={styles.options}>
                          {question.options?.map((option, idx) => {
                            const isSelected = answers[question.id] === option;
                            const isCorrect =
                              results && questionGrade?.correct_answer === option;
                            const isWrong =
                              results && isSelected && questionGrade?.correct_answer !== option;

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
                                  onChange={(e) =>
                                    !results && handleAnswerChange(question.id, e.target.value)
                                  }
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
                            onChange={(e) =>
                              !results && handleAnswerChange(question.id, e.target.value)
                            }
                            placeholder={results ? "" : "כתוב את תשובתך כאן..."}
                            rows={6}
                            className={styles.textarea}
                            readOnly={!!results}
                          />
                        </div>
                      )}

                      {/* Per-question feedback after grading */}
                      {results && questionGrade && (
                        <div className={styles.questionFeedback}>
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
                        <Loader2 style={{ width: 16, height: 16, marginLeft: "var(--space-2)", animation: "var(--animation-spin)" }} />
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
                  <p className={styles.resultsGrade}>{results.total_grade}</p>
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
