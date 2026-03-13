import type { Route } from "./+types/api.card-feedback";
import { getOpenAIClient, getOrCreateVectorStore } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getStudent } from "~/services/settings.service";

export async function action({ request }: Route.ActionArgs) {
  const { courseId, lectureNumber, cardContent, additionalInstruction } = (await request.json()) as {
    courseId: string;
    lectureNumber: string | null;
    cardContent: string;
    additionalInstruction?: string | null;
  };

  if (!courseId || !cardContent) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  // ── 1. Find matching sources ──────────────────────────────────────────────
  // Strategy:
  // - Always include sources with lecture_number = NULL (course-wide materials)
  // - If the card has a lecture_number, also include sources matching that number
  // - Include ALL source types (Lecture, Card, Past exam) for maximum coverage
  const db = createServerClient();
  const lectureNum = lectureNumber ? parseInt(lectureNumber, 10) : null;

  // Fetch ALL sources for this course with a vector store file
  const { data: allCourseSources } = await db
    .from("sources")
    .select("id, topic, lecture_number, vector_store_file_id, source_type")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
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

  // Collect the underlying OpenAI file IDs stored in vector_store_file_id column
  const vectorFileIds = matchingSources
    .map((s) => s.vector_store_file_id)
    .filter(Boolean) as string[];

  // ── 3. Build prompts ──────────────────────────────────────────────────────
  const client = getOpenAIClient();
  const vectorStoreId = await getOrCreateVectorStore();

  const cardLectureHint =
    lectureNum !== null
      ? `הכרטיס שייך להרצאה מספר ${lectureNum}.`
      : "הכרטיס אינו משויך להרצאה ספציפית — השתמש בכל חומרי הקורס הרלוונטיים.";

  // Parse card title vs content (encoded as "title\n---\ncontent" from the client)
  const sep = "\n---\n";
  const sepIdx = cardContent.indexOf(sep);
  const cardTitle = sepIdx !== -1 ? cardContent.slice(0, sepIdx).trim() : "";
  const cardBody = sepIdx !== -1 ? cardContent.slice(sepIdx + sep.length).trim() : cardContent;

  const systemPrompt = [
    "אתה מומחה אקדמי המספק משוב על כרטיסי למידה של סטודנטים.",
    sourceList
      ? `מקורות הלמידה הרלוונטיים לכרטיס זה:\n${sourceList}`
      : "",
    cardLectureHint,
    "",
    "חשוב מאוד: בצע חיפוש רחב בכל המסמכים שצורפו — כולל סיכומים כלליים וקבצים עם lecture_number=null. המושג עשוי להופיע בעמוד אחר, פרק אחר, או תחת שם שונה מעט. אל תאמר \"אין מידע\" אלא אם ביצעת חיפוש מקיף ועדיין לא מצאת.",
    "",
    "מבנה הכרטיס:",
    "- **כותרת הכרטיס** = המושג או השאלה שהסטודנט מנסה ללמוד",
    "- **תוכן הכרטיס** = ההגדרה המלאה שהסטודנט כתב למושג, או התשובה המלאה לשאלה",
    "",
    "משימתך:",
    "חפש בחומרי ההרצאה המקוריים המצורפים את ההסבר המלא של אותו מושג / תשובה לאותה שאלה, והשווה אותו לתוכן שכתב הסטודנט.",
    "חשוב מאוד: אם המושג מופיע בחומר — ציין זאת מפורשות עם ציטוט ישיר מהמקור.",
    "",
    "ספק משוב מפורט הכולל:",
    "1. ✅ נקודות חוזק — מה הסטודנט הבין והסביר נכון",
    "2. ⚠️ פרטים חסרים — היבטים, תנאים, דוגמאות או הסברים שמופיעים בהרצאה אך חסרים מהכרטיס",
    "3. ❌ אי-דיוקים — טענות שגויות, ניסוחים מטעים או הכללות לא נכונות",
    "4. 💡 ניסוח משופר — הצע כיצד לנסח מחדש את תוכן הכרטיס כך שישקף נאמנה את הגדרת/הסבר המקור",
    "",
    "הצג את המשוב בפורמט מובנה וברור בעברית.",
    additionalInstruction
      ? `\nהוראות נוספות מהסטודנט:\n${additionalInstruction}`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const userMessage = cardTitle
    ? `מושג / שאלה (כותרת הכרטיס):\n${cardTitle}\n\nהגדרה / תשובה (תוכן הכרטיס שכתב הסטודנט):\n${cardBody}`
    : `תוכן הכרטיס של הסטודנט:\n${cardContent}`;

  // ── 4. Call OpenAI with file_search ──────────────────────────────────────
  // Build a precise filter targeting ONLY the specific source files for this course/lecture.
  // We use the file_id attribute (stored as vector_store_file_id in the DB) which IS a
  // searchable attribute on vector store files. This avoids cross-course contamination.
  let feedback: string;

  if (vectorFileIds.length > 0) {
    // Build compound OR filter when there are multiple files, or a single eq filter.
    // OpenAI file_search filters: { type: "eq", key: "file_id", value: "..." }
    // For multiple files: { type: "or", filters: [...] }
    const fileFilter =
      vectorFileIds.length === 1
        ? { type: "eq" as const, key: "file_id", value: vectorFileIds[0] }
        : {
            type: "or" as const,
            filters: vectorFileIds.map((fileId) => ({
              type: "eq" as const,
              key: "file_id",
              value: fileId,
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
