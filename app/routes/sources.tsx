import * as React from "react";
import { Upload, Loader2, Link, Camera, Check } from "lucide-react";
import { CameraCapture } from "~/components/camera-capture/camera-capture";
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
import { getStudentById } from "~/services/settings.service";
import { getSession } from "~/lib/auth.server";
import { readSelectedCourse, writeSelectedCourse } from "~/hooks/use-selected-course";
import { makeClientLoader, makeClientAction } from "~/lib/client-auth-loader";
import {
  getSources,
  getCoursesForStudent,
  addSource,
  addSourceFromUrl,
  deleteSource,
} from "~/services/sources.service";
import type { SourceRow } from "~/services/sources.service";
import styles from "./sources.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "מקורות לימוד - מערכת ניהול לימודים" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const EMPTY_SOURCES_DATA = { sources: [] as SourceRow[], courses: [] as { id: string; course_id: string; course_name: string }[], studentId: "", accountType: "student" as const };

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const session = await getSession(request);
    if (!session) return EMPTY_SOURCES_DATA;
    const student = await getStudentById(session.studentId, request);
    if (!student) return { ...EMPTY_SOURCES_DATA, accountType: session.accountType as "student" | "guest" };

    const [sources, courses] = await Promise.all([getSources(student.id, request), getCoursesForStudent(student.id, request)]);

    return { sources, courses, studentId: student.id, accountType: session.accountType as "student" | "guest" };
  } catch (err) {
    console.error("[sources] loader error:", err);
    return EMPTY_SOURCES_DATA;
  }
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

export const clientAction = makeClientAction<typeof action>();

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent") as string;

  // ── Delete action ────────────────────────────────────────────────────────
  if (intent === "delete") {
    const sourceId = form.get("sourceId") as string;
    const studentId = form.get("studentId") as string;
    if (!sourceId || !studentId) return { ok: false, error: "חסרים פרמטרים" };
    return deleteSource(sourceId, studentId, request);
  }

  // ── Upload action (default) ───────────────────────────────────────────────
  const studentId = form.get("studentId") as string;
  const courseId = form.get("courseId") as string;
  const courseName = form.get("courseName") as string;
  const sourceType = form.get("sourceType") as "Lecture" | "Past exam" | "Article";
  const topic = form.get("topic") as string;
  const lectureNumberRaw = form.get("lectureNumber") as string;
  const lectureNumber = lectureNumberRaw ? parseInt(lectureNumberRaw, 10) : null;

  // ── URL branch (Google Docs) ──────────────────────────────────────────────
  const googleDocsUrl = form.get("googleDocsUrl") as string | null;
  if (googleDocsUrl) {
    if (!studentId || !courseId || !sourceType || !topic) {
      return { ok: false, error: "יש למלא את כל השדות" };
    }
    return addSourceFromUrl({
      studentId,
      courseId,
      courseName,
      sourceType,
      topic,
      lectureNumber,
      googleDocsUrl,
      request,
    });
  }

  // ── File branch ───────────────────────────────────────────────────────────
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
    request,
  });

  return result;
}

// ─── Source type options ──────────────────────────────────────────────────────

const SOURCE_TYPES: { value: SourceRow["source_type"]; label: string }[] = [
  { value: "Lecture", label: "הרצאה" },
  { value: "Article", label: "מאמר" },
  { value: "Past exam", label: "מבחן עבר" },
];

type FilterType = "all" | SourceRow["source_type"];

// ─── Upload dialog ────────────────────────────────────────────────────────────

interface UploadDialogProps {
  studentId: string;
  courses: { id: string; course_id: string; course_name: string }[];
  onClose: () => void;
}

type UploadTab = "file" | "url" | "camera";

function UploadDialog({ studentId, courses, onClose }: UploadDialogProps) {
  const fetcher = useFetcher();
  const [activeTab, setActiveTab] = React.useState<UploadTab>("file");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [googleDocsUrl, setGoogleDocsUrl] = React.useState("");
  const [cameraFile, setCameraFile] = React.useState<File | null>(null);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>("");
  const [selectedSourceType, setSelectedSourceType] = React.useState<string>("");
  const isSubmitting = fetcher.state !== "idle";
  const actionError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  const selectedCourseName = React.useMemo(() => {
    const course = courses.find((c) => c.course_id === selectedCourseId);
    return course?.course_name ?? "";
  }, [courses, selectedCourseId]);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onClose();
      setSelectedFile(null);
      setGoogleDocsUrl("");
      setCameraFile(null);
      setSelectedCourseId("");
      setSelectedSourceType("");
      setActiveTab("file");
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("courseName", selectedCourseName);

    if (activeTab === "file") {
      if (selectedFile) formData.set("file", selectedFile);
      fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    } else if (activeTab === "camera") {
      if (cameraFile) formData.set("file", cameraFile);
      fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    } else {
      // URL tab: send googleDocsUrl, no file attachment needed
      fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    }
  };

  const isUrlValid = googleDocsUrl.includes("docs.google.com/document/d/");
  const canSubmit =
    activeTab === "file" ? !!selectedFile : activeTab === "camera" ? !!cameraFile : isUrlValid;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="studentId" value={studentId} />

      {/* ── Upload mode tab switcher ── */}
      <div className={styles.uploadTabs}>
        <button
          type="button"
          className={`${styles.uploadTab} ${activeTab === "file" ? styles.uploadTabActive : ""}`}
          onClick={() => setActiveTab("file")}
        >
          <Upload style={{ width: 15, height: 15 }} />
          העלאת קובץ
        </button>
        <button
          type="button"
          className={`${styles.uploadTab} ${activeTab === "url" ? styles.uploadTabActive : ""}`}
          onClick={() => setActiveTab("url")}
        >
          <Link style={{ width: 15, height: 15 }} />
          Google Docs
        </button>
        <button
          type="button"
          className={`${styles.uploadTab} ${activeTab === "camera" ? styles.uploadTabActive : ""}`}
          onClick={() => { setActiveTab("camera"); setCameraFile(null); }}
        >
          <Camera style={{ width: 15, height: 15 }} />
          צילום
        </button>
      </div>

      {/* ── Shared metadata fields ── */}
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
          <Input id="lectureNumber" name="lectureNumber" type="number" min="1" placeholder="5" />
        </div>
      </div>

      {/* ── File tab content ── */}
      {activeTab === "file" && (
        <div>
          <Label>קובץ</Label>
          <label className={`${styles.fileInput} ${selectedFile ? styles.fileInputActive : ""}`}>
            <Upload className={styles.fileInputIcon} />
            <p className={styles.fileInputText}>{selectedFile ? selectedFile.name : "לחץ להעלאת קובץ או גרור לכאן"}</p>
            <p className={styles.fileInputText} style={{ fontSize: "var(--font-size-0)", marginTop: "var(--space-2)" }}>
              PDF, DOCX, PPT עד 10MB
            </p>
            <input type="file" accept=".pdf,.docx,.ppt,.pptx" onChange={handleFileChange} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {/* ── Camera tab content ── */}
      {activeTab === "camera" && (
        <div>
          {cameraFile ? (
            <div className={styles.cameraReady}>
              <Check className={styles.cameraReadyIcon} />
              <p className={styles.cameraReadyText}>{cameraFile.name}</p>
              <button type="button" className={styles.cameraReset} onClick={() => setCameraFile(null)}>
                החלף צילום
              </button>
            </div>
          ) : (
            <CameraCapture onCapture={(file) => setCameraFile(file)} />
          )}
        </div>
      )}

      {/* ── URL tab content ── */}
      {activeTab === "url" && (
        <div>
          <Label htmlFor="googleDocsUrl">קישור Google Docs</Label>
          <Input
            id="googleDocsUrl"
            name="googleDocsUrl"
            type="url"
            dir="ltr"
            placeholder="https://docs.google.com/document/d/..."
            value={googleDocsUrl}
            onChange={(e) => setGoogleDocsUrl(e.target.value)}
          />
          <p className={styles.urlHint}>בזמן יבוא המסמך, ודא שהמסמך שיתופי — ״כל מי שיש לו קישור יכול לצפות״</p>
        </div>
      )}

      {actionError && <p className={styles.errorMessage}>{actionError}</p>}

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? (
            <>
              <Loader2 className={styles.spinner} />
              {activeTab === "url" ? "מוריד ומעלה..." : "מעלה..."}
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

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { sources, courses, studentId, accountType } = loaderData as LoaderData;
  const isGuest = accountType === "guest";
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
    <AppLayout title="מקורות לימוד" accountType={accountType}>
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

          {!isGuest && (
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
                <UploadDialog studentId={studentId} courses={courses} onClose={() => setIsDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className={styles.grid}>
          {filteredSources.map((source) => (
            <SourceCard key={source.id} source={source} studentId={studentId} isGuest={isGuest} />
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
