/**
 * Which course content an AI exam is built from: all lectures and articles of
 * the course (default), or only the sources the student chose.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  courseContentFilter,
  ensureSourceIdAttributes,
  type CourseContentSourceType,
} from "~/lib/openai.server";
import type { SourceRow } from "~/services/sources.service";

export type ExamContentSelection =
  | {
      ok: true;
      lectures: SourceRow[];
      articles: SourceRow[];
      /** file_search filter limited to the selected content */
      filter: ReturnType<typeof courseContentFilter>;
    }
  | { ok: false; error: string };

/** Reads the optional `sourceIds` field of a request body. */
export function readSourceIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Picks the selected lectures and articles and builds the matching
 * file_search filter.
 *
 * - No `sourceIds`: all lectures and articles of the course.
 * - Every source of each selected type (for example "all lectures"): filter
 *   by source type only.
 * - Any other subset: filter by source id. Files uploaded before the
 *   `source_id` attribute existed are tagged first.
 */
export async function selectExamContent({
  db,
  studentId,
  courseId,
  lectures,
  articles,
  sourceIds,
}: {
  db: SupabaseClient;
  studentId: string;
  courseId: string;
  lectures: SourceRow[];
  articles: SourceRow[];
  sourceIds: string[] | undefined;
}): Promise<ExamContentSelection> {
  if (!sourceIds) {
    return { ok: true, lectures, articles, filter: courseContentFilter(studentId, courseId) };
  }

  const wanted = new Set(sourceIds);
  const selectedLectures = lectures.filter((s) => wanted.has(s.id));
  const selectedArticles = articles.filter((s) => wanted.has(s.id));

  if (selectedLectures.length === 0 && selectedArticles.length === 0) {
    return { ok: false, error: "לא נבחרו חומרי לימוד למבחן. בחר לפחות הרצאה או מאמר אחד." };
  }

  const lecturesWhole = selectedLectures.length === 0 || selectedLectures.length === lectures.length;
  const articlesWhole = selectedArticles.length === 0 || selectedArticles.length === articles.length;

  const sourceTypes: CourseContentSourceType[] = [];
  if (selectedLectures.length > 0) sourceTypes.push("Lecture");
  if (selectedArticles.length > 0) sourceTypes.push("Article");

  if (lecturesWhole && articlesWhole) {
    return {
      ok: true,
      lectures: selectedLectures,
      articles: selectedArticles,
      filter: courseContentFilter(studentId, courseId, { sourceTypes }),
    };
  }

  const selected = [...selectedLectures, ...selectedArticles];
  await ensureSourceIdAttributes(db, selected);
  return {
    ok: true,
    lectures: selectedLectures,
    articles: selectedArticles,
    filter: courseContentFilter(studentId, courseId, { sourceTypes, sourceIds: selected.map((s) => s.id) }),
  };
}

/** Display labels of the lectures and articles an exam was built from, saved with the exam. */
export function examSourceLabels(lectures: SourceRow[], articles: SourceRow[]): string[] {
  return [
    ...lectures.map((s) => (s.lecture_number ? `הרצאה ${s.lecture_number} — ${s.topic}` : s.topic)),
    ...articles.map((s) => `מאמר — ${s.topic}`),
  ];
}
