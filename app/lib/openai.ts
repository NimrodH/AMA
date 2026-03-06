import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Configurable prompts - developers can easily modify these
export const PROMPTS = {
  CARD_FEEDBACK: `אתה מומחה אקדמי המספק משוב על כרטיסי סיכום של סטודנטים.
השווה את כרטיס הסיכום של הסטודנט לחומרי ההרצאה המקוריים.
ספק משוב מפורט הכולל:
1. מושגים חסרים שהיו בהרצאה אך לא בכרטיס
2. טענות שגויות או לא מדויקות
3. תחומים חלשים שדורשים שיפור
4. נקודות חוזק בסיכום

הצג את המשוב בפורמט מובנה וברור בעברית.`,

  EXAM_GENERATION: `אתה מחולל מבחנים אקדמיים.
צור מבחן חדש על סמך:
1. תוכן מחומרי ההרצאה שסופקו
2. מבנה ותבנית השאלות ממבחנים קודמים

המבחן צריך:
- להכיל שאלות מגוונות (אמריקאיות, פתוחות, נכון/לא נכון)
- לכסות את כל הנושאים העיקריים
- להיות בעברית
- לכלול הוראות ברורות

החזר את המבחן בפורמט JSON עם המבנה הבא:
{
  "title": "כותרת המבחן",
  "instructions": "הוראות למבחן",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice" | "open" | "true_false",
      "question": "נוסח השאלה",
      "options": ["אופציה 1", "אופציה 2"] (רק לשאלות אמריקאיות),
      "points": 10
    }
  ]
}`,

  EXAM_GRADING: `אתה בוחן אקדמי המעריך תשובות סטודנטים למבחנים.
בדוק את תשובות הסטודנט מול המבחן והחומר הלימודי.
ספק:
1. ציון כולל (0-100)
2. ציון לכל שאלה
3. משוב מפורט על כל תשובה
4. המלצות לשיפור

הצג את המשוב בפורמט JSON:
{
  "total_grade": 85,
  "question_grades": [
    {
      "question_id": 1,
      "grade": 8,
      "max_points": 10,
      "feedback": "משוב על התשובה"
    }
  ],
  "overall_feedback": "משוב כללי",
  "recommendations": ["המלצה 1", "המלצה 2"]
}`,
};

export async function getCardFeedback(cardContent: string, lectureContent: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: PROMPTS.CARD_FEEDBACK,
      },
      {
        role: "user",
        content: `חומר הרצאה:\n${lectureContent}\n\nכרטיס סיכום של הסטודנט:\n${cardContent}`,
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "לא התקבל משוב";
}

export async function generateExam(lectureContent: string, pastExamStructure: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: PROMPTS.EXAM_GENERATION,
      },
      {
        role: "user",
        content: `חומר הרצאה:\n${lectureContent}\n\nמבנה מבחנים קודמים:\n${pastExamStructure}`,
      },
    ],
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content || "{}";
}

export async function gradeExam(examContent: string, studentAnswers: string, lectureContent: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: PROMPTS.EXAM_GRADING,
      },
      {
        role: "user",
        content: `מבחן:\n${examContent}\n\nתשובות הסטודנט:\n${studentAnswers}\n\nחומר לימוד:\n${lectureContent}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content || "{}";
}
