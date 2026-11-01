# GOALS_PORT — the Goals app's planner, brought into ADHDone (Oct 31 2026)

Anna, Oct 31 2026: "If we carefully make sure we are actually copying the way it works in the
goals app correctly, we should be good. And yes, bake the goal steps into existing notifications.
And if someone is on a goal, display current step on the dashboard somewhere. ... Show goals only
on my account for now."

Source: Anna's "Goals" Base44 app (id 6a0480d58799f243f556731d), read end to end and not changed.
Everything below about "the Goals app" was read from its code on Oct 31 2026.

---------------------------------------------------------------------------------------------------

## 1. How the Goals app works, screen by screen

### Planner (src/pages/Planner.jsx + function goalPlannerChat)

**Opening it.** With saved goals and no conversation in progress it shows "Your Goals — Click any
goal to refine, extend, or adjust your plan" with a "Plan New Goal" button. Otherwise an empty state:
"What's your goal?", "Describe your goal and I'll build a detailed, phased plan with milestones to
get you there.", and four example goals that start the chat when tapped. The text box and a mic
(recorded, transcribed, sent as a message) sit at the bottom.

**The conversation** (one model call per turn, gpt-4o, with a `web_search` tool that went through
Base44's InvokeLLM):
1. Safety check on the first message (gpt-4o-mini): unhealthy weight loss, dangerous extremes,
   impossible timelines, illegal, self-harm, predatory or hateful goals get a warm 1–2 sentence
   reply with a healthier alternative instead of a plan.
2. *Phase 0* — if the first message already has goal, timeline, time commitment and constraints, it
   goes straight to the plan (never for reading goals).
3. *Phase 1* — ONE numbered list of questions, each saying how the answer shapes the plan:
   experience + past attempts (always), obstacles/fears (always, "I'll build contingency steps"),
   target amount/outcome (finance goals look up the real price first), realistic monthly time or
   money, deadline (only if not given), start date, **the time of day for reminders (every goal)**,
   **"reminders on weekends too, or just weekdays?" (daily-action goals)**, budget for books/
   courses/tools (no budget = free resources only), city for local classes (only where in-person
   helps, asked once). Reading goals must also ask genres/authors, books already read and book budget.
4. **It knows it has enough** when the user has replied at least twice with substantive answers
   (the prompt forbids drafting before that unless Phase 0 applies).
5. *Phase 2* — the whole plan in one message: a 2–3 sentence summary of what it heard, then every
   month as `**Month N — Title**` with `**Week 1**`…`**Week 4**`, each week 3–6 bullets (the concrete
   action, "Focus on:", "Reflect:", "Activity:", optional "Resource:"), then "Does this plan look good?
   Ready to save it?". Rules: never group months ("Months 4–12"), never placeholders, real book titles
   and chapter counts looked up for reading goals, no spoilers, safe search-style links only, no
   fabricated facts, never recommend something they've already read/tried, hard caps on "less X".
   The timeline is detected from their words in code ("in 5 months", "by June", "this year") and
   enforced. A code safety net re-asks the model for any missing months, up to 16 passes, then
   closes honestly ("You can also ask me to continue expanding any remaining months").
6. Approval: when they say yes the model starts with `PLAN_APPROVED`, re-checking every month is there.

**Buttons.** Under a plan: "Looks good" / "I'd like to work on it some more". "Looks good" → "Create
your plan now?" with "Create Plan" / "Go Back". Saving shows a progress bar, then "Goal created! 🎉",
"Your plan is a living document 🌱 …", "Go to Goal →" (unlocks once steps exist, or after 10 s) and
"Plan Another".

**How the plan is saved.** `extract_plan`: the plan's markdown is parsed in code into one step per
week (`title` = "Week N: <first bullet's focus>", `description` = all the week's bullets, `phase` =
"Month X, Week Y", priority medium, no resources/criteria/tips). A small gpt-4o-mini call reads the
goal-level fields: title, description, plan summary, category, `notification_frequency`,
**`requires_daily_action`** (habit/practice/reading/fitness → true; a keyword list then forced reading
goals to true and "learning"), `weekdays_only`, `include_weekend_reminders`, **`preferred_time`** (their
reminder time, HH:MM) and **`start_date`** ("next month" → the 1st, "July" → July 1st, "now" → today).
`habit_days_of_week` was always `[]`. Every step gets `is_daily_habit = requires_daily_action`. If the
markdown can't be parsed, the model extracts the whole thing as JSON instead. The app creates the
Goal (with the conversation and month titles), then `createRemainingGoalSteps` bulk-creates the steps
with the user's own client and dates each one: **Week 1 = the start date; Week N = the Monday of
calendar week N** (so a step's due_date is when its week *starts*). Then it booked the goal's
notifications (`scheduleGoalNotifications`).

**Closing mid-conversation.** Every message is saved to `localStorage.plannerInProgress` before the
model answers; reopening the Planner restores the chat (and the plan buttons if the last message is a
plan). My Goals shows "Goal in progress…" with Continue / Dismiss.

**Editing a goal.** Tapping a goal in the Planner's list opens an edit chat (its saved conversation,
or "I'm ready to help you update…" with 8 example chips). Small changes are proposed and confirmed
(`EDIT_APPROVED`); big ones are rewritten in full; timeline extensions offer "full restructure" or
"add advanced content". "Looks good! Apply changes" runs `apply_edit`: the model extracts the new
steps, every step not completed is deleted and the new ones created, goal-level changes saved.

**Errors.** A failed turn appended "Something went wrong. Please try again." as an assistant message.

### The plan's phases and steps
Months (title per month in `month_titles`) → weeks → steps. A step has: title, description (the
week's bullets), phase, priority (low/medium/high/critical), due_date, order_index, status
(pending / in_progress / completed / skipped — only pending and completed are ever set), resources
(type, title, url, description, specific details), success criteria, tips & guidance, the person's
notes and photos, and habit fields (`is_daily_habit`, `habit_completions` dates, check-in fields).
Steps made by the code parser have no resources/criteria/tips (they're in the description); the
model-extracted fallback fills criteria and tips.

### My Goals (src/pages/Goals.jsx)
"My Goals", "N active goals", "New Goal" (→ Planner), tabs **Active / Completed / Paused** with counts,
the in-progress note, and a card per goal: category pill, timeline, title, summary, "N steps" and a
% bar.

### The goal page (src/pages/GoalDetail.jsx)
Back to Goals; a header card (title, category, "Starts …", timeline, status pill, delete); the plan
summary; "X of Y steps done" with a % bar; months (collapsed, with a date range from the start date,
the month's title and x/y done) → weeks (first line of the description as the week's title, date
range, x/y) → step rows. A row: a checkbox (done / not done), the title (tap to edit), two lines of
description; for a habit step a **this-week tracker** (M–Su, past days toggle, future days locked)
and, when a notification had asked, "✅ Did you do it today? Tap to check in" (Yes / Not today, an
optional note added to the step's notes). Tapping a row opens the step's details (description,
resources, success criteria, tips, personal notes, photos, Save). Below: Completion History, the
goal's notes, a delete confirmation ("This will permanently delete … and all its steps"). Finishing
every step of week 1–3 of a month shows a week celebration (a random GIF looked up through InvokeLLM,
or "🎉 Week N Crushed! 🎉", 5 s); finishing week 4 shows the month celebration (that month's GIF from
Anna's storage, then the month's finished steps two at a time, then "Keep going! 🎉").

**What decides "current".** Home's "Up Next" and the inactivity screen: the first *pending* step by
order_index. The daily-habit reminder: the latest habit step whose week has started (due_date ≤ today)
and isn't completed; none before the start date.

**Goal statuses.** The Goal entity has active / completed / paused and My Goals has a tab for each,
but **nothing in the Goals app ever changes a goal's status** — no button, no backend. Goals stay
active at 100%.

### Milestones
`MilestoneGoal`, `Milestone`, `MilestoneTask` and `milestonePlannerChat` exist, but **no screen,
route or function reaches them** (searched every page, component and function). `classifyGoalType`
is also never called, and `GoalPlanLoadingAnimation` / `MomentumCelebration` are never imported.
All skipped.

---------------------------------------------------------------------------------------------------

## 2. What came over

### Copied (same flow, same words)
- The whole planner conversation: the safety check, Phase 0/1/2, every question, the "replied at least
  twice" rule, the plan format, every rule block (no grouping, week depth, reading, links, no
  fabrication, no repeats, "less X", time mapping), the month-detection and missing-month safety net,
  `PLAN_APPROVED` / `EDIT_APPROVED`, the edit chat with its examples and Option A/B extensions.
- Saving: the code parser, the goal-level extraction, the AI fallback, the Goal record, step dates
  (Week 1 = start, then calendar-week Mondays), `apply_edit`.
- `plannerInProgress`: saved before each answer, restored on open, the "Goal in progress…" note.
- The plan view in the chat (months/weeks dropdowns, "Show Markdown"), the approval buttons, the
  saving bar, "Goal created! 🎉" and "Your plan is a living document 🌱".
- My Goals (tabs, cards, progress), the goal page (hierarchy, dates, progress, tap-to-edit titles,
  step details with resources/criteria/tips/notes/photos, the habit week tracker, the check-in popup,
  completion history, notes, delete), and both celebrations (same GIFs and timings).

### Adapted (and why)
- **Models:** every call is `gpt-6-astra` through OpenAI (RULES.md §1). Web search is OpenAI's own
  `web_search` tool (as in supportSpaceChat); the Goals app's search went through InvokeLLM. Its tool
  description ("MANDATORY USE CASES …") is now a prompt rule so the guidance isn't lost.
- **Reminders in the prompts:** a new "THIS APP" rule says the step goes on their task list and that
  neither the planner nor the app sends check-ins, summaries or messages, so it never promises any.
  "What time of day should I send you reminders?" (every goal) became, for daily-action goals only,
  "What time of day do you want to do this? I'll put it on your task list at that time — or say no
  set time." "Reminders on weekends too, or just weekdays?" became "Every day, or just weekdays?".
  "change a reminder time" was taken out of the edit chat's small changes (its apply step never
  saved a time). `notification_frequency` and `notification_schedule` are no longer generated.
  The extraction now also reads specific habit days ("Mon, Wed, Fri") into `habit_days_of_week`.
- **Reading-goal keyword list** (forced daily + learning on top of the model) dropped: Anna's rule
  is judgment, not keyword tables; the prompt still says reading goals are daily and "learning".
- **Today** is the person's own date (their time zone), not the server's.
- **apply_edit:** an extraction with no steps no longer deletes the open steps; new steps are numbered
  after the kept completed ones and dated with the same calendar-week rule as new plans; a habit
  goal's new steps stay habit steps. **Deleting the replaced steps is unchanged** (it deletes their
  notes and photos too, as in the Goals app).
- **createRemainingGoalSteps** skips steps already saved (a retry never doubles them) and books no
  notifications.
- **Planner errors:** a failed turn shows "Couldn't reach the planner. Your conversation is saved." +
  "Try again" instead of adding a fake assistant message; a chat closed while waiting comes back with
  that same Try again. A plan whose steps didn't save shows "Try again" (the Goals app left a goal
  with no steps).
- **A closed edit chat** comes back as an edit of that goal (the Goals app restored it as a new plan,
  so approving it made a second goal).
- **The chat in progress is saved to the account** (Nov 1 2026, Anna: "yes make it save to the
  account"), not only `localStorage.plannerInProgress`: entity `GoalPlannerDraft` (private, one row
  per person; `src/components/goals/plannerDraft.js`). Saved before each planner call and after each
  answer; on opening the Planner the newer of the device's and the account's copy wins (the device's
  goes up when it's newer). Saving a goal, a fresh start or Dismiss marks it `completed` (kept,
  never restored). A failed call never blocks the chat; the device copy stays as before.
- **Long plans finish.** The Goals app's continuation passes stop when the time budget runs out and
  closed with "You can also ask me to continue expanding any remaining months"; its plan view then
  padded empty months up to the timeline, and `extract_plan` read only the last message, so a
  typed "continue" saved only the last months. Now a plan the time ran out on comes back
  `incomplete` (`months_done` / `months_total`, no closing line); the Planner shows the months so
  far with "Writing months 15–24…" and calls `continue_plan` (a fresh budget each call, at most 4
  in a go) into the same answer, saving after each; "Looks good" shows only when it's finished,
  otherwise "Keep writing". A restored chat with an unfinished plan picks up by itself. No empty
  month cards. `extract_plan` builds the plan from every planner message (each month from the most
  recent message that wrote it in full; a plan made shorter stays shorter).
- **"Plan New Goal"** and My Goals' "New Goal" open a fresh plan (in the Goals app the button left
  the goals list on screen). The Planner's list shows active goals only (the Goals app showed every
  other goal as a disabled "Building…" row forever).
- **Mic:** ADHDone's own mic (VoiceTaskInput) instead of the Goals app's recorder.
- **Week celebration:** no GIF lookup (it used InvokeLLM); it shows the Goals app's own no-GIF card.
- **Check-in:** the "Did you do it today?" button shows on the current habit step on a habit day
  until today is ticked (it used to wait for the notification flag). Its note box no longer says it
  "helps your AI coach improve your plan" (nothing reads those notes). A yes no longer stamps the
  step's completed_at (that made unfinished steps show in Completion History).
- **Week tracker:** reads the days ticked on the goal page AND the days the habit's task was finished;
  shown on habit steps only (the Goals app also guessed habits from words in the title).
- **The current step opens expanded** on the goal page.
- **Themes:** every screen uses ADHDone's light, dark, colorful, spicybrains and seasonal looks; dark
  seasons are dark glass everywhere (dialogs included). The Planner's header and input bar sit in
  ADHDone's layout instead of being fixed over it.
- **Goal statuses:** the goal page has **Pause goal / Resume goal / Mark goal done / Reopen goal**.
  The Goals app had the statuses and tabs but no way to change them; these exist so pausing and
  finishing a goal can do what's described in §3. Not in the Goals app.

### Dropped (and what useful thing lived there)
The whole notification system: `scheduleGoalNotifications`, `scheduleNextWeekNotifications`,
`scheduleHabitNotification`, `cronGoalNotifications`, `cronGoalStepReminders`,
`cronGoalMilestoneNotifications`, `cronHabitNotifications`, `cronDailyHabitNotifications`,
`checkGoalPace`, `smartHealthReminders`, re-engagement, `notificationButtonAction`,
`rescheduleAllGoalNotifications`, `deleteGoalWithNotifications` (a plain delete instead), every
workflow, the `notification_schedule` / `onesignal_notification_ids` / `pending_notification` /
`notification_frequency` / `reminder_interval` / week-1 and cron bookkeeping fields, the in-app
notification popup, the app-open check-in popup, and the push landing pages GoalStepNotification and
GoalFollowUp. Also the milestone entities and `milestonePlannerChat`, `classifyGoalType`,
`getRandomCelebrationGif`, and the never-shown `HabitTimePrompt`.

Useful things that only lived there (noted, not ported):
- Month-start / month-end and week summaries ("Month 3 starts today! Here's what's coming up…").
- A 2-day heads-up before a future start date.
- AI-written daily habit messages that mention where in the week they are; a 10 AM "missed it?"
  follow-up; a 3-days-missed message.
- Overdue-step pushes; a behind-pace check (expected vs actual progress).
- After 2 weeks with no activity, everything stops except one gentle monthly message.
- "Let's regroup": extend the deadline, pause & restart from a new start date, or edit the plan.
- Notification buttons: done, remind me in 3 hours, move to tomorrow, **shift the whole plan a week**
  (moves every unfinished step's date and the target date by 7 days).
- A workout follow-up when no activity was seen after their preferred time.

---------------------------------------------------------------------------------------------------

## 3. How a goal lives in ADHDone

**One task per goal.** Each active goal has exactly ONE ordinary ADHDone task (`Task.goal_id`):
- *Plain goal:* its current step — the first step, by order_index, not completed or skipped. Title =
  the step's title; notes = the step's first line (its concrete action); priority from the step
  (critical → urgent); a **"by" deadline at the end of that step's week** (the step's due_date is its
  week's *start*, so "by" that day would be overdue the morning after it starts), no time.
- *Daily-habit goal:* ONE repeating task, on the habit's days (`habit_days_of_week`, else weekdays when
  `weekdays_only` / no weekends, else every day), at the time they chose in the planner (a time they
  set: one reminder at that time) or with no time (an all-day repeating task: Smart Reminders). Its
  current step is the Goals app's habit rule (latest started week not done; if they're ahead, the
  next open step); when that changes, the same task is renamed. Finishing it is that day's check-in;
  the step itself is checked off on the goal page.
- Nothing goes on the list before the goal's start date, and no task for a future step.
- Smart Reminders, the Tasks page, life areas, wins and Insights treat it like any task. Smart
  Reminders also sees one line in the task's info: `this is step 3 of 8 of their goal "…"` (or `this
  is the daily habit for their goal "…", now on step 3 of 8`), from `Task.goal_context`.

**How it's made.** Only in the app: `GoalStepSync` (mounted once in Layout, for accounts
`goalsEnabled` lets in) runs on open, on coming back to the app, after goal changes, 8 s after a
check-off (past the Undo), and on page changes at most every 10 s; the planner and the goal page run
it after they change something. It creates through `taskCreationPipeline.createTaskFromFields`: the
same save, announcements and reminder booking `processAndCreateTask` uses for a parsed task. Never a
backend function, never `asServiceRole`.

**Never two.** `GoalStep.task_id` marks the step's task. Before making one, the sync claims the step
(`task_claim`), waits 1.5 s, reads it back, and goes on only if its claim stuck and the goal still
has no open task; afterwards, if another phone made one too, the later one is removed. A second open
task the sync made and nobody touched is removed; one the person changed is left alone. Before the
sync removes a duplicate it points the step away from it, so onTaskUpdate doesn't read the removal as
the person deleting their step's task.

**Finishing.** Finishing a plain step's task marks the step completed (onTaskUpdate — the only
backend code that touches goals: it UPDATES the owner's GoalStep, never creates anything — and the sync on
the next open for anything it missed, e.g. finished from an alarm). Un-finishing marks it back. The
next step's task appears on the next sync. Checking a step off on the goal page checks its task off
too. Un-checking a step on the goal page leaves its old task finished and moves the goal's open task
to the step that's now current.

**Deleting.** Deleting the step's task marks the step `task_dismissed` (onTaskUpdate, or the sync);
it isn't made again. The goal page shows "Add this step to my tasks" on that step.

**Pausing.** Pause puts the open task on the Back Burner (silenced, the task card's own switch) and
remembers it on the goal (`paused_task_ids`); Resume takes exactly those off it. A task parked by
hand stays parked. (Like any Back Burner task, finishing it later counts as a "rescue" in Insights.)

**Done.** "Mark goal done" checks the open task off without a next copy and unlinks it from its step
(the step isn't marked done, the tracker doesn't count it). A done goal never gets an open task;
Reopen brings the current step back. When the last step is finished there is no open task and the
Home card says "All N steps done"; the goal stays active until they mark it done (as in the Goals
app, which never closed goals itself).

**Home.** A compact card under Today's Focus for up to 2 active goals: title, "Step N of M: <step>",
a thin bar, tap → the goal; "+N more" → My Goals. "No steps yet" / "All N steps done" / "Starts
Nov 3 · …" when those apply.

**Who sees it.** `src/components/goals/goalsAccess.js` → `goalsEnabled(user)`: only s2kap2chick for now
(the menu item, the three pages — anyone else is sent Home — the Home card and the sync). The backend
functions only require a signed-in user, so opening Goals up is the one line in that file.

**Where it lives.**
- Entities: `Goal`, `GoalStep` (RLS: created_by = the user), `Task.goal_id` / `goal_step_id` /
  `goal_context`.
- Functions: `goalPlannerChat` (chat / extract_plan / apply_edit, and an admin-only `selftest` that
  returns a plan without saving), `createRemainingGoalSteps`; `shared/goalPlan.ts` (step dates).
  `onTaskUpdate` (`goalStepFollows`) and one line in `cronSmartTaskNudge`.
- Pages: `Goals` (/Goals), `Planner` (/Planner), `GoalDetail` (/goal/:id), routed in App.jsx; menu item
  under Tools in Layout.jsx.
- Components: `src/components/goals/` — goalsAccess, GoalsGate, goalsTheme, goalLogic, GoalStepSync,
  GoalHomeCard, StepDetailsModal, HabitWeekTracker, HabitCheckInModal, WeekCelebrationModal,
  MonthCelebrationModal.
- Task code: `taskCreationPipeline.createTaskFromFields`; `taskRecurrence` carries the goal fields to a
  habit's next copy.
- Deleting: a goal the person deletes goes with its steps and its open step task (the goal page says
  so). DeleteData / DeleteAccount list Goals.
