import * as React from "react";
import { Upload } from "lucide-react";
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
import { getSources, getCoursesForStudent, addSource } from "~/services/sources.service";
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
  const studentId = form.get("studentId") as string;
  const courseId = form.get("courseId") as string;
  const sourceType = form.get("sourceType") as "Lecture" | "Card" | "Past exam";
  const topic = form.get("topic") as string;
  const lectureNumberRaw = form.get("lectureNumber") as string;
  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;

  if (studentId && courseId && sourceType && topic) {
    await addSource(studentId, courseId, sourceType, topic, lectureNumber);
  }

  return { ok: true };
}

// ─── Source type options ──────────────────────────────────────────────────────

const SOURCE_TYPES: { value: SourceRow["source_type"]; label: string }[] = [
  { value: "Lecture", label: "הרצאה" },
  { value: "Card", label: "כרטיס סיכום" },
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
  const isSubmitting = fetcher.state !== "idle";

  // Close dialog after successful submission
  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onClose();
      setSelectedFile(null);
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  return (
    <fetcher.Form method="post" className={styles.form}>
      <input type="hidden" name="studentId" value={studentId} />

      <div>
        <Label htmlFor="sourceType">סוג המקור</Label>
        <Select name="sourceType" required>
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
        <Select name="courseId" required>
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
          <Input id="lectureNumber" name="lectureNumber" type="number" placeholder="5" />
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

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "מעלה..." : "העלה"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { sources, courses, studentId } = loaderData;
  const [selectedType, setSelectedType] = React.useState<FilterType>("all");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const filteredSources =
    selectedType === "all" ? sources : sources.filter((s) => s.source_type === selectedType);

  return (
    <AppLayout title="מקורות לימוד">
      <div className={styles.sources}>
        <div className={styles.header}>
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
            <SourceCard key={source.id} source={source} />
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
