# PROJECT RULES — DO NOT VIOLATE

**READ THIS ENTIRE FILE BEFORE PROPOSING A FIX, NAMING A ROOT CAUSE, OR WRITING CODE.**
Not after. Not "if it seems relevant." First. Every conversation.
Most of the mistakes this file exists to prevent were not caused by the rules being
missing — they were caused by starting to talk before reading them.

## 0. CHANGE ONLY WHAT WAS ASKED — NEVER ADD BEHAVIOR NOBODY REQUESTED

**Sept 4 2026 a builder commit ("Force all-day tasks for silent shared items and prevent time prompts") was asked to STOP a prompt and instead invented a NEW one: ask "when?" for undated appointments. It sat unnoticed for 40 days, and on Oct 14 2026 a real user got four "when?" questions in a row and left the app.**

Rules that follow from it:
- Do exactly the requested change. No new carve-outs, exceptions, prompts, questions, rules, defaults or "while I'm here" behavior — in code OR in LLM prompts (`base44/shared/taskParsePrompt.ts` and every other prompt count as code).
- A request to REMOVE or REDUCE something must never ADD something. If a rewrite seems to need a new case, stop and ask Anna first.
- Never add anything that interrupts the user (a question, popup, dialog, extra notification) unless Anna explicitly asked for that exact interruption.
- In the final message, say plainly every behavior that changed. If anything beyond the ask changed, that is a bug — revert it.
- The app never asks "when?" or "how urgent?" when a task is captured (Anna, Oct 14 2026). Don't bring either back.

## 1. NO BASE44 LLM — EVER

**This is a hard, non-negotiable rule. Never call `base44.integrations.Core.InvokeLLM` or `base44.asServiceRole.integrations.Core.InvokeLLM` anywhere in this codebase — not in backend functions, not in frontend components, not in utilities. No exceptions.**

All LLM/AI calls must use the OpenAI SDK directly with the app's `OPENAI_API_KEY` environment variable.

**Backend (Deno) pattern:**
```ts
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
// lean(): explicit prompt caching (Oct 28 2026). Without it OpenAI bills every GPT-6
// call's whole prompt as a cache write at 1.25x and never reuses it. Same model,
// effort, words and answers; re-sends the call as written if OpenAI refuses.
const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'yourFunction' });
const completion = await openai.chat.completions.create({
  model: 'gpt-6-astra',   // the app's model (Anna asked for the newest model on Sept 17 2026; "Move them to astra like I already asked weeks ago", Oct 17 2026). gpt-6-luna (about 100x cheaper) ONLY where Anna OK'd it on Oct 18 2026 as not hurt by it: the calendar emoji, the daily tip, the AI-key check, voice-note notes (astra as backup) and the notes-would-help yes/no. Nothing else cheaper or older (no gpt-4o-mini, gpt-4o, gpt-5.4) without her say-so
  reasoning_effort: 'low',
  messages: [/* ... */],
});
```

gpt-6-astra is told the real date by OpenAI before your prompt, and it can trust that over a "today" you hand it. Anything that asks it to count from another moment (the parser reading words said earlier) has to say so in the system message as well as the prompt: on the parser self-test (Oct 17 2026) it counted "tomorrow" from the real date on 15 of 25 sentences until it did (`base44/shared/runTaskParse.ts`, saidNote).

**Frontend pattern** — call a backend function that uses OpenAI; do NOT call Base44's InvokeLLM from the client.

If you need to add AI/LLM functionality, use OpenAI only. If you are not sure whether something uses Base44's LLM, search the codebase for `InvokeLLM` before proceeding.

### Files that previously violated this rule (now fixed):
- `base44/functions/generateReminderSchedule/entry.ts`
- `base44/functions/generateDailyTip/entry.ts`
- `src/components/utils/birthdayScheduler.jsx`
- `src/components/utils/calendarEmojiResolver.js`
- `base44/shared/runTaskParse.ts` (moved to InvokeLLM on Sept 4 2026 without asking; back on OpenAI gpt-5.4 Sept 18 2026, tested side by side on the same inputs first)
- `base44/shared/captureToTasks.ts` (same)
- `base44/functions/readImageCapture/entry.ts` (same — photos go to the model as an image_url)
- `src/context/LaunchContext.jsx` (the timer's spoken lines, Oct 13 2026) and `src/components/places/ShiftImportButton.jsx` (the work-schedule photo/PDF reader, Sept 18 2026) used InvokeLLM; both go through `categorizeIdea` on OpenAI since Oct 17 2026

Why this rule exists, so nobody "improves" it away: InvokeLLM runs on Base44 integration credits. Base44's own docs say that when those run out, every call fails. Task entry must never depend on a shared credit pool.

Before finishing ANY task involving AI/LLM, run a codebase search for `InvokeLLM` to confirm zero results.

## 2. PUSH NOTIFICATIONS ARE DELIVERED BY EXTERNAL ID (USER EMAIL)

**When reasoning about, explaining, or debugging notifications: this app delivers by EXTERNAL ID — the user's email. Devices register through `OneSignal.login(email)`, so the email IS the OneSignal external id. Never claim notifications are targeted by player id, and never conclude a user "has no registered device" because `onesignal_player_ids` is empty — that field is incidental, not the delivery mechanism.**

```ts
payload.include_external_user_ids = [userEmail];
```

As of 2026-09-17 EVERY sender targets by external id only. The legacy `include_player_ids` branches in `sendOneSignalPush`, `cronDailyDigest`, `cronCommuteWatch` and the two direct pushes in `cronRefillReminders` were removed at Anna's explicit request. `notifySend` is switched OFF on purpose: it answers `{ success: false, disabled: true }` and sends nothing, so achievement, partner-request, chat-message and challenge pushes stay off — they had been silent for ~11 months and Anna chose to keep them that way.

**Do not bring a player-id branch back, and do not turn `notifySend` back on, unless Anna explicitly asks.** The app still SAVES `onesignal_player_ids` on the user; nothing uses it to target a push (only the `checkMyOneSignalStatus` diagnostic reads it).

## 3. NOTIFICATION SENDERS THAT ACTUALLY EXIST

Do not describe, revive, or reference removed crons. The live senders are:

| Sender | Trigger | Role |
|---|---|---|
| `cronRefillReminders` | hourly | Books recurring-task pushes, writes the reminder plan for one-time tasks dated more than ~30 days out, promotes planned event/birthday reminders into OneSignal's ~30-day window, yearly birthday rollover, repeating-task rollover (a task not checked off by 4 AM their time moves on to the next day, with its reminders, when it repeats again the very next day: every day, weekdays Mon–Thu, Saturday into Sunday; one with a gap before its next day (weekly, monthly, Friday to Monday) stays until checked off and the app makes the next copy then; a repeating event moves on to its next date once it has happened; Anna, Oct 17–18 2026), day-of birthday text follow-ups ("Write a text for X" / "Text X!") every 3 hours until the text is sent or the birthday is checked done (Anna, Oct 29 2026: "once every 3 hours"; they were hourly). Those follow-ups replace the plain "It's X's birthday today!" for a person's birthday (`textCoversTheDay`, same rule in the client's birthdayScheduler; one already booked is cancelled by the cron): Tricia got "Write a text for Twins" at 8:00, the birthday at 9:00 and "Write a text" again at 9:15. A pet's birthday, your own, and a text already sent keep the day-of reminder |
| `cronSmartTaskNudge` | every 10 min | Smart Reminders, which covers nearly every task. The AI picks only each person's NEXT nudge, the run sends it when due, then the AI looks again. Never a day booked ahead: see §10 before touching it |
| `cronDailyDigest` | every 30 min | One morning summary per user after quiet hours end (none while Smart Reminders has them paused for a week away). Also the evening check-in push, "How did you feel today?" / "Tap to check in and save one win, big or small." (Anna, Oct 30–31 2026): once a day in the hour before their quiet hours start (9 PM with quiet hours off), phone accounts only, not on their first day, not when away a week or paused, not when a `Win` OR a `DayMood` is already saved for today (their calendar day, or the evening it belongs to when their evening runs past midnight; either check failing = no push), claimed per day with `win_ask_date`, never stacked (ledger kind `motivation`). Data `{ type: 'win_ask' }` opens the box with the mood faces and the win |
| `cronCommuteWatch` | every 5 min (since Oct 17 2026; was 15) | Work: "Time to leave" + traffic heads-up. Events: re-checks each booked "leave now" on live traffic for its last 3 hours (every 15 min, then every run for the last 30), moves it earlier (never later) when traffic is worse, and updates its drive-time words before it goes (Anna, Oct 17 2026: live traffic, not a one-time forecast). Both: for 30 min after a "leave now", one plain "traffic got worse, you may get there around X" push if they would now be 5+ min late. Google measurements stay every 15 min when nothing is close, since Google bills each one |
| `onTaskUpdate` | Task entity events | Cancels / re-books on complete, delete, back-burner, un-complete, reminder-field edits. Leaves a snoozed task and a task in Focus Mode alone |
| `cronDuplicateWatch` | hourly | Cleans duplicates, emails the owner — sends no user pushes |
| `schedulePush` | called by the above | The actual OneSignal call (`notifySend` is switched off — see §2) |

`cronTaskReminders` sends NOTHING — it only advances `next_reminder` bookkeeping. Never describe it as a notification sender.

**Deleted (Sept 2026) — do not re-add, do not revive, do not "repair":** `cronSmartMotivation` (7 PM check-in), `cronWeeklyRecap`, `cronTrialWarnings`, `testSmartMotivation`. These had sent nothing for ~11 months and are not wanted. Dead stays dead.

### Cleanup rule
Removing dead code must NEVER change what a user sees or receives. If a cleanup task would alter live notification behavior, stop and ask first.

## 4. HARD RULES — THINGS THAT MUST NEVER HAPPEN

These are absolutes. There is no clever exception, no "but in this case."

1. **Never target a push by player ID.** External User ID (email) only. Never gate a
   send on `onesignal_player_ids` being non-empty, and never conclude a user has no
   device because that field is empty. (See §2.)
2. **Never auto-create a recurring task.** Not from the parser, not from calendar sync,
   not from a rescan. A task is only recurring if the user explicitly said so.
   `stripGuessedRecurrence` (client) and the shared recurrence backstop (server) exist
   for exactly this — use them, don't reinvent them.
3. **Never let a recurring reminder inherit its creation timestamp.** A recurring task's
   reminder time must be constrained to a daytime hour AT THE POINT OF CREATION. A task
   created at 2:57 AM must not fire at 2:57 AM forever.
4. **Quiet hours default to ON.** A profile that has never touched the setting gets the
   overnight window written in. `undefined` must never read as "off."
5. **Never ask permission to clean up.** If data is broken, stale, orphaned, or
   duplicated — fix it. Don't describe it and wait. Anna's words: "DUH. You are supposed
   to clean it all." The only exception is the §3 cleanup rule: if the cleanup would
   change what a real user sees or receives, stop and ask.
6. **Never report a notification as live, orphaned, or duplicated without querying the
   OneSignal API for that specific ID.** A cron logging a failure is not proof of
   user-facing breakage. Check before claiming.
7. **Never productivity-shame the user in app copy**, and never advertise a capability
   the app doesn't actually have. **Keep app copy short** (Anna, Oct 27 2026: "the sheer
   length of some instructions can be overwhelming"): a description or help line says the
   one thing the person needs, in about 20 words or fewer; no second sentence restating the
   first, no "actually", no selling. The Oct 27 2026 sweep shortened the App Guide, the
   first-sitting popups, Settings, Focus Mode, Places, Calendar, Notes and the reminder-type
   help; new copy follows the same bar.
8. **Never state anything about a real user, their data, or app behavior as fact unless
   it was actually looked up THIS session** — the entity queried, the log read, the
   OneSignal API called, the file opened. No inferring "she must have", "this was her
   first open", "that fired at X" from context or plausibility. If it wasn't checked,
   either check it or say plainly "I'm guessing — I'd have to look." An answer that
   sounds confident and was never verified costs Anna more than a slow one: she then has
   to disprove it. Opinions are fine, labeled as opinions. Invented facts are not.
9. **The app talks to Base44 at base44.app, never through its own domain.**
   `src/api/base44Client.js` passes `serverUrl` from app-params (https://base44.app, or
   the preview host the editor passes in). Never set it to `''`: that means "whatever
   domain the app was opened on", and adhdone.space sits behind Cloudflare's proxy, which
   answers a backend function's own calls back into Base44 with a bot check (HTTP 403,
   "Just a moment"). That took down every function the app calls from Sept 18 to Sept 20
   2026 — calendar connect and sync, motivation, emoji, push status, player ID. A function
   that an outside service reaches through adhdone.space directly (Google's OAuth redirect
   into `googleCalendarCallback`, webhooks) must build its client with
   `createClientFromRequest(platformRequest(req))` from `base44/shared/sdkRetry.ts` for the
   same reason. And: saving a backend function in the editor only updates the PREVIEW
   version; the live app runs the PUBLISHED version, so a backend change is not on Anna's
   phone until Publish.

## 5. ALREADY BUILT — DO NOT PRESENT THESE AS NEW

The failure here is not only rebuilding. It is **announcing an existing feature as if it
were a new idea** — "let me add idempotency to calendar sync," "I'll build a dedupe
ledger," "we should track scheduling races." Anna has already paid for these, in credits
and in time. Presenting them as new is the same insult whether or not code gets written.

Before proposing ANY mechanism below, assume it exists and go read it.

| Mechanism | Where it lives | What it already does |
|---|---|---|
| Push deduplication / anti-stacking | `NotificationLedger` entity + `base44/shared/sendLedger.ts` | Blocks duplicate and stacked pushes (a soft push keeps 20 minutes either side of any other push, 5 for an urgent task), evicts proactive sends for time-critical ones. Since Oct 27 2026 the owner's own health notes (`owner_*`) don't hold a nudge, and a Smart Reminders nudge held more than 30 minutes past its planned time is dropped and planned again rather than sent stale (`HELD_STALE_MS` in cronSmartTaskNudge): Anna's "reschedule Peach's appointment this morning, before Mom's discharge at 10", planned for 9:15 AM, was held by the 9:00 reminder, her 9:21 health note and the 10:00 reminder's window and rang at 10:29 |
| A time change cancels every booking, including ones still on their way | `bookedIdsForTask` (reminderScheduler.jsx) used by the Home card, the details card and `moveRemindersToDate`; `bookedForAMovedTask` in `shared/captureToTasks.ts` | Oct 29 2026 (Tricia, a new user: "Remind me tomorrow at 9am" from the welcome chat, moved to 7 AM on the card a minute later; both went off, the 9 AM one in the same minute as a birthday, which raised the "two pushes in the same minute" alert). A captured task's first reminder is booked on the server and saved on the task up to a minute later, so the card's copy had no ids to cancel. Now the card also cancels what the ledger says is booked for the task (task_reminder, task_checkin, event_reminder; never Focus Mode, birthday or Smart Reminders pushes), and the server, before saving what it booked, checks the task still has the time it booked for; if it moved, was finished or was deleted, its bookings are cancelled and nothing is saved over the card's plan |
| An event's "It's time" rings one minute before it starts | `generateReminderSchedule` (0 becomes 1 for a timed event), `shared/eventReminderPlan.ts`, `multiReminderScheduler.resolveReminderTimes` (plans cached on the phone too), `onTaskUpdate` (un-checked event), `cronRefillReminders` (rescue booking); "is this the start?" checks (`isTimeTheySet` both copies, `widgetBridge.ringsOutLoud`, the plan's at-start cap) allow 90 seconds | Oct 29 2026 (Anna: "The 'it's time!' notification and alarm should be changed to ring exactly one minute before an event"). Timed events only; a task with its own time still rings at that minute, and an all-day event keeps its morning-of. Reminders already booked before this keep their minute until the event is moved or re-planned |
| Reminders ring on time without "Alarms & reminders" access | `AlarmScheduler.takeOverLateAlarm` + `PushFilter` (build 43 on) | Oct 29 2026 (Anna: "You better make them exact"). Android 14 doesn't give a fresh install the exact-alarm access, and Play only auto-grants `USE_EXACT_ALARM` to alarm-clock/timer and calendar apps, so most new users' phone alarms are booked inexactly (up to ~10 minutes late). The push for the same reminder is sent by OneSignal at the minute; the phone used to keep it quiet because its own alarm "covered" it. Now, without that access, an on-time push whose alarm hasn't rung yet rings itself and retires the late alarm, so it's on time and rings once. With the access, nothing changes. `USE_EXACT_ALARM` was declared for build 44 and taken out again for build 45 (Nov 1 2026, Anna: "If this is only 'fixing' the permission thing... we don't need it"): the app already asks for "Alarms & reminders" when alarms are set up, every Android alarm user had it on (User.alarm_permissions.exact_alarms, checked Nov 1), and it slowed the Play review. Don't add it back unless alarm users are found without the access |
| Calendar import idempotency | `Task.google_event_id` | One imported Google event = one task, per user, across overlapping syncs |
| Phone calendar sync | `src/lib/calendarSync.js` + `syncGoogleCalendar` (source `device`) + `CalendarSyncWorker` (phone, build 43 on) | The ticked phone calendars come in on their own (Anna, Oct 19 2026: "calendar still doesn't sync on it's own"; before, only on app open, at most every 6 hours). Build 43 on: the phone watches its calendar provider and sends the rows itself with the app closed (`CalendarBridge.setSyncCalendars` tells it which calendars on every open and tick; an empty read is held 6 hours before it's believed). Older builds: the app reads them on every open and every return to the app, at most every 10 minutes. An event moved in the calendar gets its reminders re-planned for the new time (one-time events that still have reminders), and its phone alarms are pushed right away |
| Double bookings and duplicates | `base44/shared/eventConflicts.ts` (the one checker) + `checkEventConflicts` + `src/components/utils/eventConflicts.js` + `src/components/shared/EventConflictWarning.jsx`; flags on `User.event_flags` | ONE feature, however the event got here (Anna, Oct 23 2026: "consolidate the september 14th thing, yesterday, and today"): added in the app (`taskCreationPipeline`), moved to a new time in the app (TaskDetailsModal), or imported or moved by a calendar sync (`syncGoogleCalendar` calls the checker at the end of each run). An overlap (two timed events starting within an hour) is only TOLD: a popup with Got it / Open the event; the app changes nothing on its own. A likely duplicate (same day, close in time, the model judges them the same thing; birthdays only against birthdays) gets a popup to combine them, picking which name, time, notes and place to keep, or keep both. Each pair is a flag on their account, asked about once in 30 days; a flag not seen within 15 minutes goes out as ONE normal notification (outside quiet hours), cancelled the moment the popup is on screen. Owner's dashboard: `{"email": "…", "dryRun": true}` to `checkEventConflicts` shows what would be flagged for someone; without dryRun it flags and books. Self-tested Oct 23 2026: 10 pairs, 9 as expected (a bare "Dentist" at the same minute as "Emma dentist cleaning" was called the same; a popup, so one tap says otherwise). Sep 14 2026 it covered only events added in the app and nobody checked for it on Oct 22 when the idea came up again |
| Capture idempotency | `Task.capture_id` | Native share-sheet retries can't double-create |
| Creator/cron race protection | `Task.reminder_scheduling_since` + `commitNotificationIds` | Refill cron stays out while the creator is still booking |
| Per-user sync locking | `calendar_sync_in_progress_since` + heartbeat | One active Google Calendar sync per account |
| Guessed-recurrence stripping | `stripGuessedRecurrence` in `taskSchedule.js` | Kills recurrence the user never asked for |
| Quiet hours | `base44/shared/quietHours.ts` + `applyQuietHours` + `checkQuietHoursFit` | Timezone-aware overnight suppression. `checkQuietHoursFit` (astra) judges from what someone told the app about themselves, their quiet hours and their work hours whether their quiet hours miss when they sleep, and the quiet-hours popup (QuietHoursReviewPrompt) then asks them once to set ones that fit (Anna, Oct 18 2026: "If someone says they work the night shift, prompt them to make new quiet hours"). When their quiet hours are still the starting 10 PM–8 AM and the model is clear about when they sleep, it moves them right away and the popup tells them, with the new hours ready to change (Anna, Oct 19 2026: what someone tells the app about themselves has to be acted on; Michelle said "i work night shift", kept 10 PM–8 AM, got alarms in her sleep and uninstalled). Hours they set to anything else are never moved. When the model thinks they don't fit but can't say when the person sleeps, nobody is asked (Oct 19 2026: Tabby, who set 3 AM–10 AM herself, was asked with nothing to suggest); Anna's alert says so instead (`ownerHealthCheck`, check 9). `{"previewEmail": "…"}` from the owner's account judges someone without saving |
| Far-future scheduling | `base44/shared/eventReminderPlan.ts` + `planned_` placeholder entries, promoted by `cronRefillReminders` | OneSignal can't book past ~30 days; the plan is saved with placeholders and booked once inside the window. Used by calendar import AND by the hourly job for far-out tasks made in the app. `Task.reminder_plan_built_at` = the server wrote this task's plan once; never rebuild it (an empty plan can be the user's own choice) |
| Refused bookings | `Task.reminder_retry_after` | When OneSignal refuses (device not subscribed) the hourly job stops at the first refusal, never marks the task "covered", skips that owner for the run and waits 2 hours |
| Reading whole tables | `base44/shared/listAll.ts` (`listAll`, `filterAll`) | `list()`/`filter()` return only 50 rows by default. Any job that needs every row pages through here |
| Daytime anchor (hard rule 3) | `anchorToDaytime` in `base44/shared/quietHours.ts` and `src/components/utils/taskSchedule.js` | A daily / every-other-day reminder first booked overnight is pinned to the 9 AM hour. Shorter intervals and running schedules are left alone |
| Lost-capture recovery | `src/lib/pendingCaptures.js` + `TaskCaptureProcessor` | The in-app capture queue is mirrored to localStorage and finished on the next app open by the same account. Owner-stamped, heartbeat, per-part progress, no double-create |
| Snooze | `src/components/utils/snoozeTask.js` | Shared by the Tasks page and the notification screen (the "Did you do it?" popup has its own, working, handler). Books one push, never sets `status: 'snoozed'` |
| Focus Mode check-ins | `Task.focus_mode_notification_ids` | Kept apart from a task's own reminders so leaving Focus Mode cancels only the check-ins and never invents an interval |
| Reminder interval decision | `base44/shared/reminderIntervalDecision.ts` | The single place interval classification happens |
| Server-side task parsing | `base44/shared/runTaskParse.ts` + `taskParsePrompt.ts` | One parser. Never add a second one (native-side parsing was tried and rejected) |
| On-screen messages (toasts) | `toast` from `src/components/ui/use-toast` + the `<Toaster />` in `src/App.jsx` | The ONLY toast system that is on screen. Every toast closes itself after 4 s and always has an X, and the container sits below the phone's status bar. `import { toast } from "sonner"` shows NOTHING — sonner is not mounted; never use it |
| Notifications-off notice | `src/components/home/NotificationsOffBanner.jsx` + `myPushStatus` function | One row on Home, phone app only, shown when OneSignal reports no switched-on Android subscription for the signed-in user. Not dismissable on purpose; "Turn on" calls `NotifyBridge.requestPermission()`. Newer app builds answer from the phone via `NotifyBridge.getPermissionState()` |
| Smart Reminders brief | `base44/shared/reminderBrief.ts` (word-for-word copy of Anna's "Reminder Brain — The Brief" doc) | The AI's whole instructions for Smart Reminders, every account since Oct 10 2026. It is shown facts only, plus Anna's own put-off rule (§10, point 4). A plan made under any other copy is dropped and redone. `{"email": "…", "preview": true}` to `cronSmartTaskNudge` shows what it was given and what it chose, saving and sending nothing. Changes only together with Anna's doc (§10) |
| Who may book a push | caller check inside `schedulePush` | Backend callers prove themselves with `internalKey` (the CRON_SECRET secret); a signed-in user may book only for their own email. Watch-only (logs, blocks nothing) until `ENFORCE_CALLER_CHECK` is flipped to true |
| "Notice when I wake up" (when they're up) | Phone: `WakeWatch.firstUnlockToday` + `WakeWatchWorker` (native, every 15 min); server: `wakeStartMs` in `base44/shared/quietHours.ts`; `User.wake_watch` / `woke_at` | Nothing before quiet hours end counts, on the phone and on the server (Anna, Oct 12 2026; Nov 1 2026: "if they do anything before their quiet hours, still wait for quiet hours to end at least"): someone already on the phone when quiet hours end is up from that end, never earlier. From build 46 (1.3.23) a quick look doesn't count either (Anna, Nov 1 2026: "I wish that opening to cancel an alarm or to check the time wouldn't count"; her phone had reported 8:01 AM, a minute after her quiet hours ended): the phone has to stay unlocked with the screen on for 2 minutes in one go, with something other than ADHDone's alarm screen or the phone's clock app in front (the clock app is found through `AlarmClock.ACTION_SHOW_ALARMS`, declared under `<queries>` in the manifest); it reports when that stretch started. Builds 39–45 count the first unlock after quiet hours end, however short. Android 8 and older (no lock-screen events) keep the first app other than the alarm screen. Opening ADHDone or answering a reminder still counts on the server (`day_first_sign_at`, `last_active_at`), never before quiet hours end |
| "This is what a reminder looks like" sample push | `bookFirstWinDemo` (server), `src/components/shared/QuickCapturePrompt.jsx` (`bookFirstWinDemo`, the `adhdone:first-win-planned` and `adhdone:push-linked` listeners), `WelcomeChat.captureTask`, `User.first_win_demo` | Since Nov 1 2026 the server books it (Anna, "yes" to "book the sample from the server the moment the first to-do saves, so closing the app can't lose it"). Caterina closed the app 7 seconds after her welcome to-do saved; the phone booked it after a pause and only once linked for pushes, and a phone in the background stops running the app's code, so it never went out (it was then sent by hand from the editor, Nov 1 2026, 6:40 PM). The phone hands it to the server the moment it's planned (welcome to-do, or a new account's first to-do from anywhere else, phone app only); the server tries over about a minute while the phone's link settles (OneSignal answers "All included players are not subscribed" until then), books it 3 minutes after the to-do, never under 90 seconds out, never more than 15 minutes late, inside quiet hours too (§9 Q4). Once per account (`first_win_demo`; a second call gets the one booked). Accounts under 2 days old only. Picking full-screen alarms before it rings still re-books it as an alarm from the phone (`ringFirstWinDemo`). Self-test: `{"selftest": true, "title": "…", "body": "…"}` from the owner's account (no phone linked, so every try is refused and listed in `tries`) |
| Welcome chat and the about-you question | `src/components/onboarding/welcomeScript.js`, `WelcomeChat.jsx`, `WelcomeDialog.jsx`, `CatchUpDialog.jsx`, `catchUpScript.js` | The welcome is: hello, name, "What's one thing you keep forgetting that you could knock out today?" (since Nov 2 2026, so the first real reminder can land on something they can check off; "tomorrow" from 9 PM on; the when buttons still offer tomorrow), when (3 taps; skipped when the task already says when), notifications, then since Nov 1 2026 the about-you question LAST (optional, Skip), then "You're set". From Sep 29 to Nov 1 2026 the about-you question waited for the first checked-off task and came on a later open; 3 of 16 new accounts ever got it, and someone on night shifts had nowhere to say so (Anna, Nov 1 2026: "someone with a night shift would have nowhere to put that"; "Idk if taking away that question even helped really"). An answer is saved at once and their quiet hours follow it (`checkQuietHoursFit`). Reaching the question counts as asked (`onboarding_catchup_done`, set by WelcomeChat when the beat comes up), so it is never asked twice. Anyone who finished the welcome without it (or closed it before that question) gets it from `CatchUpDialog` on a LATER app open, once the screen is calm, no checked-off task needed; a checked-off task only changes its opening line ("First one done"). Never on an open where another popup already showed (`popupsShownThisLaunch` in `onboardingSurface.js`: the missed-reminder popup, "What's next?", "Every day around this time?", the update card), so no open stacks two asks back to back. Never more than once |
| First-time help | `src/components/onboarding/PageIntroTour.jsx` + `pageIntros.js` (one card the first time a page is opened: Calendar, Pomodoro Timer, Parking Lot, Birthdays), `FirstUseDialog.jsx` (features behind a button: Focus Mode, Quick Capture), `src/components/shared/AppGuideModal.jsx` (the App Guide in the menu, red dot + pulse until opened) | "A quick how-to when someone opens a feature for the first time" already exists; don't propose it as new. Home has no card on purpose (the welcome chat is the intro) and the Tasks 4-video walkthrough is switched off (`ADD_PATHS_WALKTHROUGH_ON`, lives in the App Guide). Since Oct 24 2026 the guide is a table of contents: every section starts closed (one short row each, so the whole list fits on a phone screen with nothing open; tap a row to open it, videos load only then; reopening the guide starts closed again), and the first row is "Start here": how to add something (task, event, birthday or Parking Lot idea, sorted on its own), alarm vs notification (links to `/settings?section=reminders#alarms`), and how to find the guide again. The rows mirror the side menu: Home; Tasks (nested: Adding tasks is easy — with each way to add (Say it, Share selected text, Share a screenshot, widget, pinned notification) its own nested row since Oct 27 2026, so one video shows at a time — Task Timer, Focus Mode); Calendar; Birthdays; Tools (Pomodoro Timer, Parking Lot, Record Notes where the recorder exists; Decision Maker left Nov 2 2026); Reflect (Support Space, Insights; Diary left Oct 31 2026); Settings (Themes, Quiet Hours, Places — since Nov 2 2026, with an "Open Places in Settings" link). Nested rows open and close on their own. Flags on `User.onboarding_flags` (`tour_seen_v4_<Page>`, `onboarding_guide_seen`) say what a person has seen |
| "Saved to your Parking Lot" notice | `src/components/tasks/IdeaSavedNotice.jsx`, the `idea-saved` event from `taskCreationPipeline.processAndCreateTask` | Since Nov 2 2026 (Anna: "Yeah.." to the fix; Michael typed "Somatic Work" Nov 1, it went to the Parking Lot with a 1.5-second toast, he looked on Tasks, went back to Add Task, and left). One plain idea typed in the app gets a notice near the bottom of the screen, above the Pomodoro bar, showing their words and "Make it a task". It stays until they tap that or the X, change pages, open a popup themselves, or leave the app. It takes its turn with `usePopupTurn` (reactive) and holds the screen while up, so it never stacks with a popup. "Make it a task" is the same path as the Parking Lot page's convert (`converted_to_task: true`, then `enqueueCapture` with `fromIdea`), so a failed parse puts the idea back. It asks nothing and blocks nothing, which keeps "adding a task never asks a question". A list, a reading logged onto a tracker, or an idea added while already on the Parking Lot page keeps the 1.5-second toast. App feedback keeps its own toast. Counted in AppEvent `idea_notice` (`props.action`: shown, closed, make_task) |
| Parking Lot trackers | `ParkingLotIdea.tracker` + `tracker_entries [{at, text, note?}]` + `tracker_companions`; all UI in `src/pages/ParkingLot.jsx` (History dialog, `addTrackerEntry`, `setTrackerEntryNote`, `removeTrackerEntry`) | Readings said together (blood pressure + heart rate) are one record and one chart; a note said with the reading rides on its entry and shows under it and on its chart dot. Since Oct 24 2026 a note can be added to a reading after the fact, or changed, from the History list ("Add a note" / "Edit note" under each record, edited in place, no second popup); an empty note takes it off. A tracker is only ever made after the "Keep track of …?" popup |
| Recorded notes (Record Notes) | `base44/functions/transcribeAudioNew/entry.ts` (`notes_make`, `fillGaps`, `notes_fill`, `notes_ask_one`, admin `notes_try`), page `src/pages/InstallInstructions.jsx` (the Notes page) | Notes are written by Astra at medium effort (Oct 27 2026; Luna had them from Oct 18 and left things out), under a prompt that says to leave nothing out, with list caps big enough for a long visit (60 to-dos, 100 details, 40 sections × 25 points), and then a SECOND READ of the transcript against the notes that adds whatever was missed (`fillGaps`, merged by meaning, nothing already there touched). The same second read runs on request from a recording's page ("Check the transcript for anything these notes missed", `notes_fill`) for notes made earlier. Every recording's page has "Ask this recording" (`notes_ask_one`): the whole transcript (follow-ups included) is read, the answer comes with the speaker's exact words, and each quote is checked against the transcript word for word before it's shown (a reworded or invented one is dropped). Self-test: admin `{mode:"notes_try", transcript, model?}` returns the notes plus `second_read_added`; `{mode:"notes_try", transcript, question}` runs the ask. Tested Oct 27 2026 on a 13-minute doctor-visit transcript: every number, dose, name, date and instruction present, second read added 0; ask answered with two verbatim quotes and said plainly when a topic never came up |
| Duplicate a task or event | `src/components/utils/duplicateTask.js` + the Duplicate link on the details card (`TaskDetailsModal`, not on birthdays or steps); the Tasks page opens `?taskId=` | Since Oct 25 2026. The copy keeps what the task is (title, notes, place, kind, urgency, repeat pattern, alert style, pictures, its steps unchecked) and nothing about when or what was booked: no date, time, reminders, plan, calendar row or capture id. It opens on its own card, where picking the date or time books reminders through the card's normal path; a copied task with no date is a Smart Reminders task like any other, a copied event waits for its date. Never create the copy's reminders any other way |
| Seasonal-theme secret ("what's this? 👀") | `src/components/home/HomeSecretLink.jsx` (`SECRET_SPOTS`, `secretSpotToday`), mounted once per spot: WelcomeCard, QuickActions (beside the per-row switch), TodaysTasks (top of Today's Focus), DailyTipCard, Layout (under the Home page) | Since Oct 27 2026 it stays on Home and sits in a different one of five spots each day, picked from the date (Anna: "change its position on the home screen every day"); before, it wandered page to page at the very bottom, where a one-minute visit never scrolled, and only Tabitha found it in the week it was pinned to Today's Focus. Found once (seasonal_unlocked), it's gone for good |
| Task page sections remember open/closed | `src/components/tasks/TaskSections.jsx` (`tasks_sections_collapsed` on the phone) | Since Oct 27 2026 (Anna: "if someone has upcoming and other things collapsed or expanded on their tasks page, make sure it stays that way"). Named sections (Today, Tomorrow, Next 7 Days, Upcoming, Later, Birthdays, Back Burner) keep the state they were left in; Back Burner, Birthdays and an empty day start closed, the rest open; one tap opens a closed-by-default section (it used to take two). Days-view day sections have daily keys and start from the defaults |
| Priority is tappable on the collapsed card | `TaskCard.jsx` (the priority pill is a Popover trigger) | Since Oct 27 2026 (Anna: "change the priority by just clicking on it"); the same picker the opened card has |
| Tag pills on dark themes and seasonal skins | `LifeAreaPill.jsx` `TAG_PALETTE[].dark` (solid 600 fill, white text) | Since Oct 27 2026: a filled label like the light theme's, not coloured text; the 600 shades and text-white are ones the night-season glass leaves alone |
| Calendar month cells | `CalendarGrid.jsx` (`CHIP_COLORS`, inline colours) | Since Oct 27 2026 (Anna: her phone's calendar widget "fits more words"): no cell borders or inner padding, hairline gaps, 10px filled chips with inline colours the seasonal glass can't rewrite (it had turned them into plain coloured text on Halloween), cancelled items last. Dots instead of words were proposed and rejected ("I disagree... it fits more words") |
| Support Space (the AI chat) | `src/pages/SupportSpace.jsx`, its menu row in `src/Layout.jsx` (Reflect), `homeShortcuts.js` (tile), `AppGuideModal.jsx`, `appFeatureGuide.js` (what the chat's AI knows about the app), `brandData.js`, `pressKitData.js` | Its name is Support Space, everywhere. Base44's builder renamed it "Talk It Out" on Sep 10 2026; Anna, Nov 1 2026: "let's name talk it out back to Support Space". The same day `appFeatureGuide.js` stopped describing things that aren't there (accountability partners, partner chat, Focus Rooms, a Google Calendar connect step, the old 5/10/15-minute countdown timer, Scheduled Texts, achievements and weekly challenges); it must describe only what the app does today. Scheduled Texts: the dialog that makes one (`ScheduledTextDialog`) is only reachable from `ScheduledTextsList`, which no page shows, and no ScheduledText has ever been saved, so the brand page and press kit stopped offering it too (and say "Phone calendar sync", not "Google Calendar sync"). Achievements: `checkAndAwardAchievements` still saves Achievement rows when a task is checked off, but nothing shows them (`AchievementsCard`, `WeeklyChallenges` are on no page) |
| Home shortcuts | `src/components/home/homeShortcuts.js` (the list and the save), `src/components/home/QuickActions.jsx` (the tiles and the "Add a shortcut" / "Edit shortcuts" picker under them), `User.home_tiles` | Since Oct 27 2026 (Anna: "if someone uses record notes often, they can add a tile"). Add is the only fixed tile; the saved list is everything after it. The default row is Timer + Focus Mode, each removable like any other (Anna: "give them the ability to get rid of timer"). The welcome card's row of small circles (Focus Mode, Pomodoro, Decisions, Parking Lot) came off Oct 27 2026 ("now that I have made shortcuts, we don't really need the spot"; `FocusModeButton.jsx` and `QuickToolButtons.jsx` deleted) — a running Focus Mode still shows its own bar (FocusModePrompt). Focus Mode's tile fires the `open-focus-prompt` event rather than opening a page. Any menu page can be a tile: Record Notes (only where the recorder exists), My Tasks, Calendar, Birthdays, Parking Lot, Pomodoro Timer, Support Space, Insights, Settings (no Diary since Oct 31 2026, no Decision Maker or Places since Nov 2 2026; a saved tile for any of them is dropped). Same look as Add, two to a row, in the saved order; the picker lists the row with up/down arrows and ×, then the rest under "Add a tile" (Anna, Oct 27 2026: "let users reorder them around"). Add alone goes full width. A tiny switch beside Edit shortcuts cycles tiles per row 2 → 3 → 4 (`User.home_tile_cols`, phone copy first; smaller padding, icon and label at 3 and 4). Saved on the phone and the account, phone's copy first (the task_sort rule). Don't add a tile for anyone, and don't make one show by default |
| Which tools stay, which hid, where Places lives | `src/Layout.jsx` (menu), `homeShortcuts.js`, `AppGuideModal.jsx`, `appFeatureGuide.js`, `src/pages/Settings.jsx` (`?section=places`), `src/components/places/PlacesSection.jsx`, `src/pages/Places.jsx` (redirect) | Nov 2 2026. Anna uses these herself and they stay, whatever the usage numbers say ("I made this app primarily for myself at first, so I'm not deleting things I use"): Pomodoro Timer, the task timer (Time it / Home Timer), Support Space, Record Notes ("I'm going to keep record notes forever"), Insights. Don't propose retiring them. The menu item is "Pomodoro Timer" (the page, `FocusTimer`, already said so; Anna: "rename focus timer to Pomodoro timer"). Decision Maker is hidden ("we can hide the decision maker": 6 people opened it since Sep 18, nobody used it): off the menu, the tile list, the App Guide and the AI's app guide; the page and `/DecisionMaker` route are kept. Places is a Settings section (`/settings?section=places`, a row in the Account list under Reminders), with the same cards it had; `/Places` redirects there, so the commute push (`data.screen: '/Places'`) and old links still land on it; the home circle left Personalization (`HomeZipCard` unused) and lives only there; `HomeZipPrompt` sends people there and says "Settings → Places" |
| Pointing people to Places | `src/pages/Settings.jsx` (Reminders: a "Work hours or shifts?" line with Open Places under Quiet Hours, `/settings?section=places#work-hours`), `src/components/onboarding/WelcomeChat.jsx` (`offerWork`), `checkQuietHoursFit` (`has_set_hours` → `offer_work_hours`), `HomeZipPrompt.jsx` | Nov 2 2026 (Anna: "I think idea 1 and 2 sound good"). Idea 2: the line under Quiet Hours shows to everyone and only links. Idea 1: after the about-you answer (welcome chat or catch-up, same component), `checkQuietHoursFit` — the call that already reads that answer — also judges (gpt-6-astra, judgment, no word lists) whether they have a job, shifts, classes or another commitment with regular hours; when yes and no work hours are saved, "Add my work hours" shows under the last line (a box with a button, not a popup), and tapping it closes the chat and opens Places at the schedule card. Self-test: admin `{"tryAbout": "..."}` judges a made-up text and saves nothing. Tested Nov 2 2026, 8 of 8 as intended: night-shift nurse, 7pm-7am hospital nights (quiet hours suggested 8 AM-4 PM), 9-to-5 bank job and college classes → offer; retired gardener, weekend bar gigs, stay-at-home parent, hobbies only → no offer; the quiet-hours answers were unchanged in kind. AppEvent `work_hours_offer` (shown / open). The home-base popup (`HomeZipPrompt`, first errand) is counted since Nov 2 2026 as AppEvent `home_prompt` (shown / home_saved / not_now / add_work); before that only an answer left a mark (`home_zip_prompt_seen_v2`: 5 real people) |
| Smart Reminders on someone's second day (EARLY DAYS) | `cronSmartTaskNudge` (`earlyDays` in the plan context, the EARLY DAYS line in `briefData`) | Nov 2 2026, Anna's yes, in her words: "your suggestion sounds good" to "someone who joined in the last 3 days and hasn't been back should get one well-timed mention today, aimed at getting them to open the app and finish one small thing". That day the planner had left Jordan (an undated task), Connie and Caterina (9 AM reminders that went out unanswered) alone on their second day: no deadline, "no cost of waiting", the reminder already went out. EARLY DAYS = joined under 3 days ago, past their first day (their own day), and not opened since that first day; it then replaces NEW HERE (which goes by "the last 24 hours" and was telling the planner "they joined ADHDone today" on a second morning). Their own unanswered reminder doesn't count as the mention. Preview Nov 2 2026, all three: one mention right away, each a small first step ("start with one call", "open one job listing", "one short take"). Owner Test Function `{"email": "...", "replan": true}` plans one person again right now and saves it (the scheduled runs send it); used that day for those three |
| Smart Reminders look again at least every 3 hours | `nextLookIso` in `cronSmartTaskNudge` (`LOOK_MAX_AWAKE_MIN`) | Nov 2 2026 (Anna: "at minimum, it should check every 3 hours"). The planner picks its own look-again time (15 minutes to a day); at 8:09 AM it gave Jordan's undated task a look at 6 PM, so one morning guess decided his whole day. Now no gap between looks is longer than 3 hours, including after it picks a nudge for later (that used to wait for the nudge to go out). A 3-hour mark inside their quiet hours moves to when quiet hours end, never later than the planner's own pick, so nights cost no extra AI calls |
| What happened to a push | `myPushStatus` (owner Test Function) | `{"email": "..."}`: that person's OneSignal subscription (notification_types 1 = subscribed; -10 = not subscribed: the app was uninstalled or notifications turned off in phone settings; OneSignal learns it when a push is refused, often the next one after they left). `{"notificationIds": [...]}` (ids from NotificationLedger, up to 20): OneSignal's counts for each push, delivered / failed / errored / opened, and when it finished. Nov 2 2026: Jordan's and Connie's Sunday pushes were delivered and their Monday 8:11 AM summaries failed (they were gone before Monday morning, before anything else was sent); Michael's Nov 1 summary was delivered and his reminder that evening failed. Every other account made since Oct 16 was still subscribed |
| No update card on an account's first day | `AppUpdatePrompt` in `src/components/shared/QuickCapturePrompt.jsx` | Nov 2 2026 (Anna: "you can hide the update card on the first day"). For 24 hours after sign-up the "Update available" card never shows; after that it works as before (phone build below `NEWEST_BUILD`). Jordan's very first open on Nov 1 was that card: Google Play handed him the older build the day build 45 went out. Bumping `NEWEST_BUILD` for build 46 can't greet brand-new people with it either. Build 46 (1.3.23: "Notice when I wake up" ignores a quick look, Add to phone calendar, Notification sound, the text-to-speech manifest entry): `NEWEST_BUILD` stays 45 for about a week after 46 goes live on Play (Anna, Nov 2 2026: "upload build 46 and just not do an update popup for like a week"), so nobody is asked to update to it; Play's own auto-update moves most phones meanwhile, and its features show only on phones that have it. Bump to 46 after that week |
| No ads in someone's first 3 days AND first 3 opens, whichever ends last | `src/components/shared/AdManager.jsx` (`GRACE_OPENS`, `GRACE_DAYS_MS`, `inFirstDays`) | Nov 1 2026, Anna: "I still don't want them to be hit with an ad on day 2. Here's what it really should have been... First 3 days or 3 opens, whatever comes last." (Built Nov 2 2026.) Until then it was the first 3 opens only (Oct 18 2026), and any return 30+ minutes after the last counts as an open, so a 4th open could land on day one or two. 3 days = 72 hours from sign-up (`signed_up_at`, else `created_date`; Layout passes the user in). Nothing is owed in that time, carried over or not; while the sign-up time is still loading, a pause is let go rather than risk it. After both are over: one ad every 3rd open (4th, 7th, 10th...), only at a pause they made (a check-off, an add, or a later page switch), so the first ad someone actually sees often lands later than open 4 |
| Smart Reminders never mentions a task in the 2 hours after it was added (1 hour when it's high priority or urgent) | `cronSmartTaskNudge` (`JUST_ADDED_HOLD_MS`, `JUST_ADDED_HOLD_PRESSING_MS`, `holdEndOf` in `generateDailySchedule`, the JUST ADDED, NOT YOURS YET list in the prompt) | Nov 2 2026, Anna: "can we make it so that smart reminders do not remind someone of something they just added? For example, I made a task to clean out all the fridges what seems like recently and just got a reminder". She added it at 6:39 PM; it rang at 7:29 PM, after the Oct 22 "added under 30 minutes ago" hint had run out. Now a hold in code: 2 hours, or 1 hour for a task marked high priority or urgent (Anna, Nov 2 2026: "If a task is urgent or high priority, it can wait an hour"). Held tasks aren't in the planner's numbered list, they're listed with the time they become its own, and the next look is set for when the earliest hold ends. Not held: calendar imports, tasks due today or late, tasks with a REMINDER WISH (their own words about when), and on a new account's first day the hold ends by 45 minutes before bedtime (at least 30 minutes after adding) so NEW HERE's day-one mention still fits. Preview Nov 2 2026 7:55 PM: "Clean out all the fridges" held, "yours from 8:39 PM", nothing picked |
| Imported birthday names keep a trailing s; a renamed birthday keeps its own reminders | `extractBirthdayPerson` in `syncGoogleCalendar`; `saveTaskTitle` in `multiReminderScheduler.jsx` | Nov 2 2026, Maelisa's phone calendar: "Curtis' Birthday" was imported with `birthday_person` "Curti" (the old regex took the s off any name ending in one; "James birthday" would have been "Jame"). Only an apostrophe-s is stripped now. She then renamed the task to "🎂 Curtis' Birthday" in the app, and the rename re-booked its two birthday pushes as task reminders: title "🎂 🎂 Curtis' Birthday", body "🎂 Curtis' Birthday: Curti's birthday is in a week…", Done and Snooze buttons. A rename now leaves a birthday's reminders alone (they're the birthday scheduler's, and name the person from `birthday_person`), and a renamed task whose title already starts with an emoji doesn't get a second one. Her record was corrected by hand Nov 2 2026 (Anna: "Please fix to Curtis"): `birthday_person` "Curtis", the two entries set back to planned so the hourly refill books them as "Write a text for Curtis" and its reconcile cancels the two old pushes |
| "Every day?" after checking off a daily-type to-do, and "What's next?" when a new person's list empties | `RepeatOfferPopup.jsx`, `WhatsNextPopup.jsx` (Layout), `repeat_offer` set by `logTaskCompletion`; `TaskNotification.jsx` fires `reminder-task-done` | Both built Nov 1 2026 (Anna's yes in the "Who Stayed, Who Left" doc). Nov 2 2026: both also look a few seconds after Done on a reminder or the phone's alarm, which lands on Home (Anna: "What about people that barely open the app and check tasks done by pressing done on an alarm"); before, they waited for the next open. `reminder-task-done`, not `task-done`, so that Done is still never an ad's pause. "What's next?": an event in the next 2 days counts as something coming (Anna, Nov 1 2026: "Maybe events should count?"); events further out, birthdays, steps and Back Burner tasks don't |
| Notification sound (and read-aloud) | native `NotifySound.java`, `PushFilter.withOwnSound`, `AlarmBridge.setNotifySound` (build 46 / 1.3.23); web `AlarmSoundPicker kind="notify"` + `NotifySoundCard` (`QuickCaptureCard.jsx`, Settings → Reminders, under the alarm card), `pushNotifySound` (`widgetBridge.js`, also on every open in `WidgetTaskSync` and after quiet hours are saved), `User.notify_sound_url` / `notify_sound_name` | Anna, Nov 1 2026: "can our sounds for alarms also be an option for regular notifications? Including reading it out loud?"; Nov 2 2026: "why would you not put everything weve talked about in build 46". The same list as the alarm sound (Read it to me, the presets, their own upload); empty = the phone's usual sound. Only a push that makes a sound anyway (never a quiet copy, a held one, or a restored re-delivery more than 5 minutes old) is shown on the app's own channel "Notifications with your sound" (pops up and vibrates, no sound of its own) while the app plays the file once (cut at 8 seconds) or the phone's voice reads it once (the body, led by the title when the body doesn't say it, up to about 280 characters), at notification volume. Left to the phone, exactly as before: nothing picked, the file not downloaded yet, silent or vibrate, Do Not Disturb, notification volume at zero, and for the voice only, inside quiet hours. A voice that can't start plays the phone's default tone. Two pushes together make one sound. The card shows only where the build has it (Android 46 on) |
| Text-to-speech needs a manifest entry | `android/app/src/main/AndroidManifest.xml` `<queries>` | From Android 11 an app has to declare `android.intent.action.TTS_SERVICE` in `<queries>` or the phone's speech engine is hidden from it (developer.android.com, "Connect to a text-to-speech engine"). It was missing until build 46 (added Nov 2 2026). The spoken alarm ("Read it to me") worked on Anna's phone without it (Nov 2 2026: "the reading aloud was working on my phone"), so it's there as the documented requirement, not as a fix for something seen failing. Don't describe it as one |
| Android 16 (API 36) warning on Play | Play Console policy status | Builds 45 and 46 target 36. The warning came from an old Internal testing release ("ADHDone Beta 1", version 1, target 35). Anna paused the Internal testing track on Nov 1 2026, and on Nov 2 Play Console said "A recent policy violation in your app has been addressed". Any test track left with an old build still counts against the app |
| No morning summary during Focus Mode | `cronDailyDigest` | Nov 2 2026 (Anna: "we can skip the morning summary if focus mode is on"). When `User.focus_mode_task_id` is set at their summary time, no summary that day; the day is still marked done (`last_digest_date`) so Smart Reminders stop waiting for it. A new person in Focus Mode since 7:43 AM got the summary of everything at 8:11, between check-ins about the one task |
| Add to phone calendar | `src/components/utils/addToPhoneCalendar.js`, the details card's action row (`TaskDetailsModal`), native `CalendarBridge.addEvent` (Android, build 46 / 1.3.23) | Nov 2 2026 (Anna: "it would be nice to click add to phone calendar on a task or event"). Opens the phone's own calendar app on a filled-in new event (title, notes, place, time) with Android's insert intent; the person picks the calendar and saves it there; no calendar permission, nothing written by ADHDone, no link kept. Day-only: all day on its day (through the last day of a span); timed: to its end time, else the span's end, else 1 hour (event) or 30 minutes (task). Not for birthdays, steps, finished or cancelled items, things with no date, or anything imported from a calendar (`google_event_id`). Hidden where `CalendarBridge.addEvent` doesn't exist: Android builds before 46, iPhone builds before the one after Nov 2 2026 (CalendarBridge.swift addEvent, added that day: Apple's own New Event sheet, filled in, no calendar permission needed on iOS 17+; resolves { ok, saved } when the sheet closes), the website. On an event the button is a small outlined button right under the title (Anna, Nov 2 2026: "on events only, can we put the 'add to calendar' button like right under the title"); on a task it stays in the action row at the bottom. AppEvent `add_to_phone_calendar` |
| Timer offered only where it fits | `takes_time` from the parser (`shared/taskParsePrompt.ts`), `LaunchPicker.jsx` (Home → Timer), `TaskDetailsModal` (the Timer block), `TimeItButton` (the collapsed card) | Oct 27 2026 (Anna: "Timer is really only good for certain work things, school things, chores that take at least 5 minutes"). The Home Timer list shows only the tasks the parser judged worth timing, with the rest behind "Time something else"; the card's Timer block and the collapsed-card Time it are hidden when the parser said `takes_time: false` (vitamins, the litter box, new batteries). A task the parser never judged (older than Oct 3 2026, `takes_time` empty) keeps the card's Timer block. Never time an event or a birthday |
| Break it down offered on the row | `worth_breaking_down` from the parser (`shared/taskParsePrompt.ts`, `shared/runTaskParse.ts`; saved by `taskCreationPipeline.js` and `shared/captureToTasks.ts`), `src/components/tasks/BreakItDownOffer.jsx` (the collapsed `TaskCard`, so Home and Tasks alike), Task `breakdown_offer_dismissed` | Nov 1 2026 (Anna: "if someone makes a task that seems pretty big, maybe we should offer to break it down for them? Right now, I feel like no one breaks down the tasks because it's kind of hidden" — it lived only inside the opened card and Task Details, and since Sep 1 nobody but her had used the AI break-down). The parser (gpt-6-astra, judgment, no word lists) marks a several-steps job someone could stall on (plan a trip, do the taxes, clean out the garage); never a call, a bill, an errand, an appointment, an event, a birthday or an everyday chore. Such a task with no steps yet shows one line under its collapsed row, "Looks like a few steps. Break it down?" with ×; tapping opens the usual break-down (`TaskDecompositionModal`), and either way it is never offered on that task again (the button inside the opened card stays). A line on the card, not a popup, so it never stacks with one. AppEvent `breakdown_offer` (props.action open / hide) counts it. Older tasks (field empty) get no offer |
| Owner alerts | `ownerHealthCheck` in `cronRefillReminders` (hourly) | Pushes Anna's phone (s2kap2chick) when the app is down or failing people. Since Oct 19 2026 (after Michelle: "this should have been flagged") also about one person by name, once per happening: quiet hours moved for them, about to be asked about, or the model unsure (9); 2 or more alarms in 2 days rang out or were left with Home or Back, counted from every report the phone sends (AppEvent `alarm_choice`, written by `cancelTaskNotifications`), not only each task's last choice — but a ring whose task got checked off within a day is answered, not missed (Chad lets his 8 AM medication alarm ring out and finishes it later; the alert called that "going unanswered" on Oct 27 and Oct 28 2026; it was 3 hours until Nov 1 2026, Anna: "cjkelso and brianna are both good examples of people who let things ring out or dismiss them, but the reminders are still helping them"), and a ring under a day old with the task still open is too soon to count (10); a phone that stopped taking pushes or has notifications off, for anyone in the app in the last 14 days (11), told ONCE per departure, and someone known to be gone (push_unreachable_at after their last open) is left out of every other check (Anna, Oct 27 2026: "if we know someone uninstalled, I don't want to keep getting reminders about it"). What has been told is remembered on Anna's own User record, `owner_alert_marks` (`gone:<email>` = the last_active_at the alert was about; `alarms:<email>` = when the last alarms alert went out), NOT in the NotificationLedger: the ledger is pruned after a few days, so "did I already send this" forgot Michelle's Saturday alert by Wednesday and sent it again (Oct 28 2026, after three repeats in four days — Anna: "I don't know what to pay attention to"). Alarms alerts and notifications-off alerts about one person rest 7 days between sends (`notifoff:<email>`). An account under a day old is never reported for notifications off: the welcome steps ask for them a few screens in, so every first open reads "off" (Bri signed up Oct 29 2026 at 6:57 AM, was reported at 7:00 AM, and had them on by 7:05). The daily note no longer repeats the alerts: it lists only captures that never finished and new signups, and is skipped when there are none. Her own accounts and family who only installed it are left out, and so is everyone in `NEVER_MENTION` (wickeddevildriver666, Nov 1 2026: "Can we stop mentioning wickeddevildriver666? You and the push notifications I get about errors won't let her go"): never in an alert, a note, or a report Claude writes her. Test Function `{"markTold": [{"key": "gone:<email>", "value": "<their last_active_at>"}]}` (owner only) writes a mark by hand. Deploying: the editor's redeploy-function endpoint makes the Test Function panel run the new code, but the Reminder Refill workflow run 22 minutes after a redeploy (Oct 27 2026, 8:45 AM) still ran the old code — count a backend fix as live for the workflows only after Publish. `{"previewHealth": true}` from the owner's account shows what it would send, sending nothing Also: someone asked in the app to delete their account (User.account_deletion_requested_at, Settings > My Account > Delete Account; Apple 5.1.1(v), Oct 30 2026), told once per request; Anna deletes it within 30 days. |
| Evening mood ("How did you feel today?") | `DayMood` entity; `src/components/wins/moodStore.js` (the one store), `DayMoodRow.jsx`, `EveningWinCard.jsx`, `WinBox.jsx` (`WinAskFromLink`, withMood), `src/components/progress/MoodDoneCard.jsx`, the tag in `WinsList.jsx` | Since Oct 31 2026 (Anna: "Link your daily mood with the stuff they got done that day"). Asks how they FELT, never "how was today" (that gets answered with productivity). 1 Rough … 5 Great; optional chips (slept_badly, sick_or_hurting, stressed, lots_going_on, low_energy) and a short note. One row per person per day; `day` = eveningWindow's dayKey (an evening past midnight belongs to the day it started); saving again updates it; reads take the newest-updated row for a day; nothing is deleted. Private (created_by), never shown to partners. Asked only on the evening card (stays until both mood and win are answered, or "Not today") and in the evening push's box; no notification of its own. The card's chips and note don't wait for Done forever (Anna, Nov 2 2026: "After someone fills this out for the day, it should go away"; she'd picked a face, three chips and saved her win at 9:51 PM and the card sat there): once a face is saved, a tap anywhere else on the page or 8 untouched seconds (not while typing the note) counts as Done (`DayMoodRow autoFinish`, only on the Home card; the push's box keeps its own close). Insights "Mood and what got done": counts only, no AI; tasks by `completed_at` on the person's day (`winsStore.dayOfMoment`, turns over mid-quiet-hours), never `updated_date`; no subtasks or birthdays; callouts only after 5 check-ins in all. The partner MoodCheckIn card and feed (the Accountability Feed tab) were removed the same day (0 rows ever); the MoodCheckIn table is untouched |
| adhdone.space at the bottom of every page | `src/components/shared/WebAddressFooter.jsx` (mounted once in Layout, after the page), `src/components/utils/openInBrowser.js` | Since Oct 31 2026 (Anna: "let users know the url is adhdone.space... at the very bottom of each page... will open in browser"). Phone apps only (the website is already there). Opens the phone's browser: Android `NotifyBridge.openUrl` (build 43 on), iPhone `NotifyBridge.openExternal`; an older Android build copies the link instead |
| Diary out of the app | `src/pages/Diary.jsx` (route kept), menu/guide/tiles entries removed | Oct 31 2026 (Anna: "I am kind of thinking we get rid of diary"): 3 entries ever, all from her own accounts. Gone from the menu, the App Guide, Home tiles and the press kit. The page and every `DiaryEntry` row are kept (/Diary still opens it); nothing was deleted |
| Insights "Deadline Dodging" card | `countInsights` in `src/pages/Progress.jsx` | Since Oct 31 2026 (Anna: "Postponed and pushed seem like the same thing... more about how often you finish something after pushing it back"): "You finished X of the Y things you pushed back" with a bar, then "Still waiting" (not finished, most pushed first, a repeating task's copies as one line). Events and cancelled items are left out (moving an appointment isn't putting it off). Pushes are `Task.due_date_pushes`, a counter, not dated |
| Come-back pushes | `COMEBACK_STEPS` in `cronBackBurnerCheckIn` | Since Nov 2 2026 (Anna: "It's important to bring them back day 2"), an account under a week old gets its very first come-back on day 2 instead: the afternoon of the next calendar day of theirs after its last open (at least 12 hours later); later absences go back to day 3, and it's still three pushes (Vega signed up Sun Nov 1 with an empty list and would have heard nothing until Wed). Admin Test Function `{"previewComeback": true}` lists who is due and whether now is in their window, sending nothing. Oct 16 2026: someone with nothing open gets one push 3 days after their last open, one at 7 and a last one at 14 (afternoon, their time; tapping opens Add Task; starts over when they open the app). Day 3 rotates "Brain getting crowded?" / "Your list is empty" / "Anything you're trying to remember?". Since Nov 1 2026 (Anna: "How do we pull back tricia") birthdays don't count as something open: a list of only birthdays speaks up only on the day, so Tricia (two birthdays, saved Oct 28-29) heard nothing until Nov 7. Those people get the come-back pushes too, never the "Your list is empty" line |
| Goals (Anna's own account only for now) | `GOALS_PORT.md`; `src/components/goals/*` (`goalsAccess.js` = the one gate, `GoalStepSync.jsx`, `goalLogic.js`, `GoalHomeCard.jsx`), pages Goals/Planner/GoalDetail, functions `goalPlannerChat` + `createRemainingGoalSteps`, `onTaskUpdate.goalStepFollows` | Oct 31 2026 (Anna: "carefully make sure we are actually copying the way it works in the goals app correctly... bake the goal steps into existing notifications... display current step on the dashboard... Show goals only on my account for now"). Ported from her Goals app (6a0480d58799f243f556731d, never written to). Open only to the accounts in `goalsEnabled(user)`: the menu item, /Goals, /Planner, /goal/:id, the Home card and GoalStepSync. Each active goal has exactly ONE ordinary Task (goal_id / goal_step_id / goal_context) for its current step; only GoalStepSync creates it, in the app, through `taskCreationPipeline.createTaskFromFields` — never a backend function, cron or asServiceRole. Backend code may UPDATE a GoalStep (onTaskUpdate `goalStepFollows`) but never creates goal tasks or steps. Goals has NO notifications of its own (no goal crons, pushes, popups or schedules): the step's task is reminded like any task, and Smart Reminders sees only one line, `Task.goal_context`. The planner (gpt-6-astra) never promises reminders, check-ins or messages; self-test `{"selftest": true, "goal": "…", "answers": […]}` to `goalPlannerChat` (admin, saves nothing; `reminder_promise_lines` must be empty). A step whose task they deleted (`task_dismissed`) comes back only when they tap "Add this step to my tasks". Pausing parks the task on the Back Burner (`paused_task_ids`); a done goal has no open task. Goal data is deleted only when the person deletes that goal |
| Goals planner chat in progress, and long plans | `src/components/goals/plannerDraft.js`, `GoalPlannerDraft` entity, `src/pages/Planner.jsx`, `goalPlannerChat` (`continue_plan`, `assemblePlan`) | Nov 1 2026 (Anna: "yes make it save to the account"; her plan showed Months 1–14 and empty 15+). The chat is saved on the device (localStorage plannerInProgress) AND to the account in GoalPlannerDraft (private, one row per person, found and updated, created only if none; newest updated_at wins between devices), before each planner call and after each answer. A finished chat (goal saved, edit applied, fresh start, Dismiss) is marked completed, never deleted, never restored. Account calls are best effort and never block the chat. Long plans: the planner never tells the person to ask for the remaining months; when its time runs out it returns incomplete/months_done/months_total and the Planner calls `continue_plan` (fresh budget each call, max 4 in a row, then "Keep writing") until complete, also on restore. "Looks good" shows only for a complete plan; the plan view never pads empty months. `extract_plan` builds the plan from every planner message (each month from the most recent message that wrote it in full). Tested Nov 1 2026 on a 24-month goal: full plan in one call (140 s); a plan cut to 10 months was finished by `continue_plan` (79 s); both extracted to 24 months / 96 steps. Plan length (Nov 1 2026, Anna: "I gave a deadline of January 2028. Which is 14 months from now. It just put months 15-36 empty for no reason"): `detectMonths` reads only the PERSON's messages, newest first (a changed deadline wins), never the planner's words; a month with a year ("January 2028", "Jan 1, 2028") counts from their today (Nov 2026 → Jan 2028 = 14); "N months" needs a 1–2 digit number. A length they gave is firm (`planFirm`): `expandPlan` writes exactly that many months, so a stray "Months 15–36" line can't stretch it. The Planner never judges a plan unfinished by counting "N month" words in its text (that regex could read a year as 2028 → 36). `extract_plan`'s fallback reads the newest planner message that IS a plan, so a question asked after the plan ("why does it stop at Month 14?") doesn't leave nothing to save. A week written day by day ("Monday: … Tuesday: …") takes its step title (the task's name) from the first thing to do, not the day (was "Week 1: Monday" for every step). Self-test Nov 1 2026, goal "by January 2028": 14 months written in one call (131 s), complete; extract with a question asked after the plan gave 14 months / 56 steps, target 2028-01-01. A bare "by 2028" and "next year" set no length (either could mean two different dates, and a set length is firm): the planner asks, as it did on Nov 1 2026. Links the planner writes (its web search cites sources) show as links in the plan view's weeks too (they showed as raw "[site](https://…)" text) and open in the phone's browser (`openInBrowser`), never over the app. Questions (Nov 1 2026, Anna: "tighten it to one round of 4-6 questions depending on what the goal is"): ONE round of 4–6 short questions picked for the goal, then the plan after their reply; anything skipped gets a sensible default the summary names (the Goals app's "don't plan until they've replied twice" made 3 rounds and 15 questions). Professional help (`PROFESSIONAL_HELP_RULE`, new goals and edits; Anna, Nov 1 2026: "It should only suggest professional help if someone says something that endangers themselves or others or is very worrying. It told me to go to one and all I said was that I had bpd"): a condition or diagnosis they mention is context to plan around; a therapist, doctor or crisis line comes up only for a risk to themselves or others or something seriously worrying, once, and never as a "this isn't treatment" disclaimer. The self-test lists any such lines as `referral_lines`. Coming back (Anna: "just like goals, remind the user they can come back to this chat to edit their goal. (make sure that works.)"): a saved goal's page has **Change this plan** (active or paused), which opens `/Planner?edit=<id>` = the chat it was made in (`conversation_history`), as an edit session; the after-save card and the planner's approval line say so. The port had the `?edit=` route but nothing opened it. Self-test stages `edit` (an edit session on the plan as if saved: a change asked for, then "yes") and `edit_apply` (`extractEdit`, what applying would save) write nothing |
| Goals: "How did it go?" adjusts the plan | `src/components/goals/StepFeedbackPopup.jsx`, `src/pages/GoalDetail.jsx` (`feedbackStep`, `feedbackDone`, `carryToTasks`), `goalPlannerChat` mode `step_feedback` (`planFromFeedback`, `stepFeedback`), GoalStep `feedback` / `feedback_at` / `feedback_asked_at` | Nov 1 2026 (Anna: "Anytime someone checks a milestone or whatever done, ask them how it went. Give them a microphone and type option. It would be nice if the plan chat could basically read any feedback it gets and adjust the rest of the plan if it needs adjusting. Like if they come back saying the paper collage etc was not helpful.. the planner chat would make sure the following weeks are not more of the same"). Marking a step done on its goal's page asks once (typed or the usual mic, Save or Skip; one popup at a time via usePopupTurn, latched); a step finished on the task list is asked the next time that goal's page opens, if it finished in the last 3 days. Skip or closing it sets `feedback_asked_at`, so never again. Saved words go to `step_feedback`: the model (gpt-6-astra, judgment) reads them with the planning chat and all earlier feedback and rewrites only upcoming steps in the rest of the current month and the next (at most 10), never a finished one, and changes nothing when the plan already fits. Something that didn't help is not repeated in kind and is replaced by a specific activity that does the same job, built from what they said worked or enjoy (never a vaguer version), and the summary names the replacement; it is never forbidden either: a written reflection becomes "think it over, writing optional" (Anna, Nov 1 2026: "the important part is what did it replace it with"; "Instead of 'think it over without writing' it should say something more like 'think it over, writing optional'"); what helped is built on. Rows are UPDATED in place (title by the extract_plan title rule `weekFocus`, description, success criteria, tips), never deleted or made; the page then gives the open task the new name and note when they were still the step's old ones. The exchange ("How Month 1, Week 1 went: …" and the planner's summary) is added to the goal's `conversation_history`, so Change this plan shows it. A toast says "Updated weeks 2–4 after your feedback" or "Your plan stays as it is". Self-test stage `feedback` (admin, writes nothing) |
| Deleting a goal disappears at once | `deleteGoal` + `liveGoals` in `src/components/goals/goalLogic.js`; used by `Goals.jsx`, `GoalHomeCard.jsx`, `GoalStepSync.jsx`; `GoalDetail.jsx` `handleDelete` | Nov 1 2026 (Anna: "we need optimistic ui when deleting a goal. After deleting, it takes you back to goal page and shows the goal you just created for like 15 seconds"): the goal record was deleted LAST, after every step one at a time. Now the goal leaves every list on that phone the moment Delete is tapped (`deletingGoals`), its open task goes, then the goal record, then its steps 8 at a time. GoalStepSync skips it meanwhile, so it can't get a new task. If the delete fails it comes back on the Goals page with "Couldn't delete the goal" |
| Goals: one "by the end of the week" task per step, and late weeks move the plan | `src/components/goals/goalWeeks.js` (`stepDeadline`, `stepWeek`, `lateFinishShift`, `planBehind`, `trackerDays`), `goalLogic.js` (`goalTaskFields`, `retargetTask`, `applyLateShift`, `currentStep`), `GoalStepSync.jsx`, `HabitWeekTracker.jsx`, `src/pages/GoalDetail.jsx`, GoalStep `finished_days_late`, `goalPlannerChat` `step_feedback` `days_late` | Nov 1 2026 (Anna: "nothing from the goal was added to tasks. I think each week's plan should have a task that is treated like a 'by the end of the week' task. It stays until checked off. So if someone checks off late, the plan can readjust maybe"). Every goal, daily-practice ones included, has ONE ordinary weekly task for its current step: deadline style "by" on the last day of the step's week (`stepDeadline`: the day before the next later step starts, or six days on), no time, not repeating, on Today from the moment it is made (from the goal's start date). The current step is the first unfinished one for every goal (a daily-practice goal no longer follows the calendar), so a week's task is never moved or removed when the week passes; it stays, overdue, until checked off. Daily practice is marked on the goal page's tracker, which shows the step's OWN week by real dates and rings today only inside that week (it rang Sunday Nov 1 on a week of Nov 2–8); a week not started yet shows "Starts …"; the current step still open after its week shows the last 7 days. Checked off after its week ended (on the goal page or the task list): GoalStepSync moves every unfinished step after it by the same number of days so the next starts the day after (`lateFinishShift`; only GoalStep `due_date` changes, the next step first so two phones agree; an open task for a moved step gets the new date unless its date was changed by hand) and saves `finished_days_late` on the finished step. On time or early: nothing moves; the next step's task is there at once, due by the end of its own week, so someone ahead can start it. `target_date` stays their deadline: when the moved weeks end after it the goal page says "About N weeks behind your <Month Year> deadline" with Change this plan. "How did it go?" tells the planner how many days late (TIMING) so it may lighten the next weeks when that fits; it never changes dates. Migration: an old repeating step task (none existed on Nov 1 2026) that nobody changed is turned into the weekly task in place, never deleted; one the person changed is left as it is and the step gets its weekly task too |
| One streak everywhere | `src/components/utils/completionStreak.js` (`streakFromTasks`, `currentStreak`) | Oct 31 2026 (Anna: Insights said 3, "the app says i am on a 21 day streak elsewhere"). Days in a row on the person's own calendar day with at least one real finished task (no subtasks, no birthdays), alive through yesterday. Insights, the daily tip, the motivation message, Support Space, the end-of-day review, achievements and the daily summary all use it. `DailySummary.streak_days` used to chain yesterday's summary + 1 on UTC dates, so an evening finish landed on the next UTC day and a day with nothing finished never broke it; nothing reads that field for the streak any more, and summaries are dated by the person's own day |
| Computer-width menu | `<Sidebar>` in Layout + `src/components/ui/sidebar.jsx` | At 768px and wider the menu is a fixed panel on the left that the menu button opens and closes. Never put a position class (`relative`, `absolute`) in the Sidebar's className: tailwind-merge drops the panel's `fixed` for it, the panel falls below the screen, the left strip is empty and the menu button looks dead (Oct 31 2026) |

### Correct states that are NOT bugs
- **Subtasks never have notifications.** A subtask (`parent_task_id` set) with null
  `reminder_interval`, null `next_reminder`, and null `notification_recipient_email` is
  CORRECT AND INTENTIONAL. Anna has said this more than once. Do not "fix" it, do not
  flag it in a diagnostic as a problem, do not schedule pushes for it.
- Birthdays never mix into the day sections (Today, Tomorrow, Next 7 Days…). On the Tasks
  page they sit only in their own 🎂 Birthdays section at the very bottom, collapsed by
  default since Oct 24 2026 (the header shows the count; one tap opens it), and on Home
  only as the one-row BirthdayStrip (the next birthday). That is by design.

## 6. CLEAN BEFORE YOU BUILD

**Do not stack a new fix on top of an unresolved mess from a previous attempt.**

When picking up a problem that has already been worked on:
1. Find what the last attempt actually changed.
2. If it left dead code, half-migrated data, an abandoned function, or a workaround that
   is no longer needed — remove it first, subject to the §3 cleanup rule.
3. Only then add the new fix.

Layering fix on fix is how this codebase got competing schedulers, duplicate parsers, and
notification paths nobody can reason about. A fix that requires the previous broken
attempt to stay in place is not a fix.

### Phone (android/) code goes in THIS repo, not only on Anna's PC

The AAB is built from Anna's PC folder (adhdone-android-new), and the build agent resets that
folder to GitHub's main before every build. GitHub's main is this Base44 app. So a change to
android/ made only in the PC folder is wiped by the next build. On Nov 3 2026 (1:47 AM UTC)
that reset dropped most of build 46 (Add to phone calendar, the notification sound wiring, the
wake-up quick-look fix, the manifest's queries) and the AAB was built without them; only the
new NotifySound.java survived, because a reset leaves new files alone. Every android/ change
is written here (edit_file / write_file on android/...), and checked on GitHub's main before
anyone is told to build. The version code is set at build time, not here.

## 7. HOW TO DIAGNOSE (the meta-rule)

The recurring failure mode is theorizing before looking. The order is:

1. **Read this file.**
2. **Read the code that actually governs the behavior** — not the code you assume
   governs it. If reminders are wrong, read the sender, not the parser.
3. **Query real data** — the entity, the OneSignal API, the function logs.
4. **Only then** name a cause.

If a proposed fix turns out to be something already listed in §4, §5, or the dead-ends
list, STOP. The rule or feature exists; the real question is why it isn't being enforced
on this path.

When features that were working suddenly act old, check `git log` for a commit that put
back an old version of the whole app. Oct 22 2026, 2:55 PM CDT: the builder chat logged
"generation stopped", and 4 seconds later commit "Focus Mode and Tasks" replaced every
file with the Oct 14 version (168 files, the android folder gone). Background jobs ran the
Oct 14 code for 8 hours (Smart Reminders lost the unreachable-phone skip and its run mark,
so the watchdog sent "Smart Reminders stopped running" at 9:45 PM). Fixed at 11:09 PM by
restoring the checkpoint saved at 2:54 PM. Publishing while that was in place would have put
the Oct 14 app live.

### Dead ends — already tried, already rejected. Do not propose again.
- Aggressive task suppression based on priority
- Staggering reminders by 1 or 15 minutes
- Completing tasks via native notification action buttons
- Automated SMS sending (Twilio)
- Recursive task updates in `onTaskUpdate` (caused an infinite loop and burned credits)
- Automatic recurrence modification during calendar sync
- Native-side task parsing (fragments the logic)
- OneSignal native subscription observers
- Snooze-pattern / task-age metrics (feels like shaming)
- Energy-level-based task suggestions
- Hard-coded traffic buffers (live traffic replaced them)
- Retrying calendar sync with an artificial sleep/wait delay
- Targeting announcements by both device ID and user ID (duplicate storms)
- The Variant B jitter animation (seizure risk)
- Retrying an SDK call that got Cloudflare's "Just a moment" page (`withChallengeRetry`) —
  the challenge is not transient; every call through adhdone.space gets it. Fix the host,
  not the retry (hard rule 9)
- A daily or batch schedule for Smart Reminders (one AI call a day booking 3–5 nudges
  ahead). Done by Base44's AI on Aug 21 2026 without being asked, undone Oct 11 2026 (§10)

## 8. REAL PEOPLE'S DATA — BULK CHANGES

Added Oct 9 2026, after a "re-book everyone's reminders" pass re-read two first-time users'
typed words with that day's calendar and moved "remind me tomorrow at 9am" a day later for
both. Nobody looked afterwards. A bulk change is anything that writes to more than one
person's records, or to any record the owner did not personally ask about.

1. **Dry run first, with a field-level diff.** For every record that would change, print the
   field, what it is now, and what it would become. "19 reminders re-booked" is not a diff.
2. **Owner's accounts first** (README lists them), then everyone else, never the other way.
3. **Never re-read old words with today's calendar.** A task's `original_input` is parsed as of
   its `created_date`, on its owner's timezone — `buildTaskParsePrompt(text, tz, saidAt)` and
   `runTaskParse(..., saidAt)` take the moment the words were said for exactly this reason.
4. **Read it back.** After the change, query the same records and compare against the diff
   you promised. Report what differs, not "done".
5. **Server-made records belong to the server.** `asServiceRole.entities.X.create()` saves a row
   owned by the service account; a person's app never shows it, and the crons still act on
   it. Create as the user (`base44.entities.Task.create` with their auth) or don't create.

## 9. BEFORE ANY CHANGE ON THE CAPTURE-AND-REMIND PATH — FIVE QUESTIONS

Every bug on Oct 6–8 2026 was code that was right for the moment it was written and wrong
for a moment nobody asked about. Before calling a change done anywhere between "the person
typed something" and "their phone rang", answer these in writing:

1. **What if the app closes halfway?** Captures resume later (`pendingCaptures`); booking runs
   in the background after the task is saved; a popup can be on screen for one second. The
   refill's rescue pass exists because a task was saved and its reminder never booked.
2. **What if this runs later than the words were typed?** "Tomorrow", "tonight", "Thursday"
   mean the day after/the night of/the next Thursday from WHEN IT WAS SAID. Pass `saidAt`.
3. **What if the time has already passed?** A pinned moment that went by is overdue, not
   undated and not "no need to tackle it tonight". Nothing should quietly drop the date.
4. **What if it lands in quiet hours, or on a phone that holds pushes?** A time the person
   named ("every Thursday at 22:00") is theirs; a reminder the app invented is not.
   Anna, Oct 12 2026: "If a user schedules a task or event outside of their quiet hours, that
   is the one time we will ignore their quiet hours. For example, if I had a flight at 5 a.m.,
   id want that alarm. Just make sure the only way that would ever happen is if a user
   explicitly says a time outside of their hours." So a time they SET (`Task.time_stated`:
   said or typed a clock time, picked one in the app, or their own calendar's event start;
   a reminder they added at a picked time has `their_time`) goes out at that time, alarm and
   all — `isTimeTheySet` (base44/shared/quietHours.ts, and the same in reminderScheduler.jsx)
   is the one test. Everything else stays out of quiet hours: a time the parser picked from
   "before bed" (the parser is told their quiet hours and to pick outside them), every
   heads-up, nudge and repeat ping. An app reminder that lands inside them moves to when they
   end, or is dropped if that's too late (`placeAppReminder`) — never booked as it came.
   One exception the app picks: the "This is what a reminder looks like" sample, a few
   minutes after someone's first task while they're in the app setting it up (dropped if it
   can't go out within 15 minutes). Anna, Oct 23 2026: it "should break quiet hours if its
   actually arriving soon after they get through that onboarding part of the app".
   Home or Back on one of these night alarms rings it again in 10 minutes (`throughQuiet`).
   A time they set also never moves for another alarm, day or night: the phone's 10-minute
   gap between two tasks' alarms (Anna, Oct 10 2026) is only for reminders the app picked.
   Every alarm list (`phoneAlarmsFor`, `alarmSetFor`) marks those alarms `theirTime: true`
   and starts their heading with 🔔 (builds 39–42 only know the bell); one the app picked that
   is ringing at that moment makes way and rings 10 minutes after (build 43 on). Anna, Oct 21
   2026, after her 10 AM call rang at 10:31 behind another task's alarm: "Events with a
   certain time cannot be happening at a different time."
   Two or more at times they set in the same minute: the phone shows one at a time, so the
   model puts them in order (`shared/alarmOrder.ts`, gpt-6-astra, judged when one of them is made
   or changed): the one where someone is waiting or that can't slip rings on the minute, and each
   next one 10 seconds later, so the phone rings it the moment the one before is answered
   (`Task.alarm_order`). Anna, Oct 21 2026: "which one sounds more important..... a scheduled
   phone call involving another persons time or a watch setting".
   Not everyone sleeps at night (Anna, Oct 12 2026: "night shift people exist"). Never compare
   the local clock to fixed hours (7 PM, 9 AM, 10 PM) to mean evening, morning or bedtime: their
   night is their quiet hours (the times count even with the switch off), their morning is when
   those end, and an overnight work shift belongs to the day it starts (workHours.ts).
5. **What if the phone is on an older build, or the reminder style is notification, not
   alarm?** Check the fields the old build reads, and the path a push takes when nothing
   rings (`PushFilter`).

Then run the parser self-test (`parseTask` → Test Function → `{"selfTest": true}`) if the
prompt, the date resolver or the pipeline changed, and say what failed. Three hands change
this codebase fast and nothing else will notice.

## 10. SMART REMINDERS IS ANNA'S DESIGN — DO NOT CHANGE IT UNLESS SHE ASKS

Added Oct 11 2026. On Aug 21 2026, the day after Smart Reminders was built, Base44's AI
rewrote it ("Switch to daily smart nudge scheduling", commit 2f1a6ad) to save AI calls: one
plan a day booking 3–5 nudges ahead, with the regular checks only sending what was booked.
Anna never asked for that and didn't find out for seven weeks. All that time her reminders
were booked hours ahead instead of decided when the moment came.

How it works, and how it must keep working:

1. **One nudge at a time.** Each time it looks, the AI picks only the NEXT nudge (or none
   yet, and when to look again) from everything known right then. It looks again after
   that nudge goes out or is skipped, at the time it asked for, and whenever anything
   changes. Never a daily schedule, never a batch booked ahead.
2. **The AI decides, not code.** What to send, when, how often and in what words comes
   from Anna's brief (`base44/shared/reminderBrief.ts`, a word-for-word copy of her
   "Reminder Brain — The Brief" doc). No rule tables, counts, caps, templates or keyword
   lists around it.
3. **Never trade its judgment for credits.** Don't make it look less often, reuse an old
   answer for the rest of the day, switch it to a cheaper model, or move it to InvokeLLM to
   save calls or credits. If cost is a worry, tell Anna and let her decide.
4. **It sees what it already said, and a put-off task stops getting the same thing.** Each
   task's line shows the words and times of every nudge sent about it this past week. Once
   a task has been put off 3 or more times (snoozed, swiped away, rang out, Later, Home or
   Back), its line also says that nothing sent about it repeats the words, the angle or the
   time of day it already got (a time they named themselves stays). Anna's rule, Oct 18
   2026: "If I have a rule and smart reminders isnt following it... why would you not
   strive to follow my rule". Before this it only knew when it last brought a task up, and
   Sally got nearly the same oil-room nudge at the same two times every day Oct 13–18.
   A nudge is a plain notification instead of an alarm ("light") only when a task it names
   has a tag; for an alarm user everything else rings (Anna, Oct 7 and Oct 13 2026: an alarm
   is never turned into a plain notification, and too many alarms is never fixed that way).
5. **"Not now" gets a break, by Anna's table (Oct 20 2026).** Later, and a snooze they
   picked (a run of snoozes counts once), are each a "not now". 1st: 3 hours for low and
   medium, 2 for high, 1 for urgent. 2nd: 3 hours for low, medium and high, 1 for urgent.
   3rd: done for the day for low and medium, 2 more hours for high and urgent. 4th: done
   for the day. Done for the day runs to their next morning (quiet hours end). The time
   they set for the task today still rings, and a "by" deadline later today keeps one
   reminder 30 minutes before it. Code: `notNowUntil` in cancelTaskNotifications (every
   build from 39 on) and `laterBreakUntil` in widgetBridge.js (older builds); the day's
   count is on the task (`not_now_day`, `not_now_count`). From Oct 11 to Oct 20 a task due
   that day, or an urgent one, got no break at all, so every daily routine came back
   after Later as often as Smart Reminders picked it (Anna's vitamins rang 6 times on Oct
   19: "it becomes harassment once a user presses a later or time button").
6. **Put off on 3 different days = a lighter plan (Anna, Oct 22 2026).** Later, a snooze,
   stopping it without a snooze (Open, a swipe), closed or rang out all count as putting
   it off; Done doesn't. On plain notifications (not alarms, and every iPhone), where
   nothing is pressed, a day a Smart Reminder about the task went out and the task was
   still open when that day ended counts too (`silentPutOffDays` in cronSmartTaskNudge,
   Nov 1 2026, Anna: "how do we fix arcticwolf's experience and make sure other people
   aren't bombarded": arcticwolf444 got 8 on Fri Oct 30 and one callback was mentioned 7
   times Oct 26-30, none answered, and nothing could see it). Light mentions and roundups
   don't count. The
   days are kept on the task (`put_off_days`). On the 3rd different day the AI judges the
   plan from what they typed, the priority and who relies on it (`shared/easeOff.ts`,
   `ease_plan`), never from keywords: `daily_alarm` (it matters: morning summary plus one
   alarm a day), `alarm_then_notice` (ordinary, like the grocery store: morning summary plus
   one alarm later in the day, and after 2 more put-off days one regular notification a
   day), `digest` (low stakes: morning summary only). An eased alarm has only Done and
   Later (push `data.eased`, build 43+; normal alarms keep every button). Editing the task's
   wording, priority or date starts it over. The morning summary names every eased task.
   The phone's taps reach `cancelTaskNotifications` through the published app, which runs
   the copy of each function from the last Publish; scheduled jobs and automations run the
   newest copy at once. A change to how taps are counted takes effect only after Publish
   (seen Oct 22 2026: a ring-out at 2:40 PM CDT was saved by the old copy).
7. **A new account hears from it the first day (Anna, Oct 22 2026).** Someone who joined in
   the last day and has had nothing from Smart Reminders gets a "NEW HERE" line, so one of
   their first tasks is mentioned that same day even with no date or a low priority. The
   app also shows a sample reminder 3 minutes after a new account's first task. To check:
   `{"email": "…", "preview": true, "as_new": true}` to `cronSmartTaskNudge`.
8. **A task they just added isn't mentioned in the next few minutes (Anna, Oct 22 2026).**
   For 30 minutes after a task is made (typed, shared in, or the next copy of a repeating
   task they just checked off; not a calendar import), its line says so and that its first
   mention waits for a later good moment unless waiting would cost something real. Before
   this the planner saw only "added today": "Ask dad about the CRV" rang 2 minutes after
   she typed it (10:49 PM Oct 22), the acupuncture call 10 minutes after (Oct 20). Tested
   on the 10:49 PM look: old wording sent it at once, new wording held it for the morning;
   "call CVS before they close at 11" still went out at once.

9. **Paused after a week away, with a heads-up (Anna, Oct 30 2026, replacing the Oct 18
   19-day pause).** "Around" = opening the app, finishing a task (a notification's Done counts)
   or answering an alarm (anything but rang out). On day 6 one heads-up names the tasks Smart
   Reminders has been mentioning ("Reminders for "Take pills" will pause tomorrow. No worries,
   just open ADHDone anytime and they'll pick right back up."); none mentioned = no heads-up.
   From day 7, and at least 20 hours after the heads-up, Smart Reminders and the morning
   summary stop (`smart_nudge_paused_at`; heads-up `smart_nudge_pause_warned_at`). Any sign of
   them resumes both (a not-helping pause waits for an app open, point 10). Times they set, events and birthdays keep ringing. Why: Angel's one-time
   "pills, remind me tomorrow at 9" was asked about every day for two weeks after he left.

10. **Are these reminders helping? (Anna, Oct 31 2026).** Someone with a week of Smart
   Reminders who, in the last 7 days, put them off (Later, a snooze, Home/Back, from AppEvent
   `alarm_choice`; only presses on a Smart Reminder, meaning one about that task went out in
   the 3 hours before, with none of the task's own reminders in between) on 4+ different days,
   and finished fewer than a quarter of those tasks the same day, gets ONE plain push: "Are
   your reminders helping?" Yes / No (`smart_nudge_help_asked_at`). Android alarm-mode users on
   build 44+ (`HELP_ALARM_FROM_BUILD`, needs the PushFilter actions change) get it as an alarm
   with Yes/No instead. Not within 30 days of the last ask or answer, not on one a day, not
   while paused or a week away, never in quiet hours or the morning summary's hour. No answer
   3 days after the question (a ring-out, a close, a swiped-away push): it's asked once more,
   always as a plain push and only if the same checks still hold
   (`smart_nudge_help_reasked_at`); no answer to that either, and the 30-day wait counts from
   the second ask. Yes changes nothing. No = one Smart Reminder a day, enforced in code
   (`smart_nudge_one_a_day`: checked before planning and against the send ledger right before
   a send; the planner is told and picks the one). If a week of one a day sends 3+ and none of
   their tasks gets finished the same day, one plain push says they're paused and Smart
   Reminders pause (`smart_nudge_paused_at` + `smart_nudge_paused_reason: 'not_helping'`, so
   the morning summary and evening check-in stop too), unless they opened the app in the last
   2 days (they stay on one a day). Unlike the week-away pause, only opening the app ends it;
   they restart on one a day with a fresh week. "Back to normal" in Settings > Reminders turns
   one a day off. Times they set, events and birthdays are never limited or paused. Check:
   `{"email": "…", "helping_preview": true}` to `cronSmartTaskNudge` (it also lists the
   `silent_put_offs` each open task would get). On plain notifications nothing is pressed,
   so each Smart Reminder on a day that's over stands in for a press: finished that day =
   helped, still open = a put-off day (Nov 1 2026; arcticwolf444 previewed at 6 put-off
   days, 3 of 20 finished that day, so asked; Brianna and cjkelso72, on alarms, unchanged
   and not asked). Counted (Anna, Nov 1
   2026: "keep tabs on how many times the 'are your reminders helping' alarms happen"): every
   one that goes out is an AppEvent `reminders_helping_sent` (props `as` alarm | push, `stage`
   first | again | pause, `at`), kept, unlike the 3-day ledger. The owner's daily note
   (cronRefillReminders) has a line when any rang as an alarm since the last count: how many,
   who, and how many in all (`owner_alert_marks.helping_counted_to`); with nothing else to say
   it goes out titled "📊 ADHDone yesterday".

11. **Judge the day, not just the ping (brief r41, Nov 1 2026).** Anna: "Wouldn't the real
   fix be in making the smart reminder ai not be stupid". arcticwolf444 got 8 Smart
   Reminders on Fri Oct 30, each justified on its own ("they close at 5"), none of them
   seen. A paragraph was added to her doc (rev 41) and to `reminderBrief.ts`: before an
   extra ping, look at the whole day; several gone out with no app open since = they aren't
   seeing them, so stop or send only what is truly lost tonight; a place closing today is a
   loss only if it can't happen the next day it's open; a task brought up day after day
   with nothing happening needs a different approach, never more of the same. Checked with
   REPLAY (below): at 3:20 PM that day the old brief sent a 6th ping, r41 sent none; at
   10:30 AM r41 still sent the time-sensitive first mention; at 12:30 PM (3 unseen) none.
   REPLAY: `{"email": "…", "preview": true, "as_of": "<ISO>", "last_active_at": "<ISO>"}`
   to `cronSmartTaskNudge` (owner only) plans as of that moment (later tasks, completions and
   Smart Reminders left out) and saves and sends nothing. Use it to check any brief change
   against a real day before shipping it.

**Do not change `base44/functions/cronSmartTaskNudge`, `base44/shared/reminderBrief.ts`, the
"Smart Task Nudge" workflow, or the `smart_nudge_*` fields on User unless Anna explicitly
asks for that change in her own words.** A request about something else (another feature's
bug, a cleanup, "make it faster", "save credits") is not permission. If a fix somewhere else
seems to need a change here, stop and ask her first.
## 11. THE IPHONE APP — ANDROID-ONLY THINGS NEVER SHOW THERE

The iPhone app (built by Haris, Oct 2026) loads this same website. Anna, Oct 22 2026: "show
certain things to android users only and then show only the things that work to iphone users.
Like the wakeup thing. That cant be in the settings for iphone users and that popup cant happen
either."

- **`src/lib/phonePlatform.js` is the one list.** `onThisPhone('<feature>')` is false in the
  iPhone app for every Android-only feature (wake-up detection, the pinned notification,
  vibrate-only on silent, Google Play's update popup, Android's alarm switches, the Android
  how-to clips) and for the ones still waiting on Haris (spoken alarm, share extension, widget).
  Anything new that only Android can do goes on that list and gets an `onThisPhone` check.
  On Android and the plain website every check passes, so nothing there changes.
- **Never rely on "the plugin doesn't have that method"** to hide something on iPhone; the
  iPhone plugins may have a method of the same name. Check `onThisPhone` as well.
- **No "Android", "Google Play", "Play Store" or "Samsung" on an iPhone screen.** Apple turns
  down apps that name other phone platforms (App Review Guideline 2.3.10). Use `phoneOs()`
  ("Android" / "your iPhone") in sentences.
- **Alarm switches:** `alarmSwitchesOff(st)` in widgetBridge decides what's missing. On iPhone,
  `AlarmBridge.getStatus()` reports `{ notifications, alarms }` (alarms = AlarmKit's own
  permission) and `AlarmBridge.requestAlarmAccess()` asks for it.
- **Alarm spacing on iPhone:** until `IPHONE_SPACES_ALARMS` is true, the website merges alarms
  within 10 minutes into one before sending the list (foldClusters). A time the person set is
  never merged or moved.
- **Still open (server side):** `wakeStartMs` in `base44/shared/quietHours.ts` trusts
  `wake_watch`. The iPhone app sets an account's `wake_watch` back to null when it opens (it
  can't watch for waking), so this only matters for someone using an Android and an iPhone at
  once. `app_platform` on User says which phone app they last opened.
