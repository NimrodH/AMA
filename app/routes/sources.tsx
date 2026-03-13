import * as React from "react";
import { Upload, Loader2 } from "lucide-react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/sources";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog/dialog";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs/tabs";
import { getStudent } from "~/services/settings.service";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { getSources, getCoursesForStudent, addSource, deleteSource } from "~/services/sources.service";
import type { SourceRow } from "~/services/sources.service";
import styles from "./sources.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "מקורות לימוד - מערכת ניהול לימודים" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader() {
  const student = await getStudent();
  if (!student) return { sources: [], courses: [], studentId: "" };

  const [sources, courses] = await Promise.all([
    getSources(student.id),
    getCoursesForStudent(student.id),
  ]);

  return { sources, courses, studentId: student.id };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent") as string;

  // ── Delete action ────────────────────────────────────────────────────────
  if (intent === "delete") {
    const sourceId = form.get("sourceId") as string;
    const studentId = form.get("studentId") as string;
    if (!sourceId || !studentId) return { ok: false, error: "חסרים פרמטרים" };
    return deleteSource(sourceId, studentId);
  }

  // ── Upload action (default) ───────────────────────────────────────────────
  const studentId = form.get("studentId") as string;
  const courseId = form.get("courseId") as string;
  const courseName = form.get("courseName") as string;
  const sourceType = form.get("sourceType") as "Lecture" | "Past exam";
  const topic = form.get("topic") as string;
  const lectureNumberRaw = form.get("lectureNumber") as string;
  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;
  const file = form.get("file") as File | null;

  if (!studentId || !courseId || !sourceType || !topic || !file || file.size === 0) {
    return { ok: false, error: "יש למלא את כל השדות ולהעלות קובץ" };
  }

  const result = await addSource({
    studentId,
    courseId,
    courseName,
    sourceType,
    topic,
    lectureNumber,
    file,
  });

  return result;
}

// ─── Source type options ──────────────────────────────────────────────────────

const SOURCE_TYPES: { value: SourceRow["source_type"]; label: string }[] = [
  { value: "Lecture", label: "הרצאה" },
  { value: "Past exam", label: "מבחן עבר" },
];

type FilterType = "all" | SourceRow["source_type"];

// ─── Upload dialog ────────────────────────────────────────────────────────────

interface UploadDialogProps {
  studentId: string;
  courses: { id: string; course_id: string; course_name: string }[];
  onClose: () => void;
}

function UploadDialog({ studentId, courses, onClose }: UploadDialogProps) {
  const fetcher = useFetcher();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>("");
  const [selectedSourceType, setSelectedSourceType] = React.useState<string>("");
  const isSubmitting = fetcher.state !== "idle";
  const actionError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  // Derive the course name from the selected course_id
  const selectedCourseName = React.useMemo(() => {
    const course = courses.find((c) => c.course_id === selectedCourseId);
    return course?.course_name ?? "";
  }, [courses, selectedCourseId]);

  // Close dialog after successful submission
  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onClose();
      setSelectedFile(null);
      setSelectedCourseId("");
      setSelectedSourceType("");
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Append the actual file to FormData
    if (selectedFile) {
      formData.set("file", selectedFile);
    }

    // Append the resolved course name for metadata
    formData.set("courseName", selectedCourseName);

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="studentId" value={studentId} />

      <div>
        <Label htmlFor="sourceType">סוג המקור</Label>
        <Select name="sourceType" required value={selectedSourceType} onValueChange={setSelectedSourceType}>
          <SelectTrigger id="sourceType">
            <SelectValue placeholder="בחר סוג מקור" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="courseId">קורס</Label>
        <Select name="courseId" required value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger id="courseId">
            <SelectValue placeholder="בחר קורס" />
          </SelectTrigger>
          <SelectContent>
            {courses.length === 0 ? (
              <SelectItem value="_none" disabled>
                אין קורסים — הוסף קורס בהגדרות
              </SelectItem>
            ) : (
              courses.map((course) => (
                <SelectItem key={course.id} value={course.course_id}>
                  {course.course_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.formRow}>
        <div>
          <Label htmlFor="topic">נושא</Label>
          <Input id="topic" name="topic" placeholder="לדוגמה: תרכובות ארומטיות" required />
        </div>
        <div>
          <Label htmlFor="lectureNumber">מספר הרצאה (אופציונלי)</Label>
          <Input
            id="lectureNumber"
            name="lectureNumber"
            type="number"
            min="1"
            placeholder="5"
          />
        </div>
      </div>

      <div>
        <Label>קובץ</Label>
        <label className={styles.fileInput}>
          <Upload className={styles.fileInputIcon} />
          <p className={styles.fileInputText}>
            {selectedFile ? selectedFile.name : "לחץ להעלאת קובץ או גרור לכאן"}
          </p>
          <p
            className={styles.fileInputText}
            style={{ fontSize: "var(--font-size-0)", marginTop: "var(--space-2)" }}
          >
            PDF, DOCX, PPT עד 10MB
          </p>
          <input
            type="file"
            accept=".pdf,.docx,.ppt,.pptx"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {actionError && (
        <p className={styles.errorMessage}>{actionError}</p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting || !selectedFile}>
          {isSubmitting ? (
            <>
              <Loader2 className={styles.spinner} />
              מעלה...
            </>
          ) : (
            "העלה"
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { sources, courses, studentId } = loaderData;
  const [selectedType, setSelectedType] = React.useState<FilterType>("all");
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>(() => {
    const stored = readSelectedCourse();
    if (stored && courses.some((c) => c.course_id === stored)) return stored;
    return "all";
  });
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const filteredSources = React.useMemo(() => {
    return sources.filter((s) => {
      const typeMatch = selectedType === "all" || s.source_type === selectedType;
      const courseMatch = selectedCourseId === "all" || s.course_id === selectedCourseId;
      return typeMatch && courseMatch;
    });
  }, [sources, selectedType, selectedCourseId]);

  return (
    <AppLayout title="מקורות לימוד">
      <div className={styles.sources}>
        <div className={styles.header}>
          <div className={styles.filters}>
            <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as FilterType)}>
              <TabsList>
                <TabsTrigger value="all">הכל</TabsTrigger>
                {SOURCE_TYPES.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Select
              value={selectedCourseId}
              onValueChange={(v) => {
                setSelectedCourseId(v);
                if (v !== "all") writeSelectedCourse(v);
              }}
            >
              <SelectTrigger className={styles.courseFilter}>
                <SelectValue placeholder="כל הקורסים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקורסים</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.course_id}>
                    {course.course_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload style={{ marginLeft: "var(--space-2)" }} />
                העלה מקור חדש
              </Button>
            </DialogTrigger>
            <DialogContent className={styles.uploadDialog}>
              <DialogHeader>
                <DialogTitle>העלאת מקור לימוד חדש</DialogTitle>
              </DialogHeader>
              <UploadDialog
                studentId={studentId}
                courses={courses}
                onClose={() => setIsDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className={styles.grid}>
          {filteredSources.map((source) => (
            <SourceCard key={source.id} source={source} studentId={studentId} />
          ))}
          {filteredSources.length === 0 && (
            <p style={{ color: "var(--color-neutral-10)", gridColumn: "1/-1" }}>
              אין מקורות להצגה. העלה מקור חדש כדי להתחיל.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
