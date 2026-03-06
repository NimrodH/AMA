import type { Database } from "~/lib/supabase";

type Source = Database["public"]["Tables"]["sources"]["Row"];
type Course = Database["public"]["Tables"]["courses"]["Row"];

export const mockStudent = {
  id: "stu_442",
  name: "יעל כהן",
  created_at: new Date().toISOString(),
};

export const mockCourses: Course[] = [
  {
    id: "1",
    student_id: "stu_442",
    course_id: "chem101",
    course_name: "כימיה אורגנית 1",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    student_id: "stu_442",
    course_id: "math201",
    course_name: "חשבון אינפיניטסימלי 2",
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    student_id: "stu_442",
    course_id: "phys101",
    course_name: "פיזיקה 1",
    created_at: new Date().toISOString(),
  },
];

export const mockSources: Source[] = [
  {
    id: "1",
    student_id: "stu_442",
    course_id: "chem101",
    source_type: "Lecture",
    lecture_number: 5,
    topic: "תרכובות ארומטיות",
    language: "he",
    upload_date: "2024-03-15",
    file_url: "https://example.com/lecture5.pdf",
    metadata: {
      file_name: "lecture_5_aromatic_compounds.pdf",
      file_size: 2048000,
    },
    created_at: "2024-03-15T10:00:00Z",
  },
  {
    id: "2",
    student_id: "stu_442",
    course_id: "chem101",
    source_type: "Card",
    topic: "תרכובות ארומטיות - סיכום",
    language: "he",
    upload_date: "2024-03-16",
    content: `# תרכובות ארומטיות

## הגדרה
תרכובות ארומטיות הן מולקולות מחזוריות עם מערכת של אלקטרונים מצומדים המקנות יציבות מיוחדת.

## תכונות עיקריות
- מבנה מישורי
- קשרים מצומדים
- יציבות גבוהה
- ריח אופייני

## דוגמאות
- בנזן (C6H6)
- טולואן
- נפתלן`,
    metadata: {},
    created_at: "2024-03-16T14:30:00Z",
  },
  {
    id: "3",
    student_id: "stu_442",
    course_id: "chem101",
    source_type: "Past exam",
    topic: "מבחן מועד א 2023",
    language: "he",
    upload_date: "2024-03-10",
    file_url: "https://example.com/exam_2023.pdf",
    metadata: {
      file_name: "exam_2023_moed_a.pdf",
      year: 2023,
      semester: "א",
    },
    created_at: "2024-03-10T09:00:00Z",
  },
  {
    id: "4",
    student_id: "stu_442",
    course_id: "math201",
    source_type: "Lecture",
    lecture_number: 3,
    topic: "אינטגרלים מסוימים",
    language: "he",
    upload_date: "2024-03-12",
    file_url: "https://example.com/math_lecture3.pdf",
    metadata: {
      file_name: "integrals_lecture_3.pdf",
    },
    created_at: "2024-03-12T11:00:00Z",
  },
];
