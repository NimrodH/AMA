import type { Route } from "./+types/api.track-learn-session";
import { getStudent } from "~/services/settings.service";
import { createServerClient } from "~/lib/supabase";

/**
 * POST /api/track-learn-session
 * Body: { courseId: string }
 *
 * Increments learn_sessions counter for the given course.
 * Uses a direct upsert+update pattern (no DB function needed).
 */
export async function action({ request }: Route.ActionArgs) {
  const { courseId } = (await request.json()) as { courseId?: string };

  if (!courseId) {
    return Response.json({ ok: false, error: "courseId is required" }, { status: 400 });
  }

  const student = await getStudent();
  if (!student) {
    return Response.json({ ok: false, error: "Student not found" }, { status: 401 });
  }

  try {
    const db = createServerClient();

    // Ensure the row exists
    await db.from("course_stats").upsert(
      {
        student_id: student.id,
        course_id: courseId,
        learn_sessions: 0,
        past_exam_attempts: 0,
        ai_exam_attempts: 0,
      },
      { onConflict: "student_id,course_id", ignoreDuplicates: true }
    );

    // Read current value and increment
    const { data: row } = await db
      .from("course_stats")
      .select("learn_sessions")
      .eq("student_id", student.id)
      .eq("course_id", courseId)
      .single();

    const current = (row as { learn_sessions: number } | null)?.learn_sessions ?? 0;

    await db
      .from("course_stats")
      .update({ learn_sessions: current + 1 })
      .eq("student_id", student.id)
      .eq("course_id", courseId);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[track-learn-session] error:", err);
    return Response.json({ ok: false, error: "Failed to track session" }, { status: 500 });
  }
}
