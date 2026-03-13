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
          .map((s) => `• ${s.topic}${s.lecture_number ? ` (הרצאה ${s.lecture_number})` : " (כלל הקורס)"}`)
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
      ? `הכרטיס שייך להרצאה מספר ${lectureNum}.`
      : "הכרטיס אינו משויך להרצאה ספציפית — השתמש בכל חומרי הקורס הרלוונטיים.";

  const systemPrompt = `אתה מומחה אקדמי המספק משוב על כרטיסי למידה של סטודנטים.
${sourceList ? `מקורות הלמידה הרלוונטיים לכרטיס זה:\n${sourceList}\n` : ""}${cardLectureHint}

מבנה הכרטיס:
- **כותרת הכרטיס** = המושג או השאלה שהסטודנט מנסה ללמוד
- **תוכן הכרטיס** = ההגדרה המלאה שהסטודנט כתב למושג, או התשובה המלאה לשאלה

משימתך:
חפש בחומרי ההרצאה המקוריים המצורפים את ההסבר המלא של אותו מושג / תשובה לאותה שאלה, והשווה אותו לתוכן שכתב הסטודנט.
חשוב מאוד: אם המושג מופיע בחומר — ציין זאת מפורשות עם ציטוט ישיר מהמקור.

ספק משוב מפורט הכולל:
1. ✅ נקודות חוזק — מה הסטודנט הבין והסביר נכון
2. ⚠️ פרטים חסרים — היבטים, תנאים, דוגמאות או הסברים שמופיעים בהרצאה אך חסרים מהכרטיס
3. ❌ אי-דיוקים — טענות שגויות, ניסוחים מטעים או הכללות לא נכונות
4. 💡 ניסוח משופר — הצע כיצד לנסח מחדש את תוכן הכרטיס כך שישקף נאמנה את הגדרת/הסבר המקור

הצג את המשוב בפורמט מובנה וברור בעברית.`;

  // Parse card title vs content (encoded as "title\n---\ncontent" from the client)
  const sep = "\n---\n";
  const sepIdx = cardContent.indexOf(sep);
  const cardTitle = sepIdx !== -1 ? cardContent.slice(0, sepIdx).trim() : "";
  const cardBody = sepIdx !== -1 ? cardContent.slice(sepIdx + sep.length).trim() : cardContent;

  const userMessage = cardTitle
    ? `מושג / שאלה (כותרת הכרטיס):\n${cardTitle}\n\nהגדרה / תשובה (תוכן הכרטיס שכתב הסטודנט):\n${cardBody}`
    : `תוכן הכרטיס של הסטודנט:\n${cardContent}`;

  // ── 4. Call OpenAI with file_search scoped to the matching files ──────────
  let feedback: string;

  if (vectorStoreFileIds.length > 0) {
    // Build a file_id filter so the search is scoped to the exact matched sources.
    // ComparisonFilter supports: eq, ne, gt, lt, gte, lte (no "in" type).
    // For multiple files, use a CompoundFilter with "or" + multiple "eq" filters.
    const fileFilter =
      vectorStoreFileIds.length === 1
        ? { type: "eq" as const, key: "file_id", value: vectorStoreFileIds[0] }
        : {
            type: "or" as const,
            filters: vectorStoreFileIds.map((fid) => ({
              type: "eq" as const,
              key: "file_id",
              value: fid,
            })),
          };

    const response = await client.responses.create({
      model: "gpt-4o",
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          filters: fileFilter,
        },
      ],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    feedback = response.output_text || "לא התקבל משוב";
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
