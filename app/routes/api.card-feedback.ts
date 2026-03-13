import type { Route } from "./+types/api.card-feedback";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";

export async function action({ request }: Route.ActionArgs) {
  const { courseId, lectureNumber, cardContent } = (await request.json()) as {
    courseId: string;
    lectureNumber: string | null;
    cardContent: string;
  };

  if (!courseId || !cardContent) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  // ── 1. Find matching lecture sources ──────────────────────────────────────
  // Strategy:
  // - Always include sources with lecture_number = NULL (course-wide materials)
  // - If the card has a lecture_number, also include sources matching that number
  // - Never exclude course-wide sources just because the card has a lecture number
  const db = createServerClient();
  const lectureNum = lectureNumber ? parseInt(lectureNumber, 10) : null;

  // Fetch ALL lecture sources for this course with a vector store file
  const { data: allCourseSources } = await db
    .from("sources")
    .select("id, topic, lecture_number, vector_store_file_id")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .eq("source_type", "Lecture")
    .not("vector_store_file_id", "is", null);

  const courseSources = allCourseSources ?? [];

  // Filter: course-wide (null) sources are always included.
  // If the card has a lecture_number, also include sources with that exact lecture_number.
  // If the card has no lecture_number, include ALL sources for the course.
  const matchingSources = courseSources.filter((s) => {
    if (s.lecture_number === null) return true; // course-wide: always relevant
    if (lectureNum === null) return true;        // card has no lecture scope: include all
    return s.lecture_number === lectureNum;      // match exact lecture number
  });

  // ── 2. Build context hints ────────────────────────────────────────────────
  const sourceList =
    matchingSources.length > 0
      ? matchingSources
          .map((s) => `\u2022 ${s.topic}${s.lecture_number ? ` (\u05d4\u05e8\u05e6\u05d0\u05d4 ${s.lecture_number})` : " (\u05db\u05dc\u05dc \u05d4\u05e7\u05d5\u05e8\u05e1)"}`)
          .join("\n")
      : null;

  const vectorStoreFileIds = matchingSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build prompts ──────────────────────────────────────────────────────
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  const cardLectureHint =
    lectureNum !== null
      ? `\u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05e9\u05d9\u05d9\u05da \u05dc\u05d4\u05e8\u05e6\u05d0\u05d4 \u05de\u05e1\u05e4\u05e8 ${lectureNum}.`
      : "\u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05d0\u05d9\u05e0\u05d5 \u05de\u05e9\u05d5\u05d9\u05da \u05dc\u05d4\u05e8\u05e6\u05d0\u05d4 \u05e1\u05e4\u05e6\u05d9\u05e4\u05d9\u05ea \u2014 \u05d4\u05e9\u05ea\u05de\u05e9 \u05d1\u05db\u05dc \u05d7\u05d5\u05de\u05e8\u05d9 \u05d4\u05e7\u05d5\u05e8\u05e1 \u05d4\u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9\u05d9\u05dd.";

  // Parse card title vs content (encoded as "title\n---\ncontent" from the client)
  const sep = "\n---\n";
  const sepIdx = cardContent.indexOf(sep);
  const cardTitle = sepIdx !== -1 ? cardContent.slice(0, sepIdx).trim() : "";
  const cardBody = sepIdx !== -1 ? cardContent.slice(sepIdx + sep.length).trim() : cardContent;

  const systemPrompt = [
    "\u05d0\u05ea\u05d4 \u05de\u05d5\u05de\u05d7\u05d4 \u05d0\u05e7\u05d3\u05de\u05d9 \u05d4\u05de\u05e1\u05e4\u05e7 \u05de\u05e9\u05d5\u05d1 \u05e2\u05dc \u05db\u05e8\u05d8\u05d9\u05e1\u05d9 \u05dc\u05de\u05d9\u05d3\u05d4 \u05e9\u05dc \u05e1\u05d8\u05d5\u05d3\u05e0\u05d8\u05d9\u05dd.",
    sourceList
      ? `\u05de\u05e7\u05d5\u05e8\u05d5\u05ea \u05d4\u05dc\u05de\u05d9\u05d3\u05d4 \u05d4\u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9\u05d9\u05dd \u05dc\u05db\u05e8\u05d8\u05d9\u05e1 \u05d6\u05d4:\n${sourceList}`
      : "",
    cardLectureHint,
    "",
    // ── CRITICAL SEARCH INSTRUCTION ──
    // The source document is a course-wide summary (lecture_number = null). The vector search
    // must find the relevant section even if it is on page 2 or under a slightly different heading.
    "\u05d7\u05e9\u05d5\u05d1 \u05de\u05d0\u05d5\u05d3: \u05d1\u05e6\u05e2 \u05d7\u05d9\u05e4\u05d5\u05e9 \u05e8\u05d7\u05d1 \u05d1\u05db\u05dc \u05d4\u05de\u05e1\u05de\u05db\u05d9\u05dd \u05e9\u05e6\u05d5\u05e8\u05e4\u05d5 \u2014 \u05db\u05d5\u05dc\u05dc \u05e1\u05d9\u05db\u05d5\u05de\u05d9\u05dd \u05db\u05dc\u05dc\u05d9\u05d9\u05dd \u05d5\u05e7\u05d1\u05e6\u05d9\u05dd \u05e2\u05dd lecture_number=null. \u05d4\u05de\u05d5\u05e9\u05d2 \u05e2\u05e9\u05d5\u05d9 \u05dc\u05d4\u05d5\u05e4\u05d9\u05e2 \u05d1\u05e2\u05de\u05d5\u05d3 \u05d0\u05d7\u05e8, \u05e4\u05e8\u05e7 \u05d0\u05d7\u05e8, \u05d0\u05d5 \u05ea\u05d7\u05ea \u05e9\u05dd \u05e9\u05d5\u05e0\u05d4 \u05de\u05e2\u05d8. \u05d0\u05dc \u05ea\u05d0\u05de\u05e8 \"\u05d0\u05d9\u05df \u05de\u05d9\u05d3\u05e2\" \u05d0\u05dc\u05d0 \u05d0\u05dd \u05d1\u05d9\u05e6\u05e2\u05ea \u05d7\u05d9\u05e4\u05d5\u05e9 \u05de\u05e7\u05d9\u05e3 \u05d5\u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0 \u05de\u05e6\u05d0\u05ea.",
    "",
    "\u05de\u05d1\u05e0\u05d4 \u05d4\u05db\u05e8\u05d8\u05d9\u05e1:",
    "- **\u05db\u05d5\u05ea\u05e8\u05ea \u05d4\u05db\u05e8\u05d8\u05d9\u05e1** = \u05d4\u05de\u05d5\u05e9\u05d2 \u05d0\u05d5 \u05d4\u05e9\u05d0\u05dc\u05d4 \u05e9\u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8 \u05de\u05e0\u05e1\u05d4 \u05dc\u05dc\u05de\u05d5\u05d3",
    "- **\u05ea\u05d5\u05db\u05df \u05d4\u05db\u05e8\u05d8\u05d9\u05e1** = \u05d4\u05d4\u05d2\u05d3\u05e8\u05d4 \u05d4\u05de\u05dc\u05d0\u05d4 \u05e9\u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8 \u05db\u05ea\u05d1 \u05dc\u05de\u05d5\u05e9\u05d2, \u05d0\u05d5 \u05d4\u05ea\u05e9\u05d5\u05d1\u05d4 \u05d4\u05de\u05dc\u05d0\u05d4 \u05dc\u05e9\u05d0\u05dc\u05d4",
    "",
    "\u05de\u05e9\u05d9\u05de\u05ea\u05da:",
    "\u05d7\u05e4\u05e9 \u05d1\u05d7\u05d5\u05de\u05e8\u05d9 \u05d4\u05d4\u05e8\u05e6\u05d0\u05d4 \u05d4\u05de\u05e7\u05d5\u05e8\u05d9\u05d9\u05dd \u05d4\u05de\u05e6\u05d5\u05e8\u05e4\u05d9\u05dd \u05d0\u05ea \u05d4\u05d4\u05e1\u05d1\u05e8 \u05d4\u05de\u05dc\u05d0 \u05e9\u05dc \u05d0\u05d5\u05ea\u05d5 \u05de\u05d5\u05e9\u05d2 / \u05ea\u05e9\u05d5\u05d1\u05d4 \u05dc\u05d0\u05d5\u05ea\u05d4 \u05e9\u05d0\u05dc\u05d4, \u05d5\u05d4\u05e9\u05d5\u05d5\u05d4 \u05d0\u05d5\u05ea\u05d5 \u05dc\u05ea\u05d5\u05db\u05df \u05e9\u05db\u05ea\u05d1 \u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8.",
    "\u05d7\u05e9\u05d5\u05d1 \u05de\u05d0\u05d5\u05d3: \u05d0\u05dd \u05d4\u05de\u05d5\u05e9\u05d2 \u05de\u05d5\u05e4\u05d9\u05e2 \u05d1\u05d7\u05d5\u05de\u05e8 \u2014 \u05e6\u05d9\u05d9\u05df \u05d6\u05d0\u05ea \u05de\u05e4\u05d5\u05e8\u05e9\u05d5\u05ea \u05e2\u05dd \u05e6\u05d9\u05d8\u05d5\u05d8 \u05d9\u05e9\u05d9\u05e8 \u05de\u05d4\u05de\u05e7\u05d5\u05e8.",
    "",
    "\u05e1\u05e4\u05e7 \u05de\u05e9\u05d5\u05d1 \u05de\u05e4\u05d5\u05e8\u05d8 \u05d4\u05db\u05d5\u05dc\u05dc:",
    "1. \u2705 \u05e0\u05e7\u05d5\u05d3\u05d5\u05ea \u05d7\u05d5\u05d6\u05e7 \u2014 \u05de\u05d4 \u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8 \u05d4\u05d1\u05d9\u05df \u05d5\u05d4\u05e1\u05d1\u05d9\u05e8 \u05e0\u05db\u05d5\u05df",
    "2. \u26a0\ufe0f \u05e4\u05e8\u05d8\u05d9\u05dd \u05d7\u05e1\u05e8\u05d9\u05dd \u2014 \u05d4\u05d9\u05d1\u05d8\u05d9\u05dd, \u05ea\u05e0\u05d0\u05d9\u05dd, \u05d3\u05d5\u05d2\u05de\u05d0\u05d5\u05ea \u05d0\u05d5 \u05d4\u05e1\u05d1\u05e8\u05d9\u05dd \u05e9\u05de\u05d5\u05e4\u05d9\u05e2\u05d9\u05dd \u05d1\u05d4\u05e8\u05e6\u05d0\u05d4 \u05d0\u05da \u05d7\u05e1\u05e8\u05d9\u05dd \u05de\u05d4\u05db\u05e8\u05d8\u05d9\u05e1",
    "3. \u274c \u05d0\u05d9-\u05d3\u05d9\u05d5\u05e7\u05d9\u05dd \u2014 \u05d8\u05e2\u05e0\u05d5\u05ea \u05e9\u05d2\u05d5\u05d9\u05d5\u05ea, \u05e0\u05d9\u05e1\u05d5\u05d7\u05d9\u05dd \u05de\u05d8\u05e2\u05d9\u05dd \u05d0\u05d5 \u05d4\u05db\u05dc\u05dc\u05d5\u05ea \u05dc\u05d0 \u05e0\u05db\u05d5\u05e0\u05d5\u05ea",
    "4. \ud83d\udca1 \u05e0\u05d9\u05e1\u05d5\u05d7 \u05de\u05e9\u05d5\u05e4\u05e8 \u2014 \u05d4\u05e6\u05e2 \u05db\u05d9\u05e6\u05d3 \u05dc\u05e0\u05e1\u05d7 \u05de\u05d7\u05d3\u05e9 \u05d0\u05ea \u05ea\u05d5\u05db\u05df \u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05db\u05da \u05e9\u05d9\u05e9\u05e7\u05e3 \u05e0\u05d0\u05de\u05e0\u05d4 \u05d0\u05ea \u05d4\u05d2\u05d3\u05e8\u05ea/\u05d4\u05e1\u05d1\u05e8 \u05d4\u05de\u05e7\u05d5\u05e8",
    "",
    "\u05d4\u05e6\u05d2 \u05d0\u05ea \u05d4\u05de\u05e9\u05d5\u05d1 \u05d1\u05e4\u05d5\u05e8\u05de\u05d8 \u05de\u05d5\u05d1\u05e0\u05d4 \u05d5\u05d1\u05e8\u05d5\u05e8 \u05d1\u05e2\u05d1\u05e8\u05d9\u05ea.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const userMessage = cardTitle
    ? `\u05de\u05d5\u05e9\u05d2 / \u05e9\u05d0\u05dc\u05d4 (\u05db\u05d5\u05ea\u05e8\u05ea \u05d4\u05db\u05e8\u05d8\u05d9\u05e1):\n${cardTitle}\n\n\u05d4\u05d2\u05d3\u05e8\u05d4 / \u05ea\u05e9\u05d5\u05d1\u05d4 (\u05ea\u05d5\u05db\u05df \u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05e9\u05db\u05ea\u05d1 \u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8):\n${cardBody}`
    : `\u05ea\u05d5\u05db\u05df \u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05e9\u05dc \u05d4\u05e1\u05d8\u05d5\u05d3\u05e0\u05d8:\n${cardContent}`;

  // ── 4. Call OpenAI with file_search ──────────────────────────────────────
  // Filter by student_id (a custom metadata attribute set on every uploaded file).
  // This correctly scopes the search to this student's files only.
  // NOTE: We do NOT filter by file_id because "file_id" is NOT a stored metadata attribute —
  // using it caused the vector search to silently return zero results, making the AI
  // fall back to its internal knowledge and claim "no information found in the source".
  let feedback: string;

  if (vectorStoreFileIds.length > 0) {
    const response = await client.responses.create({
      model: "gpt-4o",
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          filters: {
            type: "eq" as const,
            key: "student_id",
            value: student.id,
          },
        },
      ],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    feedback = response.output_text || "\u05dc\u05d0 \u05d4\u05ea\u05e7\u05d1\u05dc \u05de\u05e9\u05d5\u05d1";
  } else {
    // No matching sources found — generic feedback without RAG
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    });
    feedback = response.choices[0]?.message?.content || "\u05dc\u05d0 \u05d4\u05ea\u05e7\u05d1\u05dc \u05de\u05e9\u05d5\u05d1";
  }

  return Response.json({
    ok: true,
    feedback,
    sourcesUsed: matchingSources.map((s) => ({
      topic: s.topic,
      lectureNumber: s.lecture_number,
    })),
  });
}
