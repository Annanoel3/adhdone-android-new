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
| `cronRefillReminders` | hourly | Books recurring-task pushes, writes the reminder plan for one-time tasks dated more than ~30 days out, promotes planned event/birthday reminders into OneSignal's ~30-day window, yearly birthday rollover, repeating-task rollover (a task not checked off by 4 AM their time moves on to the next day, with its reminders, when it repeats again the very next day: every day, weekdays Mon–Thu, Saturday into Sunday; one with a gap before its next day (weekly, monthly, Friday to Monday) stays until checked off and the app makes the next copy then; a repeating event moves on to its next date once it has happened; Anna, Oct 17–18 2026), hourly day-of text follow-ups |
| `cronSmartTaskNudge` | every 10 min | Smart Reminders, which covers nearly every task. The AI picks only each person's NEXT nudge, the run sends it when due, then the AI looks again. Never a day booked ahead: see §10 before touching it |
| `cronDailyDigest` | every 30 min | One morning summary per user after quiet hours end |
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
| First-time help | `src/components/onboarding/PageIntroTour.jsx` + `pageIntros.js` (one card the first time a page is opened: Calendar, Focus Timer, Parking Lot, Birthdays), `FirstUseDialog.jsx` (features behind a button: Focus Mode, Quick Capture), `src/components/shared/AppGuideModal.jsx` (the App Guide in the menu, red dot + pulse until opened) | "A quick how-to when someone opens a feature for the first time" already exists; don't propose it as new. Home has no card on purpose (the welcome chat is the intro) and the Tasks 4-video walkthrough is switched off (`ADD_PATHS_WALKTHROUGH_ON`, lives in the App Guide). Since Oct 24 2026 the guide is a table of contents: every section starts closed (one short row each, so the whole list fits on a phone screen with nothing open; tap a row to open it, videos load only then; reopening the guide starts closed again), and the first row is "Start here": how to add something (task, event, birthday or Parking Lot idea, sorted on its own), alarm vs notification (links to `/settings?section=reminders#alarms`), and how to find the guide again. The rows mirror the side menu: Home; Tasks (nested: Adding tasks is easy — with each way to add (Say it, Share selected text, Share a screenshot, widget, pinned notification) its own nested row since Oct 27 2026, so one video shows at a time — Task Timer, Focus Mode); Calendar; Birthdays; Tools (Focus Timer, Parking Lot, Record Notes where the recorder exists, Decision Maker, Places); Reflect (Talk It Out, Insights, Diary); Settings (Themes, Quiet Hours). Nested rows open and close on their own. Flags on `User.onboarding_flags` (`tour_seen_v4_<Page>`, `onboarding_guide_seen`) say what a person has seen |
| Parking Lot trackers | `ParkingLotIdea.tracker` + `tracker_entries [{at, text, note?}]` + `tracker_companions`; all UI in `src/pages/ParkingLot.jsx` (History dialog, `addTrackerEntry`, `setTrackerEntryNote`, `removeTrackerEntry`) | Readings said together (blood pressure + heart rate) are one record and one chart; a note said with the reading rides on its entry and shows under it and on its chart dot. Since Oct 24 2026 a note can be added to a reading after the fact, or changed, from the History list ("Add a note" / "Edit note" under each record, edited in place, no second popup); an empty note takes it off. A tracker is only ever made after the "Keep track of …?" popup |
| Recorded notes (Record Notes) | `base44/functions/transcribeAudioNew/entry.ts` (`notes_make`, `fillGaps`, `notes_fill`, `notes_ask_one`, admin `notes_try`), page `src/pages/InstallInstructions.jsx` (the Notes page) | Notes are written by Astra at medium effort (Oct 27 2026; Luna had them from Oct 18 and left things out), under a prompt that says to leave nothing out, with list caps big enough for a long visit (60 to-dos, 100 details, 40 sections × 25 points), and then a SECOND READ of the transcript against the notes that adds whatever was missed (`fillGaps`, merged by meaning, nothing already there touched). The same second read runs on request from a recording's page ("Check the transcript for anything these notes missed", `notes_fill`) for notes made earlier. Every recording's page has "Ask this recording" (`notes_ask_one`): the whole transcript (follow-ups included) is read, the answer comes with the speaker's exact words, and each quote is checked against the transcript word for word before it's shown (a reworded or invented one is dropped). Self-test: admin `{mode:"notes_try", transcript, model?}` returns the notes plus `second_read_added`; `{mode:"notes_try", transcript, question}` runs the ask. Tested Oct 27 2026 on a 13-minute doctor-visit transcript: every number, dose, name, date and instruction present, second read added 0; ask answered with two verbatim quotes and said plainly when a topic never came up |
| Duplicate a task or event | `src/components/utils/duplicateTask.js` + the Duplicate link on the details card (`TaskDetailsModal`, not on birthdays or steps); the Tasks page opens `?taskId=` | Since Oct 25 2026. The copy keeps what the task is (title, notes, place, kind, urgency, repeat pattern, alert style, pictures, its steps unchecked) and nothing about when or what was booked: no date, time, reminders, plan, calendar row or capture id. It opens on its own card, where picking the date or time books reminders through the card's normal path; a copied task with no date is a Smart Reminders task like any other, a copied event waits for its date. Never create the copy's reminders any other way |
| Seasonal-theme secret ("what's this? 👀") | `src/components/home/HomeSecretLink.jsx` (`SECRET_SPOTS`, `secretSpotToday`), mounted once per spot: WelcomeCard, QuickActions (beside the per-row switch), TodaysTasks (top of Today's Focus), DailyTipCard, Layout (under the Home page) | Since Oct 27 2026 it stays on Home and sits in a different one of five spots each day, picked from the date (Anna: "change its position on the home screen every day"); before, it wandered page to page at the very bottom, where a one-minute visit never scrolled, and only Tabitha found it in the week it was pinned to Today's Focus. Found once (seasonal_unlocked), it's gone for good |
| Task page sections remember open/closed | `src/components/tasks/TaskSections.jsx` (`tasks_sections_collapsed` on the phone) | Since Oct 27 2026 (Anna: "if someone has upcoming and other things collapsed or expanded on their tasks page, make sure it stays that way"). Named sections (Today, Tomorrow, Next 7 Days, Upcoming, Later, Birthdays, Back Burner) keep the state they were left in; Back Burner, Birthdays and an empty day start closed, the rest open; one tap opens a closed-by-default section (it used to take two). Days-view day sections have daily keys and start from the defaults |
| Priority is tappable on the collapsed card | `TaskCard.jsx` (the priority pill is a Popover trigger) | Since Oct 27 2026 (Anna: "change the priority by just clicking on it"); the same picker the opened card has |
| Tag pills on dark themes and seasonal skins | `LifeAreaPill.jsx` `TAG_PALETTE[].dark` (solid 600 fill, white text) | Since Oct 27 2026: a filled label like the light theme's, not coloured text; the 600 shades and text-white are ones the night-season glass leaves alone |
| Calendar month cells | `CalendarGrid.jsx` (`CHIP_COLORS`, inline colours) | Since Oct 27 2026 (Anna: her phone's calendar widget "fits more words"): no cell borders or inner padding, hairline gaps, 10px filled chips with inline colours the seasonal glass can't rewrite (it had turned them into plain coloured text on Halloween), cancelled items last. Dots instead of words were proposed and rejected ("I disagree... it fits more words") |
| Home shortcuts | `src/components/home/homeShortcuts.js` (the list and the save), `src/components/home/QuickActions.jsx` (the tiles and the "Add a shortcut" / "Edit shortcuts" picker under them), `User.home_tiles` | Since Oct 27 2026 (Anna: "if someone uses record notes often, they can add a tile"). Add is the only fixed tile; the saved list is everything after it. The default row is Timer + Focus Mode, each removable like any other (Anna: "give them the ability to get rid of timer"). The welcome card's row of small circles (Focus Mode, Pomodoro, Decisions, Parking Lot) came off Oct 27 2026 ("now that I have made shortcuts, we don't really need the spot"; `FocusModeButton.jsx` and `QuickToolButtons.jsx` deleted) — a running Focus Mode still shows its own bar (FocusModePrompt). Focus Mode's tile fires the `open-focus-prompt` event rather than opening a page. Any menu page can be a tile: Record Notes (only where the recorder exists), My Tasks, Calendar, Birthdays, Parking Lot, Pomodoro, Decision Maker, Places, Talk It Out, Insights, Diary, Settings. Same look as Add, two to a row, in the saved order; the picker lists the row with up/down arrows and ×, then the rest under "Add a tile" (Anna, Oct 27 2026: "let users reorder them around"). Add alone goes full width. A tiny switch beside Edit shortcuts cycles tiles per row 2 → 3 → 4 (`User.home_tile_cols`, phone copy first; smaller padding, icon and label at 3 and 4). Saved on the phone and the account, phone's copy first (the task_sort rule). Don't add a tile for anyone, and don't make one show by default |
| Timer offered only where it fits | `takes_time` from the parser (`shared/taskParsePrompt.ts`), `LaunchPicker.jsx` (Home → Timer), `TaskDetailsModal` (the Timer block), `TimeItButton` (the collapsed card) | Oct 27 2026 (Anna: "Timer is really only good for certain work things, school things, chores that take at least 5 minutes"). The Home Timer list shows only the tasks the parser judged worth timing, with the rest behind "Time something else"; the card's Timer block and the collapsed-card Time it are hidden when the parser said `takes_time: false` (vitamins, the litter box, new batteries). A task the parser never judged (older than Oct 3 2026, `takes_time` empty) keeps the card's Timer block. Never time an event or a birthday |
| Owner alerts | `ownerHealthCheck` in `cronRefillReminders` (hourly) | Pushes Anna's phone (s2kap2chick) when the app is down or failing people. Since Oct 19 2026 (after Michelle: "this should have been flagged") also about one person by name, once per happening: quiet hours moved for them, about to be asked about, or the model unsure (9); 2 or more alarms in 2 days rang out or were left with Home or Back, counted from every report the phone sends (AppEvent `alarm_choice`, written by `cancelTaskNotifications`), not only each task's last choice — but a ring whose task got checked off within 3 hours is answered, not missed (Chad lets his 8 AM medication alarm ring out and finishes it from the notification 40 minutes later every day; the alert called that "going unanswered" on Oct 27 2026), and a ring under 3 hours old with the task still open is too soon to count (10); a phone that stopped taking pushes or has notifications off, for anyone in the app in the last 14 days (11), told ONCE per departure, and someone known to be gone (push_unreachable_at after their last open) is left out of every other check (Anna, Oct 27 2026: "if we know someone uninstalled, I don't want to keep getting reminders about it"). What has been told is remembered on Anna's own User record, `owner_alert_marks` (`gone:<email>` = the last_active_at the alert was about; `alarms:<email>` = when the last alarms alert went out), NOT in the NotificationLedger: the ledger is pruned after a few days, so "did I already send this" forgot Michelle's Saturday alert by Wednesday and sent it again (Oct 28 2026, after three repeats in four days — Anna: "I don't know what to pay attention to"). Alarms alerts about one person rest 7 days between sends. The daily note no longer repeats the alerts: it lists only captures that never finished and new signups, and is skipped when there are none. Her own accounts and family who only installed it are left out. Test Function `{"markTold": [{"key": "gone:<email>", "value": "<their last_active_at>"}]}` (owner only) writes a mark by hand. Deploying: the editor's redeploy-function endpoint makes the Test Function panel run the new code, but the Reminder Refill workflow run 22 minutes after a redeploy (Oct 27 2026, 8:45 AM) still ran the old code — count a backend fix as live for the workflows only after Publish. `{"previewHealth": true}` from the owner's account shows what it would send, sending nothing |

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
   it off; Done doesn't. The
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
