import type { Route } from "./+types/api.card-feedback";
import { getOpenAIClient } from "~/lib/openai.server";
import { createServerClient } from "~/lib/supabase";
import { getSession } from "~/lib/auth.server";
import { extractTextFromUrl } from "~/lib/file-extract.server";

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

  const session = await getSession(request);
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const student = { id: session.studentId };

  // ── 1. Find matching lecture sources ──────────────────────────────────────
  // Strategy:
  // - Always include sources with lecture_number = NULL (course-wide materials)
  // - If the card has a lecture_number, also include sources matching that number
  // - Never exclude course-wide sources just because the card has a lecture number
  const db = createServerClient(request);
  const lectureNum = lectureNumber ? parseInt(lectureNumber, 10) : null;

  // Fetch ALL lecture sources for this course that have an uploaded file
  const { data: allCourseSources } = await db
    .from("sources")
    .select("id, topic, lecture_number, file_url")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .eq("source_type", "Lecture")
    .not("file_url", "is", null);

  const courseSources = allCourseSources ?? [];

  // Filter: course-wide (null) sources are always included.
  // If the card has a lecture_number, also include sources with that exact lecture_number.
  // If the card has no lecture_number, include ALL sources for the course.
  const matchingSources = courseSources.filter((s) => {
    if (s.lecture_number === null) return true; // course-wide: always relevant
    if (lectureNum === null) return true;        // card has no lecture scope: include all
    return s.lecture_number === lectureNum;      // match exact lecture number
  });

  // ── 2. Build context hints and extract actual document text ────────────────
  const sourceList =
    matchingSources.length > 0
      ? matchingSources
          .map((s) => `\u2022 ${s.topic}${s.lecture_number ? ` (\u05d4\u05e8\u05e6\u05d0\u05d4 ${s.lecture_number})` : " (\u05db\u05dc\u05dc \u05d4\u05e7\u05d5\u05e8\u05e1)"}`)
          .join("\n")
      : null;

  // Download and extract the full text from each matching source file.
  // This replaces the previous file_search vector approach, which often failed
  // to retrieve the relevant section for Hebrew academic content.
  const sourceTexts: string[] = [];
  for (const s of matchingSources) {
    if (!s.file_url) continue;
    const text = await extractTextFromUrl(s.file_url);
    if (text) {
      const label = s.lecture_number
        ? `${s.topic} (\u05d4\u05e8\u05e6\u05d0\u05d4 ${s.lecture_number})`
        : `${s.topic} (\u05db\u05dc\u05dc \u05d4\u05e7\u05d5\u05e8\u05e1)`;
      sourceTexts.push(`=== ${label} ===\n${text}`);
    }
  }
  const fullSourceContent = sourceTexts.join("\n\n");

  // ── 3. Build prompts ──────────────────────────────────────────────────────
  const client = getOpenAIClient();

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
    "3. ❌ אי-דיוקים — טעויות שגויות, ניסוחים מטעים או הכללות לא נכונות",
    "4. 💡 ניסוח משופר — הצע כיצד לנסח מחדש את תוכן הכרטיס כך שישקף נאמנה את הגדרת/הסבר המקור",
    "",
    "הצג את המשוב בפורמט מובנה וברור בעברית.",
    additionalInstruction
      ? `\nהוראות נוספות מהסטודנט:\n${additionalInstruction}`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  // Build the user message. When we have extracted source text, include it directly
  // in the prompt so the model sees the FULL document — not just vector-search chunks.
  const cardSection = cardTitle
    ? `מושג / שאלה (כותרת הכרטיס):\n${cardTitle}\n\nהגדרה / תשובה (תוכן הכרטיס שכתב הסטודנט):\n${cardBody}`
    : `תוכן הכרטיס של הסטודנט:\n${cardContent}`;

  const userMessage = fullSourceContent
    ? `להלן חומרי הקורס המלאים:\n\n${fullSourceContent}\n\n---\n\nלהלן הכרטיס של הסטודנט לבדיקה:\n${cardSection}`
    : cardSection;

  // ── 4. Call OpenAI with direct text context (no file_search) ────────────
  // Previous approach used file_search (vector store retrieval) which consistently
  // failed to find specific sections in Hebrew academic documents. The model would
  // say "לא מצאתי" even though the content existed in the document.
  //
  // New approach: download the actual source files, extract their text, and pass it
  // directly in the prompt. This guarantees the model sees ALL document content.
  let feedback: string;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
    });
    feedback = response.choices[0]?.message?.content || "לא התקבל משוב";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[card-feedback] OpenAI error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
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
