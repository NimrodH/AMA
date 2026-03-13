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
  const db = createServerClient();
  let sourcesQuery = db
    .from("sources")
    .select("id, topic, lecture_number, vector_store_file_id")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .eq("source_type", "Lecture")
    .not("vector_store_file_id", "is", null);

  // If the card has a lecture number, prefer sources that match it;
  // otherwise fall back to ALL lectures for the course.
  const lectureNum = lectureNumber ? parseInt(lectureNumber, 10) : null;
  if (lectureNum !== null && !isNaN(lectureNum)) {
    sourcesQuery = sourcesQuery.eq("lecture_number", lectureNum);
  }

  const { data: sources } = await sourcesQuery;

  const matchingSources = sources ?? [];

  // ── 2. Build context string from source metadata ──────────────────────────
  // We'll use OpenAI's file_search tool so the vector store handles retrieval.
  // The source list gives us a "hint" to show the user which sources were used.
  const sourceList =
    matchingSources.length > 0
      ? matchingSources
          .map((s) => `• ${s.topic}${s.lecture_number ? ` (הרצאה ${s.lecture_number})` : ""}`)
          .join("\n")
      : null;

  const vectorStoreFileIds = matchingSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Call OpenAI — with file_search if we have matching sources ─────────
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  let feedback: string;

  const cardLectureHint =
    lectureNum !== null
      ? `הכרטיס שייך להרצאה מספר ${lectureNum}.`
      : "הכרטיס אינו משויך להרצאה ספציפית — השתמש בכל חומרי הקורס הרלוונטיים.";

  const systemPrompt = `אתה מומחה אקדמי המספק משוב על כרטיסי סיכום של סטודנטים.
${sourceList ? `חפש את המידע הרלוונטי בחומרי הלימוד הבאים:\n${sourceList}` : ""}
${cardLectureHint}

השווה את כרטיס הסיכום של הסטודנט לחומרי ההרצאה המקוריים.
ספק משוב מפורט הכולל:
1. ✅ נקודות חוזק בסיכום
2. ⚠️ מושגים חסרים שהיו בהרצאה אך לא בכרטיס
3. ❌ טענות שגויות או לא מדויקות
4. 💡 המלצות לשיפור

הצג את המשוב בפורמט מובנה וברור בעברית.`;

  const userMessage = `כרטיס סיכום של הסטודנט:\n${cardContent}`;

  if (vectorStoreFileIds.length > 0) {
    // Use the Responses API with file_search tool scoped to this vector store
    const response = await client.responses.create({
      model: "gpt-4o",
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          // Filter to only the matched files using a filter on file_id
        },
      ],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    feedback = response.output_text || "לא התקבל משוב";
  } else {
    // No matching sources found — fall back to generic feedback without RAG
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    });
    feedback = response.choices[0]?.message?.content || "לא התקבל משוב";
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
