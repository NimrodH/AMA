/**
 * Reminder scheduling utilities.
 *
 * reminder_time is stored as a structured string in the format:
 *   "DAY_CODE|HH:MM"
 *
 * DAY_CODE options:
 *   "daily"         — every day
 *   "weekdays"       — Sunday through Thursday (ימים א-ה)
 *   "sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat" — specific weekday
 *
 * Example values:
 *   "daily|08:00"
 *   "mon|19:00"
 *   "fri|17:30"
 */

export const DAY_OPTIONS = [
  { value: "daily",    label: "כל יום" },
  { value: "weekdays", label: "ימים א-ה" },
  { value: "sun",      label: "כל ראשון" },
  { value: "mon",   label: "כל שני" },
  { value: "tue",   label: "כל שלישי" },
  { value: "wed",   label: "כל רביעי" },
  { value: "thu",   label: "כל חמישי" },
  { value: "fri",   label: "כל שישי" },
  { value: "sat",   label: "כל שבת" },
] as const;

export type DayCode = (typeof DAY_OPTIONS)[number]["value"];

const DAY_CODE_TO_JS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Returns a human-readable label for a structured reminder_time string.
 * Handles both new structured format ("daily|08:00") and legacy free-text.
 */
export function formatReminderTime(reminderTime: string): string {
  const parts = reminderTime.split("|");
  if (parts.length !== 2) return reminderTime; // legacy free-text — render as-is

  const [dayCode, time] = parts;
  const dayLabel = DAY_OPTIONS.find((d) => d.value === dayCode)?.label ?? dayCode;
  return `${dayLabel} בשעה ${time}`;
}

/**
 * Determines whether a reminder is due today (client-side check).
 * Returns true when:
 *  - dayCode is "daily", OR
 *  - dayCode matches today's day of week
 *
 * Legacy free-text strings are treated as always due (show them).
 */
export function isReminderDueToday(reminderTime: string): boolean {
  const parts = reminderTime.split("|");
  if (parts.length !== 2) {
    // Legacy value — parse heuristically or show always
    return isLegacyDueToday(reminderTime);
  }

  const [dayCode] = parts;
  if (dayCode === "daily") return true;

  const todayJs = new Date().getDay(); // 0=Sun … 6=Sat
  // ימים א-ה = Sunday(0) through Thursday(4)
  if (dayCode === "weekdays") return todayJs >= 0 && todayJs <= 4;

  return DAY_CODE_TO_JS[dayCode] === todayJs;
}

// ─── Reminder pending/completion model ───────────────────────────────────────
//
// "reminders_pending" is a permanent localStorage set of reminder IDs that
// have fired (been shown) at least once but not yet been completed ("בוצע").
//
//  • When a reminder is due today → add its ID to pending → show banner.
//  • When user clicks "בוצע" → remove from pending → hide banner.
//  • If the user never clicks "בוצע", the ID stays in pending and the banner
//    continues to appear on all subsequent visits until explicitly completed.
//  • For recurring reminders: they re-enter pending each time they fire on a
//    new due day (added again if they had been previously completed).

const PENDING_KEY = "reminders_pending";

/**
 * Loads the set of currently pending (shown but not completed) reminder IDs
 * from localStorage.
 */
export function loadPendingReminders(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Saves the full set of pending reminder IDs to localStorage.
 */
function savePendingReminders(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage quota exceeded — fail silently
  }
}

/**
 * Adds the given reminder IDs to the pending set (they have fired today).
 * Returns the updated set.
 */
export function addPendingReminders(ids: string[], pending: Set<string>): Set<string> {
  const next = new Set(pending);
  for (const id of ids) next.add(id);
  savePendingReminders(next);
  return next;
}

/**
 * Marks a reminder as completed — removes it from the pending set.
 * Returns the updated set.
 */
export function completeReminder(id: string, pending: Set<string>): Set<string> {
  const next = new Set(pending);
  next.delete(id);
  savePendingReminders(next);
  return next;
}

/** Heuristic parser for old free-text reminder_time values. */
function isLegacyDueToday(reminderTime: string): boolean {
  const today = new Date().getDay();
  if (reminderTime.includes("כל יום")) return true;
  if (reminderTime.includes("כל ראשון") && today === 0) return true;
  if (reminderTime.includes("כל שני") && today === 1) return true;
  if (reminderTime.includes("כל שלישי") && today === 2) return true;
  if (reminderTime.includes("כל רביעי") && today === 3) return true;
  if (reminderTime.includes("כל חמישי") && today === 4) return true;
  if (reminderTime.includes("כל שישי") && today === 5) return true;
  if (reminderTime.includes("כל שבת") && today === 6) return true;
  // Unknown format — show it so the user knows it exists
  return true;
}
