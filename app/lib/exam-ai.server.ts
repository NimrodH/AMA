/**
 * Shared helpers for AI-generated exams: reading the Responses API output, the
 * exam structure taken from a past exam, and fitting a generated exam to it.
 */
import type OpenAI from "openai";
import { parseModelJson } from "~/lib/model-json.server";
import { sanitizeAnswerKey } from "~/lib/exam-answer-key.server";

export type QuestionType = "multiple_choice" | "true_false" | "open";

export interface ExamQuestion {
  id: number;
  type: QuestionType;
  question: string;
  options?: string[];
  correct_answer?: string;
  model_answer?: string;
  points: number;
}

export interface ExamData {
  title?: string;
  instructions?: string;
  questions: ExamQuestion[];
}

/** One question position in the required structure. */
export interface ExamSlot {
  type: QuestionType;
  points: number;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "אמריקאית (multiple_choice)",
  true_false: "נכון/לא נכון (true_false)",
  open: "פתוחה (open)",
};

const isQuestionType = (t: unknown): t is QuestionType =>
  t === "multiple_choice" || t === "true_false" || t === "open";

/** Pull the final text content from a Responses API response object. */
export function extractOutputText(response: {
  output_text?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
}): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.trim()) return part.text.trim();
        }
      }
    }
  }
  return "";
}

/** The ordered question slots (type + points of each question) of a parsed exam. */
export function slotsFromExam(exam: unknown): ExamSlot[] {
  const questions = (exam as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((q): q is { type: QuestionType; points?: unknown } => isQuestionType((q as { type?: unknown })?.type))
    .map((q) => ({ type: q.type, points: Number(q.points) > 0 ? Number(q.points) : 1 }));
}

/**
 * Hard-constraint description of the structure for the prompt: runs of
 * consecutive questions with the same type and points.
 */
export function describeStructure(slots: ExamSlot[], basedOn: string): string {
  const runs: { from: number; to: number; slot: ExamSlot }[] = [];
  slots.forEach((slot, i) => {
    const last = runs[runs.length - 1];
    if (last && last.slot.type === slot.type && last.slot.points === slot.points) last.to = i + 1;
    else runs.push({ from: i + 1, to: i + 1, slot });
  });

  const count = (t: QuestionType) => slots.filter((s) => s.type === t).length;
  const total = slots.reduce((sum, s) => sum + s.points, 0);

  return [
    `=== מבנה מחייב של המבחן (חייב להישמר בדיוק) ===`,
    `מבוסס על: ${basedOn}`,
    `סה"כ ${slots.length} שאלות, ${total} נקודות, בסדר הבא:`,
    ...runs.map((r) =>
      r.from === r.to
        ? `• שאלה ${r.from}: ${TYPE_LABELS[r.slot.type]}, ${r.slot.points} נקודות`
        : `• שאלות ${r.from}–${r.to}: ${TYPE_LABELS[r.slot.type]}, ${r.slot.points} נקודות כל אחת`
    ),
    ``,
    `חובה: בדיוק ${count("multiple_choice")} שאלות multiple_choice, ${count("true_false")} שאלות true_false ו-${count("open")} שאלות open.`,
    `=== סוף הגדרת מבנה מחייב ===`,
  ].join("\n");
}

/** Keep only well-formed questions (closed questions need at least 2 options). */
function validQuestions(exam: unknown): ExamQuestion[] {
  const questions = (exam as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(questions)) return [];
  return questions.filter((q): q is ExamQuestion => {
    const item = q as Partial<ExamQuestion> | null;
    if (!item || !isQuestionType(item.type) || typeof item.question !== "string" || !item.question.trim()) return false;
    if (item.type === "open") return true;
    return Array.isArray(item.options) && item.options.filter((o) => typeof o === "string").length >= 2;
  });
}

export interface FitResult {
  questions: ExamQuestion[];
  /** Slots that no generated question could fill */
  missing: ExamSlot[];
}

/**
 * Arrange the generated questions in the order of the required slots and give
 * each the slot's points. Extra questions are dropped; slots without a
 * question of their type are reported as missing. Ids are renumbered 1..n.
 */
export function fitToSlots(candidates: ExamQuestion[], slots: ExamSlot[]): FitResult {
  const pool: Record<QuestionType, ExamQuestion[]> = { multiple_choice: [], true_false: [], open: [] };
  for (const q of candidates) pool[q.type].push(q);

  const questions: ExamQuestion[] = [];
  const missing: ExamSlot[] = [];
  for (const slot of slots) {
    const q = pool[slot.type].shift();
    if (q) questions.push({ ...q, points: slot.points });
    else missing.push(slot);
  }
  questions.forEach((q, i) => (q.id = i + 1));
  return { questions, missing };
}

interface FillMissingParams {
  client: OpenAI;
  /** The file_search tool used for the main generation */
  fileSearchTool: OpenAI.Responses.FileSearchTool;
  systemPrompt: string;
  existing: ExamQuestion[];
  missing: ExamSlot[];
}

/**
 * One short follow-up call that asks only for the missing questions. Returns
 * the new (valid, answer-key checked) questions; empty on any failure.
 */
export async function generateMissingQuestions({
  client,
  fileSearchTool,
  systemPrompt,
  existing,
  missing,
}: FillMissingParams): Promise<ExamQuestion[]> {
  const need = (["multiple_choice", "true_false", "open"] as QuestionType[])
    .map((t) => ({ t, n: missing.filter((s) => s.type === t).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} שאלות ${TYPE_LABELS[x.t]}`)
    .join(", ");

  const userPrompt = `המבחן כבר כולל את השאלות הבאות (אל תחזור עליהן ואל תנסח אותן מחדש):
${existing.map((q) => `- ${q.question}`).join("\n")}

צור רק את השאלות החסרות: ${need}.
החזר JSON במבנה {"questions": [...]} עם אותו פורמט שאלה ואותו מפתח תשובות כמו בהוראות המערכת.`;

  try {
    const response = await client.responses.create({
      model: "gpt-4o",
      text: { format: { type: "json_object" } },
      tools: [fileSearchTool],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const data = parseModelJson(extractOutputText(response));
    if (data === undefined) return [];
    sanitizeAnswerKey(data);
    return validQuestions(data);
  } catch (err) {
    console.warn("[exam-ai] generating missing questions failed:", err);
    return [];
  }
}

/**
 * Fit a generated exam to the required slots, asking once for any missing
 * questions. Mutates and returns `exam` with the fitted question list.
 */
export async function fitExamToSlots(
  exam: unknown,
  slots: ExamSlot[],
  fill: Omit<FillMissingParams, "existing" | "missing">
): Promise<{ exam: ExamData; missing: number }> {
  const data = exam as ExamData;
  let fit = fitToSlots(validQuestions(exam), slots);

  if (fit.missing.length > 0) {
    const extra = await generateMissingQuestions({ ...fill, existing: fit.questions, missing: fit.missing });
    if (extra.length > 0) fit = fitToSlots([...fit.questions, ...extra], slots);
  }

  data.questions = fit.questions;
  return { exam: data, missing: fit.missing.length };
}
