/**
 * Server-only action logic for the sources route.
 * Kept separate to prevent openai.server / google-docs.server from leaking
 * into the client bundle via the route's default (component) export.
 */
import {
  addSource,
  addSourceFromUrl,
  deleteSource,
} from "~/services/sources.service.server";

export type { SourceRow } from "~/services/sources.service.server";

interface AddSourceParams {
  studentId: string;
  courseId: string;
  courseName: string;
  sourceType: "Lecture" | "Card" | "Past exam" | "Article";
  topic: string;
  lectureNumber: number | null;
  file: File;
  request: Request;
}

interface AddSourceFromUrlParams {
  studentId: string;
  courseId: string;
  courseName: string;
  sourceType: "Lecture" | "Card" | "Past exam" | "Article";
  topic: string;
  lectureNumber: number | null;
  googleDocsUrl: string;
  request: Request;
}

export async function handleSourceAction(form: FormData, request: Request) {
  const intent = form.get("intent") as string;

  // ── Delete action ────────────────────────────────────────────────────────
  if (intent === "delete") {
    const sourceId = form.get("sourceId") as string;
    const studentId = form.get("studentId") as string;
    if (!sourceId || !studentId) return { ok: false, error: "חסרים פרמטרים" };
    return deleteSource(sourceId, studentId, request);
  }

  // ── Upload action (default) ───────────────────────────────────────────────
  const studentId = form.get("studentId") as string;
  const courseId = form.get("courseId") as string;
  const courseName = form.get("courseName") as string;
  const sourceType = form.get("sourceType") as "Lecture" | "Past exam" | "Article";
  const topic = form.get("topic") as string;
  const lectureNumberRaw = form.get("lectureNumber") as string;
  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;

  // ── URL branch (Google Docs) ──────────────────────────────────────────────
  const googleDocsUrl = form.get("googleDocsUrl") as string | null;
  if (googleDocsUrl) {
    if (!studentId || !courseId || !sourceType || !topic) {
      return { ok: false, error: "יש למלא את כל השדות" };
    }
    return addSourceFromUrl({
      studentId,
      courseId,
      courseName,
      sourceType,
      topic,
      lectureNumber,
      googleDocsUrl,
      request,
    });
  }

  // ── File branch ───────────────────────────────────────────────────────────
  const file = form.get("file") as File | null;

  if (!studentId || !courseId || !sourceType || !topic || !file || file.size === 0) {
    return { ok: false, error: "יש למלא את כל השדות ולהעלות קובץ" };
  }

  return addSource({
    studentId,
    courseId,
    courseName,
    sourceType,
    topic,
    lectureNumber,
    file,
    request,
  });
}
