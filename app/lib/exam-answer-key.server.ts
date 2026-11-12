/**
 * Answer key checks for AI-generated exams.
 *
 * Closed questions (multiple_choice / true_false) are graded in the browser by
 * comparing the chosen option to `correct_answer`, so the key must be exactly
 * one of the question's options. The model sometimes returns a slightly
 * different string (extra spaces, a letter instead of the text). This maps such
 * keys to the matching option, and removes keys that match no option, so those
 * questions are graded by the AI instead of being marked wrong.
 */

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

interface QuestionLike {
  type?: unknown;
  options?: unknown;
  correct_answer?: unknown;
}

export function sanitizeAnswerKey(exam: unknown): void {
  const questions = (exam as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(questions)) return;

  for (const q of questions as QuestionLike[]) {
    if (!q || (q.type !== "multiple_choice" && q.type !== "true_false")) continue;

    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string") : [];
    const key = typeof q.correct_answer === "string" ? normalize(q.correct_answer) : "";
    const match = key ? options.find((o) => normalize(o) === key) : undefined;

    if (match !== undefined) {
      q.correct_answer = match;
    } else {
      delete q.correct_answer;
    }
  }
}
