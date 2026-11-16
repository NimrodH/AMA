# Functionality

How the app's features work from the student's point of view, with pointers to the code. Add a section here when a feature is added or its behavior changes.

## Card study ("שינון כרטיסים")

Page: `/learn`, in the sidebar as "שינון כרטיסים". Code: `app/routes/learn.tsx`, styles in `app/routes/learn.module.css`.

The student goes through a temporary list of summary cards. For each card they see the title, try to recall the content, reveal it, and decide whether the card needs another pass in this round.

### Controls (top row)

| Control | What it does |
| --- | --- |
| Course picker | "כל הקורסים" or one active course. Picking a course saves it as the selected course for the other pages. |
| "אקראי" / "לפי סדר" | Card order for the next round: shuffled, or by card number (cards without a number come last). Shown only when one course is selected; "כל הקורסים" always uses random order. |
| "אתחול" | Starts a new round (see below). Always available while the course has cards, so it also restarts a round in progress. |
| Counter | Before a round: "X כרטיסים זמינים". During a round: "נותרו X מתוך Y כרטיסים". |

Changing the course or the order clears the current round, and the student presses "אתחול" again.

### A round

1. **"אתחול"**: builds a temporary list of all the cards of the selected course (or all courses), in the selected order, and shows the first card's title with the hint to recall the content.
2. **"הצג תוכן"**: shows the card's content under the title.
3. The student then chooses one of two buttons:
   - **"לשינון חוזר"**: moves the card to the end of the list. It will come up again after all the other cards still in the list.
   - **"שינון בעתיד"**: removes the card from the list.

   In both cases the next card's title is shown, and the student continues from step 2.
4. When the last card is removed, the page shows "כל הכבוד סיימת שינון כל הכרטיסים" with a trophy and a short confetti animation (turned off when the system asks for reduced motion). "אתחול" starts a new round.

If only one card is left and the student picks "לשינון חוזר", the same card is shown again.

### What is and isn't saved

- The list lives only in the page's memory. Leaving or reloading the page loses the round; nothing about which cards were sent to "לשינון חוזר" or "שינון בעתיד" is stored.
- Each "אתחול" with a single course selected adds one to that course's study-session count (`course_stats.learn_sessions`, through `POST /api/track-learn-session`), which the home page shows under "שינון כרטיסים". It is not counted for "כל הקורסים" or for guest accounts.
