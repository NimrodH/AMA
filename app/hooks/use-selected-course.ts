const STORAGE_KEY = "selectedCourseId";

/** Read the persisted course ID from localStorage. Returns "" if none. */
export function readSelectedCourse(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

/** Persist the selected course ID to localStorage. */
export function writeSelectedCourse(courseId: string): void {
  if (typeof window === "undefined") return;
  if (courseId) {
    localStorage.setItem(STORAGE_KEY, courseId);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
