/**
 * Server-only action logic for the settings route.
 * Kept in a separate .server.ts file to prevent guests.service (which imports
 * auth.server) from leaking into the client bundle.
 */
import {
  updateStudentName,
  addCourse,
  toggleCourse,
  deleteCourse,
  addReminder,
  toggleReminder,
  deleteReminder,
  addArticleQuestion,
  deleteArticleQuestion,
} from "~/services/settings.service";
import { listGuests, createGuest, deleteGuest } from "~/services/guests.service.server";
import { requireSession } from "~/lib/auth.server";

export async function handleSettingsAction(request: Request) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const studentId = session.studentId;

  switch (intent) {
    case "update_name": {
      if (session.accountType !== "student") break;
      const name = formData.get("name") as string;
      if (name?.trim()) await updateStudentName(studentId, name.trim(), request);
      break;
    }
    case "add_course": {
      if (session.accountType !== "student") break;
      const courseId = formData.get("course_id") as string;
      const courseName = formData.get("course_name") as string;
      if (courseId?.trim() && courseName?.trim()) {
        await addCourse(studentId, courseId.trim(), courseName.trim(), request);
      }
      break;
    }
    case "toggle_course": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleCourse(id, isActive, request);
      break;
    }
    case "delete_course": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const courseId = formData.get("course_id") as string;
      if (id && studentId && courseId) await deleteCourse(id, studentId, courseId, request);
      break;
    }
    case "add_reminder": {
      if (session.accountType !== "student") break;
      const reminderType = formData.get("reminder_type") as string;
      const reminderTime = formData.get("reminder_time") as string;
      if (reminderType?.trim() && reminderTime?.trim()) {
        await addReminder(studentId, reminderType.trim(), reminderTime.trim(), request);
      }
      break;
    }
    case "toggle_reminder": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      const isActive = formData.get("is_active") === "true";
      if (id) await toggleReminder(id, isActive, request);
      break;
    }
    case "delete_reminder": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      if (id) await deleteReminder(id, request);
      break;
    }
    case "add_article_question": {
      if (session.accountType !== "student") break;
      const question = formData.get("question") as string;
      const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
      if (question?.trim()) await addArticleQuestion(studentId, question.trim(), sortOrder, request);
      break;
    }
    case "delete_article_question": {
      if (session.accountType !== "student") break;
      const id = formData.get("id") as string;
      if (id) await deleteArticleQuestion(id, request);
      break;
    }
    case "add_guest": {
      if (session.accountType !== "student") break;
      const guestName = (formData.get("guest_name") as string)?.trim();
      const guestEmail = (formData.get("guest_email") as string)?.trim();
      const guestPassword = (formData.get("guest_password") as string)?.trim();
      if (guestName && guestEmail && guestPassword) {
        try {
          await createGuest(guestName, guestEmail, guestPassword, studentId, request);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
      break;
    }
    case "delete_guest": {
      if (session.accountType !== "student") break;
      const guestId = formData.get("guest_id") as string;
      if (guestId) {
        try {
          await deleteGuest(guestId, studentId, request);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
      break;
    }
  }

  return { ok: true };
}
