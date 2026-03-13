import * as React from "react";
import { Sparkles, GraduationCap, Send, RotateCcw } from "lucide-react";
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

const mockExam: ExamData = {
  title: "מבחן אימון - כימיה אורגנית 1",
  instructions: "ענה על כל השאלות. זמן המבחן: 90 דקות. בהצלחה!",
  questions: [
    {
      id: 1,
      type: "multiple_choice",
      question: "מהו מספר האלקטרונים המצומדים בבנזן?",
      options: ["4", "6", "8", "10"],
      points: 10,
    },
    {
      id: 2,
      type: "true_false",
      question: "כל התרכובות המחזוריות הן תרכובות ארומטיות",
      options: ["נכון", "לא נכון"],
      points: 5,
    },
    {
      id: 3,
      type: "open",
      question: "הסבר מהי תופעת הרזוננס בתרכובות ארומטיות ומדוע היא מקנה יציבות למולקולה.",
      points: 15,
    },
    {
      id: 4,
      type: "multiple_choice",
      question: "איזו מהתרכובות הבאות אינה ארומטית?",
      options: ["בנזן", "טולואן", "ציקלוהקסן", "נפתלן"],
      points: 10,
    },
  ],
};

export async function loader() {
  const student = await getStudent();
  if (!student) return { courses: [] as Awaited<ReturnType<typeof getCourses>> };
  const courses = await getCourses(student.id);
  return { courses };
}

export default function Exams({ loaderData }: Route.ComponentProps) {
  const { courses } = loaderData;
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
  const [results, setResults] = React.useState<any>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isGrading, setIsGrading] = React.useState(false);

  const handleGenerateExam = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setExam(mockExam);
      setAnswers({});
      setResults(null);
      setIsGenerating(false);
    }, 2000);
  };

  const handleSubmitExam = () => {
    setIsGrading(true);
    setTimeout(() => {
      setResults({
        total_grade: 85,
        overall_feedback: `ביצוע מצוין! הראית הבנה טובה של החומר.

נקודות חוזק:
- תשובות מדויקות בשאלות הרב-ברירה
- הסבר מפורט ומובנה בשאלה הפתוחה

תחומים לשיפור:
- הרחב את ההסבר על תופעת הרזוננס
- הוסף דוגמאות נוספות`,
        recommendations: ["חזור על פרק 3 בספר", "תרגל שאלות נוספות על ארומטיות", "צפה בהרצאה מספר 5 שוב"],
      });
      setIsGrading(false);
    }, 2000);
  };

  const handleAnswerChange = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

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
                    <SelectItem value="aromatic">תרכובות ארומטיות</SelectItem>
                    <SelectItem value="alkanes">אלקנים</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="button" onClick={handleGenerateExam} disabled={isGenerating || selectedCourse === "_empty"} size="lg">
                <Sparkles style={{ marginLeft: "var(--space-2)" }} />
                {isGenerating ? "מייצר מבחן..." : "צור מבחן עם AI"}
              </Button>
            </form>
          </div>
        ) : (
          <>
            <div className={styles.exam}>
              <div className={styles.examHeader}>
                <h1 className={styles.examTitle}>{exam.title}</h1>
                <p className={styles.examInstructions}>{exam.instructions}</p>
              </div>

              <div className={styles.questions}>
                {exam.questions.map((question) => (
                  <div key={question.id} className={styles.question}>
                    <div className={styles.questionHeader}>
                      <span className={styles.questionNumber}>שאלה {question.id}</span>
                      <p className={styles.questionText}>{question.question}</p>
                      <span className={styles.questionPoints}>{question.points} נקודות</span>
                    </div>

                    {question.type === "multiple_choice" || question.type === "true_false" ? (
                      <div className={styles.options}>
                        {question.options?.map((option, idx) => (
                          <label
                            key={idx}
                            className={`${styles.option} ${answers[question.id] === option ? styles.optionSelected : ""}`}
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={option}
                              checked={answers[question.id] === option}
                              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.answerArea}>
                        <Textarea
                          value={answers[question.id] || ""}
                          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                          placeholder="כתוב את תשובתך כאן..."
                          rows={6}
                          className={styles.textarea}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.examActions}>
                <Button variant="outline" onClick={() => setExam(null)}>
                  <RotateCcw style={{ marginLeft: "var(--space-2)" }} />
                  צור מבחן חדש
                </Button>
                <Button onClick={handleSubmitExam} disabled={isGrading} size="lg">
                  <Send style={{ marginLeft: "var(--space-2)" }} />
                  {isGrading ? "בודק תשובות..." : "שלח לבדיקה"}
                </Button>
              </div>
            </div>

            {results && (
              <div className={styles.results}>
                <div className={styles.resultsHeader}>
                  <p className={styles.resultsGrade}>{results.total_grade}</p>
                  <p className={styles.resultsLabel}>הציון שלך</p>
                </div>
                <div className={styles.resultsFeedback}>{results.overall_feedback}</div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
