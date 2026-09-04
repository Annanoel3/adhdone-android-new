// Plain-language reference of every ADHDone feature. Injected into the
// Support Space prompt so the AI can answer "how does X work?" questions
// accurately instead of guessing.
export const APP_FEATURE_GUIDE = `
NAVIGATION: Open the menu with the icon in the top-left. Main items: Home, Tasks, Calendar. "Tools" holds Focus Timer, Parking Lot, Scheduled Texts. "Reflect & Connect" holds Progress, Insights, Support Space, Community. Bottom of the menu: App Guide, theme toggle, Settings.

HOME: Today's Tasks (due today, overdue, or spanning today), Quick Add (type or speak a task), daily tip, motivation coach, streak, upcoming birthday card, Focus Mode button, end-of-day review. Tap a task's circle to complete it (a little celebration plays). Completing a recurring task automatically creates the next occurrence.

ADDING TASKS: Quick Add on Home, the Tasks page, the floating mic button, or Android share sheet / Quick Capture notification. Type or speak naturally — e.g. "pay the electric bill by Friday" or "dentist Tuesday at 3pm". The AI parser pulls out the title, date/time, priority, and whether it's a task, event, payment (💳), or birthday (🎂). It keeps every person/place/thing you mentioned in the title and stores your exact original wording. If you mention several things in one breath it offers to split them into separate tasks (duplicates are collapsed). Long tasks can be broken into ordered sub-steps with "Break it down" (AI decomposition). Only the date/time you actually said is used — the app never invents a location or a recurring schedule.

DATES & REMINDERS: "on Friday" = happens that day (night-before heads-up + day-of nudges). "by Friday" = deadline (reminders start earlier and build up). Tasks with a specific time get a smart reminder schedule (e.g. day before, morning of, 1 hour before) that you can view and edit per-reminder in the task details. Tasks with no time get intelligent hourly "smart nudges" that surface ONE task at a time with a friendly message instead of flooding the tray. Recurring intervals (every 10/20/30 min, hourly, daily, etc.) are available for habit-style tasks. Quiet hours (Settings) silence all nudges overnight — if disabled, nudges can run until midnight. Push notifications go through the phone; you must allow notifications for the app.

TASK FIELDS: priority (low/medium/high/urgent), energy required (low/medium/high), notes, photos, location (only if you gave one — used to suggest combining errands using real drive distance from your home zip, set in Settings), start date & end date for multi-day items, recurrence (daily/weekly/every other week/monthly/yearly).

TASKS PAGE: grouped into Today, Tomorrow, Next 7 Days, Upcoming, No Date, Back Burner. Empty groups start collapsed. Sort options in the dropdown. Swipe/tap a task for details, edit, push due date later (push count is tracked so Insights can flag chronically postponed tasks), snooze, silence, or delete. The rocket icon starts a Focus/Launch sprint on that task.

BACK BURNER 🔥: silences a task's notifications and drops it out of Today and nudges, but keeps it in the list. Its priority is forced to low while parked and restored when you bring it back. Back-burnered rows show only the task name.

CALENDAR: month grid plus a week agenda. Always opens on today. Dots: a single red dot for any overdue tasks, one summary dot for back-burner items. Emojis: 🎂 birthday, 📅 imported Google event, ✅ imported Google task, 📌 in-app task, 💳 payment. Google Calendar sync: connect your Google account on the Calendar page; events auto-import as tasks/events (birthdays route to the Birthdays feature). Auto-sync interval (6 hours / daily / weekly / never) is chosen on the Calendar page and runs whenever the app opens.

BIRTHDAYS 🎂: a separate feature — never shown in normal task lists. Add from the Birthdays dialog (name, date, optional phone via the contact picker). Reminder options: 1 week before, 1 day before, day-of. On the day, the app can draft a birthday text with AI (adjust tone/formality, regenerate with instructions) and open your messaging app pre-filled; hourly reminders stop once you press Send. Rolls over yearly automatically.

SCHEDULED TEXTS: draft a text to someone for a future day (or exact time). The app reminds you when it's time (then 10 min later, then hourly) and opens your messaging app pre-filled — you press send. Snooze available. The app never sends texts by itself.

FOCUS TIMER / FOCUS MODE: Pomodoro-style work + break timers with optional background music; a mini bar shows the running timer on every page. Focus Mode (Home) temporarily quiets other tasks' reminders and restores them when you exit. Focus sessions are logged and shown in Progress.

PARKING LOT: dump ideas without losing focus (the "Park an Idea" button floats on most pages). Ideas get AI categories, can be plain text, checkbox lists, or numbered lists, have notes and photos, sub-ideas, and can be converted into tasks later.

PROGRESS & INSIGHTS: streaks, completion rates, focus time stats, recurring-task patterns, weekly challenges, achievements. Insights highlights patterns like tasks you keep pushing.

SUPPORT SPACE: this chat — a judgment-free place to vent, process, or ask how the app works. Voice or text. Not a substitute for professional care.

COMMUNITY: Accountability partners, partner chat, Focus Rooms (shared co-working timers), mood check-ins, report/block tools.

THEMES: the theme button in the menu cycles Light → Dark → Colorful → Spicy Brains (color-psychology theme with an explainer) → seasonal (if unlocked). Seasonal themes follow the real calendar (spring, summer, fall, harvest, winter, Halloween, Christmas, New Year's, Valentine's, St. Patrick's, 4th of July) and switch automatically. Kawaii is a manual pick.

SETTINGS: quiet hours, home zip code (for errand grouping), notification settings, Quick Capture (Android: a pinned notification you tap to add a task from anywhere — needs the notification permission), profile, account, subscription, delete data/account.

ANDROID EXTRAS: share any text into ADHDone from another app and it becomes a task; Quick Capture pinned notification with inline reply; native contact picker for birthdays; back button navigates back or exits on Home.

THINGS THE APP DOES NOT DO: email-to-task, sending texts/emails on your behalf, completing tasks from notification buttons, inventing locations or recurring schedules you didn't state.
`;