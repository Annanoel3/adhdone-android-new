// Plain-language reference of every ADHDone feature. Injected into the
// Support Space prompt so the AI can answer "how does X work?" questions
// accurately instead of guessing.
export const APP_FEATURE_GUIDE = `
NAVIGATION: Open the menu with the icon in the top-left. Main items: Home, Tasks, Calendar. "Tools" holds Pomodoro Timer, Parking Lot and Record Notes. "Reflect" holds Support Space and Insights. Bottom of the menu: App Guide, Settings. Places (home area, work address, work hours) is in Settings, not the menu.

HOME: Today's Tasks (due today, overdue, or spanning today), Quick Add (type or speak a task), daily tip, motivation coach, streak, upcoming birthday card, Focus Mode button, end-of-day review. Tap a task's circle to complete it (a little celebration plays). Completing a recurring task automatically creates the next occurrence.

ADDING TASKS: Quick Add on Home, the Tasks page, the floating mic button, or Android share sheet / Quick Capture notification. Type or speak naturally — e.g. "pay the electric bill by Friday" or "dentist Tuesday at 3pm". The AI parser pulls out the title, date/time, priority, and whether it's a task, event, payment (💳), or birthday (🎂). It keeps every person/place/thing you mentioned in the title and stores your exact original wording. If you mention several things in one breath it offers to split them into separate tasks (duplicates are collapsed). Long tasks can be broken into ordered sub-steps with "Break it down" (AI decomposition). Only the date/time you actually said is used — the app never invents a location or a recurring schedule.

DATES & REMINDERS: "on Friday" = happens that day (night-before heads-up + day-of nudges). "by Friday" = deadline (reminders start earlier and build up). Tasks with a specific time get a smart reminder schedule (e.g. day before, morning of, 1 hour before) that you can view and edit per-reminder in the task details. Tasks with no time get intelligent hourly "smart nudges" that surface ONE task at a time with a friendly message instead of flooding the tray. Recurring intervals (every 10/20/30 min, hourly, daily, etc.) are available for habit-style tasks. Quiet hours (Settings) silence all nudges overnight — if disabled, nudges can run until midnight. Push notifications go through the phone; you must allow notifications for the app. On Android, a to-do's reminder notification has a Done button that finishes the task.

TASK FIELDS: priority (low/medium/high/urgent), energy required (low/medium/high), notes, photos, location (only if you gave one — used to suggest combining errands using real drive distance from your home area, set in Settings → Places), start date & end date for multi-day items, recurrence (daily/weekly/every other week/monthly/yearly).

TASKS PAGE: grouped into Today, Tomorrow, Next 7 Days, Upcoming, No Date, Back Burner. Empty groups start collapsed. Sort options in the dropdown. Swipe/tap a task for details, edit, push due date later (push count is tracked so Insights can flag chronically postponed tasks), snooze, silence, or delete. Tasks worth timing (chores, cleaning, studying, writing) have a "Time it" button: a stopwatch counts up on that task, with "I finished the task" (checks it off) and "Stop" on screen the whole time, and the time spent is logged either way. The Home "Timer" button does the same for today's tasks.

BACK BURNER 🔥: silences a task's notifications and drops it out of Today and nudges, but keeps it in the list. Its priority is forced to low while parked and restored when you bring it back. Back-burnered rows show only the task name.

CALENDAR: month grid plus a week agenda. Always opens on today. Dots: a single red dot for any overdue tasks, one summary dot for back-burner items. Emojis: 🎂 birthday, 📅 imported calendar event, ✅ imported calendar task, 📌 in-app task, 💳 payment. Phone calendars: on the Calendar page, tick which of the phone's calendars to bring in (any calendar the phone's calendar app shows: Google, Samsung or Outlook on Android; iCloud, Google or Outlook on iPhone). Their events become tasks with reminders (birthdays route to the Birthdays feature).

BIRTHDAYS 🎂: a separate feature — never shown in normal task lists. Add from the Birthdays dialog (name, date, optional phone via the contact picker). Reminder options: 1 week before, 1 day before, day-of. On the day, the app can draft a birthday text with AI (adjust tone/formality, regenerate with instructions) and open your messaging app pre-filled; hourly reminders stop once you press Send. Rolls over yearly automatically.

POMODORO TIMER / FOCUS MODE: the Pomodoro Timer (menu, under Tools) runs work + break timers with optional background music; a mini bar shows the running timer on every page. Focus Mode (Home) temporarily quiets other tasks' reminders and restores them when you exit. Focus sessions are logged and shown in Insights.

PARKING LOT: dump ideas without losing focus (the "Park an Idea" button floats on most pages). Ideas get AI categories, can be plain text, checkbox lists, or numbered lists, have notes and photos, sub-ideas, and can be converted into tasks later.

INSIGHTS (menu, under Reflect): your wins, when you usually get things done, areas of life (bubbles), how you felt next to what you got done, overall performance and your streak, your habits, comebacks (tasks rescued from the Back Burner) and focus time, deadline dodging (what keeps getting pushed back), and personalized recommendations. There are no achievements, badges, points or challenges to see.

SUPPORT SPACE (it was called "Talk It Out" for a while): this chat — a judgment-free place to vent, process, or ask how the app works. Voice or text. Not a substitute for professional care.

THEMES: pick one at the top of Settings, under "Look and feel": Light, Dark, Colorful, Spicy Brains (color-psychology theme with an explainer), plus Seasonal and Kawaii once unlocked. Seasonal themes follow the real calendar (spring, summer, fall, harvest, winter, Halloween, Christmas, New Year's, Valentine's, St. Patrick's, 4th of July) and switch automatically. Kawaii is a manual pick.

SETTINGS: Look and feel (theme) at the top; Quick Capture; the Account list holds Personalization (your name and a note about your life that every AI feature reads), Reminders (quiet hours, full-screen reminder default, ring sound, phone permissions) and Places (a circle over your home area for drive times and errand grouping, whether you work from home, your work address so "leave now" pushes use real traffic, your work hours or shifts, and a switch that keeps nudges quiet while you're at work); notification settings, Quick Capture (Android: a pinned notification you tap to add a task from anywhere — needs the notification permission), profile, account, subscription, delete data/account.

ANDROID EXTRAS: share any text into ADHDone from another app and it becomes a task; Quick Capture pinned notification with inline reply (type "test task due Saturday" right in the notification and it's parsed like any other task); native contact picker for birthdays; back button navigates back or exits on Home.

QUICK CAPTURE SETUP: on first open the app asks once whether to turn on the Quick Capture pinned notification. It uses the same Android notification permission as reminders — if notifications are already allowed there's no second prompt, it just pins the shortcut. It can be toggled any time in Settings. Each captured text creates exactly one task.

DATE PICKER "ANY DAY": when a task is added with a date but no time, choosing "Any day" keeps the date you gave — it only means "no specific time", not "no date". If a date is already known, the picker only asks about the time.

THINGS THE APP DOES NOT DO: email-to-task, sending texts/emails on your behalf, inventing locations or recurring schedules you didn't state, accountability partners, chat with other people, any community feature, scheduling a text to send later (the one text it drafts is a birthday text, on the day), or achievements and challenges.
`;