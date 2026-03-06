import * as React from "react";
import { Upload, Filter } from "lucide-react";
import type { Route } from "./+types/sources";
import { AppLayout } from "~/components/layout/app-layout";
import { SourceCard } from "~/components/source-card/source-card";
import { Button } from "~/components/ui/button/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog/dialog";
import { Label } from "~/components/ui/label/label";
import { Input } from "~/components/ui/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs/tabs";
import { mockSources, mockCourses } from "~/data/mock-data";
import styles from "./sources.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "מקורות לימוד - מערכת ניהול לימודים" }];
}

export default function Sources() {
  const [selectedType, setSelectedType] = React.useState<"all" | "Lecture" | "Card" | "Past exam">("all");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const filteredSources =
    selectedType === "all" ? mockSources : mockSources.filter((s) => s.source_type === selectedType);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <AppLayout title="מקורות לימוד">
      <div className={styles.sources}>
        <div className={styles.header}>
          <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as typeof selectedType)}>
            <TabsList>
              <TabsTrigger value="all">הכל</TabsTrigger>
              <TabsTrigger value="Lecture">הרצאות</TabsTrigger>
              <TabsTrigger value="Card">כרטיסים</TabsTrigger>
              <TabsTrigger value="Past exam">מבחני עבר</TabsTrigger>
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

              <form className={styles.form}>
                <div>
                  <Label htmlFor="sourceType">סוג המקור</Label>
                  <Select>
                    <SelectTrigger id="sourceType">
                      <SelectValue placeholder="בחר סוג מקור" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lecture">הרצאה</SelectItem>
                      <SelectItem value="Card">כרטיס סיכום</SelectItem>
                      <SelectItem value="Past exam">מבחן עבר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="course">קורס</Label>
                  <Select>
                    <SelectTrigger id="course">
                      <SelectValue placeholder="בחר קורס" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockCourses.map((course) => (
                        <SelectItem key={course.id} value={course.course_id}>
                          {course.course_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={styles.formRow}>
                  <div>
                    <Label htmlFor="topic">נושא</Label>
                    <Input id="topic" placeholder="לדוגמה: תרכובות ארומטיות" />
                  </div>

                  <div>
                    <Label htmlFor="lectureNumber">מספר הרצאה (אופציונלי)</Label>
                    <Input id="lectureNumber" type="number" placeholder="5" />
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
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    ביטול
                  </Button>
                  <Button type="submit">העלה</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className={styles.grid}>
          {filteredSources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
