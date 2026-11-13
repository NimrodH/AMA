# מערכת ניהול לימודים עם בינה מלאכותית

מערכת מתקדמת לניהול חומרי לימוד, כרטיסי סיכום ומבחנים עם תמיכה מלאה ב-AI.

## תכונות עיקריות

### 🎓 ניהול מקורות לימוד

- העלאת הרצאות (PDF, PPT/PPTX, DOCX), קישורי Google Docs או טקסט חופשי
- סוגי מקורות: הרצאה, כרטיס סיכום, מבחן עבר, מאמר
- רענון מקורות מ-Google Docs והעלאה מחדש של קבצים
- מטא-דאטה מפורטת לכל מקור

### 🤖 תכונות AI

- **משוב על כרטיסי סיכום**: השוואה אוטומטית בין הכרטיס לחומר ההרצאה
- **יצירת מבחנים**: מבחנים פתוחים ואמריקאיים על בסיס מקור בודד או כלל הקורס
- **בדיקה אוטומטית**: ציון ומשוב מפורט על תשובות
- **תמלול תמונות**: צילום מהמצלמה והמרה לטקסט
- **ניתוח מאמרים**: מענה על שאלות קבועות לכל מאמר

### 📚 ממשק משתמש

- תמיכה מלאה בעברית RTL
- עורך טקסט עשיר לכרטיסי סיכום ולסיכום קורס
- איחוד כרטיסי הסיכום של קורס למקור לימוד אחד
- מצב לימוד, סטטיסטיקות ותזכורות
- חשבונות אורח לשיתוף החומר עם אחרים

## התקנה והגדרה

### דרישות מקדימות

- Node.js 18+
- פרויקט Supabase (מסד נתונים, Auth ו-Storage)
- מפתח OpenAI API עם יתרת קרדיט

### שלב 1: התקנת תלויות

```bash
npm install
```

### שלב 2: הגדרת Supabase

הטבלאות שהאפליקציה משתמשת בהן:

| טבלה | תפקיד |
| --- | --- |
| `students` | פרטי הסטודנט |
| `profiles` | קישור בין משתמש Auth לסטודנט, וסוג חשבון (`student` / `guest`) |
| `courses` | הקורסים של כל סטודנט |
| `sources` | מקורות הלימוד, כולל `vector_store_file_id` ו-`google_docs_url` |
| `cards` | כרטיסי סיכום |
| `exams` | מבחנים, תשובות, משוב וציון |
| `course_summaries` | סיכומי קורס |
| `course_stats` | סטטיסטיקות לימוד לכל קורס |
| `reminders` | תזכורות |
| `article_analysis_questions` / `article_analysis_answers` | שאלות ותשובות לניתוח מאמרים |
| `app_config` | הגדרות מערכת (למשל מזהה ה-Vector Store של OpenAI) |

פונקציות RPC נדרשות: `create_guest_user`, `delete_guest_user`, `list_guest_users`.

כל הטבלאות מוגנות ב-RLS לפי המשתמש המחובר. המבנה המדויק של הטבלאות נמצא בפרויקט ה-Supabase; הטיפוסים בקוד נמצאים ב-`app/lib/supabase.ts`.

בנוסף, צור Storage bucket בשם `sources` להעלאת קבצים.

### שלב 3: משתני סביבה

צור קובץ `.env` בשורש הפרויקט:

```env
# צד שרת
SUPABASE_PROJECT_URL=your-supabase-url
SUPABASE_API_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key

# צד לקוח
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# אופציונלי: מזהה Vector Store קיים (אחרת נוצר אחד ונשמר בטבלת app_config)
OPENAI_VECTOR_STORE_ID=
```

### שלב 4: הרצת האפליקציה

```bash
npm run dev
```

האפליקציה תהיה זמינה בכתובת: `http://localhost:5173`

### פקודות נוספות

```bash
npm run build      # בנייה לפרודקשן
npm run start      # הרצת הבנייה
npm run typecheck  # בדיקת טיפוסים
```

## פריסה

האפליקציה נפרסת ב-Netlify באמצעות `@netlify/vite-plugin-react-router` (מוגדר ב-`vite.config.ts`). יש להגדיר את משתני הסביבה גם בהגדרות האתר ב-Netlify.

| ענף | כתובת |
| --- | --- |
| `main` (האתר הראשי) | https://acmaa.netlify.app/ |
| `develop` (גרסת פיתוח) | https://develop--acmaa.netlify.app/ |

## עריכת פרומפטים של ה-AI

הפרומפטים כתובים בעברית ישירות בתוך נתיבי ה-API בתיקייה `app/routes/`, למשל:

- `api.card-feedback.ts` - משוב על כרטיסי סיכום
- `api.generate-exam-from-source.ts`, `api.generate-exam-from-course.ts`, `api.generate-mc-exam.ts` - יצירת מבחנים
- `api.grade-exam.ts` - בדיקת מבחנים
- `api.transcribe-image.ts` - תמלול תמונות

הקריאות ל-OpenAI משתמשות ב-Responses API עם `file_search` מול Vector Store משותף, שאליו מועלים קבצי המקורות (`app/lib/openai.server.ts`).

## מבנה הפרויקט

```
app/
├── components/        # קומפוננטות React
│   ├── layout/        # קומפוננטות פריסה
│   └── ui/            # ספריית קומפוננטות UI (מבוססת Radix)
├── routes/            # דפי האפליקציה ונתיבי API (api.*.ts)
├── routes.ts          # רישום כל הנתיבים
├── services/          # גישה למסד הנתונים
├── lib/               # Supabase, אימות, OpenAI, Google Docs
├── hooks/             # React hooks
└── styles/            # קבצי עיצוב ו-design tokens
```

## טכנולוגיות

- **React 19** - ספריית UI
- **React Router v7** - ניתוב ו-SSR
- **TypeScript** - Type safety
- **Supabase** - מסד נתונים, אימות ואחסון קבצים
- **OpenAI API** - בינה מלאכותית
- **Lexical** - עורך טקסט עשיר
- **CSS Modules** - עיצוב
- **Radix UI** - קומפוננטות נגישות
- **Netlify** - אחסון ופריסה
