# מערכת ניהול לימודים עם בינה מלאכותית

מערכת מתקדמת לניהול חומרי לימוד, כרטיסי סיכום ומבחנים עם תמיכה מלאה ב-AI.

## תכונות עיקריות

### 🎓 ניהול מקורות לימוד

- העלאת הרצאות (PDF, PPT, DOCX)
- יצירת כרטיסי סיכום
- שמירת מבחני עבר
- מטא-דאטה מפורטת לכל מקור

### 🤖 תכונות AI

- **משוב על כרטיסי סיכום**: השוואה אוטומטית בין הכרטיס לחומר ההרצאה
- **יצירת מבחנים**: מבחנים מותאמים אישית על בסיס החומר הנלמד
- **בדיקה אוטומטית**: ציון ומשוב מפורט על תשובות

### 📚 ממשק משתמש

- תמיכה מלאה בעברית RTL
- עיצוב מודרני ונקי
- ניווט אינטואיטיבי
- תזכורות חכמות

## התקנה והגדרה

### דרישות מקדימות

- Node.js 18+
- חשבון Supabase
- חשבון OpenAI API

### שלב 1: התקנת תלויות

```bash
npm install
```

### שלב 2: הגדרת Supabase

1. צור פרויקט חדש ב-[Supabase](https://supabase.com)
2. צור את הטבלאות הבאות:

**טבלת students:**

```sql
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**טבלת courses:**

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(id),
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**טבלת sources:**

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('Lecture', 'Card', 'Past exam')),
  lecture_number INTEGER,
  topic TEXT NOT NULL,
  language TEXT DEFAULT 'he',
  upload_date DATE NOT NULL,
  file_url TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**טבלת exams:**

```sql
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  exam_content TEXT NOT NULL,
  student_answers TEXT,
  ai_feedback TEXT,
  grade INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**טבלת reminders:**

```sql
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

3. הפעל Storage bucket בשם `sources` להעלאת קבצים

### שלב 3: הגדרת OpenAI

1. צור חשבון ב-[OpenAI Platform](https://platform.openai.com)
2. צור API Key חדש
3. הוסף יתרת קרדיט לחשבון

### שלב 4: משתני סביבה

צור קובץ `.env` בשורש הפרויקט:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_OPENAI_API_KEY=your-openai-api-key
```

### שלב 5: הרצת האפליקציה

```bash
npm run dev
```

האפליקציה תהיה זמינה בכתובת: `http://localhost:5173`

## עריכת פרומפטים של ה-AI

כל הפרומפטים נמצאים בקובץ `app/lib/openai.ts` באובייקט `PROMPTS`:

```typescript
export const PROMPTS = {
  CARD_FEEDBACK: `...`, // משוב על כרטיסי סיכום
  EXAM_GENERATION: `...`, // יצירת מבחנים
  EXAM_GRADING: `...`, // בדיקת מבחנים
};
```

ניתן לערוך את הפרומפטים כדי להתאים את התגובות של ה-AI לצרכים שלך.

## מבנה הפרויקט

```
app/
├── components/          # קומפוננטות React
│   ├── layout/         # קומפוננטות פריסה
│   ├── source-card/    # כרטיס מקור לימוד
│   └── ui/            # ספריית קומפוננטות UI
├── routes/            # דפי האפליקציה
│   ├── home.tsx       # דף הבית
│   ├── sources.tsx    # ניהול מקורות
│   ├── cards.tsx      # כרטיסי סיכום
│   ├── exams.tsx      # מבחנים
│   └── settings.tsx   # הגדרות
├── lib/               # ספריות עזר
│   ├── supabase.ts    # Supabase client
│   └── openai.ts      # OpenAI integration
├── data/              # נתוני דמו
└── styles/            # קבצי עיצוב
```

## טכנולוגיות

- **React 19** - ספריית UI
- **React Router v7** - ניתוב
- **TypeScript** - Type safety
- **Supabase** - Database & Storage
- **OpenAI API** - בינה מלאכותית
- **CSS Modules** - עיצוב
- **Radix UI** - קומפוננטות נגישות

## תמיכה

לשאלות ובעיות, פנה למפתח או פתח issue בגיטהאב.

---

**נבנה עם ❤️ באמצעות [Dazl](https://dazl.dev)**
