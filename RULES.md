# PROJECT RULES — DO NOT VIOLATE

**READ THIS ENTIRE FILE BEFORE PROPOSING A FIX, NAMING A ROOT CAUSE, OR WRITING CODE.**
Not after. Not "if it seems relevant." First. Every conversation.
Most of the mistakes this file exists to prevent were not caused by the rules being
missing — they were caused by starting to talk before reading them.

## 1. NO BASE44 LLM — EVER

**This is a hard, non-negotiable rule. Never call `base44.integrations.Core.InvokeLLM` or `base44.asServiceRole.integrations.Core.InvokeLLM` anywhere in this codebase — not in backend functions, not in frontend components, not in utilities. No exceptions.**

All LLM/AI calls must use the OpenAI SDK directly with the app's `OPENAI_API_KEY` environment variable.

**Backend (Deno) pattern:**
```ts
import OpenAI from 'npm:openai';
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [/* ... */],
});
```

**Frontend pattern** — call a backend function that uses OpenAI; do NOT call Base44's InvokeLLM from the client.

If you need to add AI/LLM functionality, use OpenAI only. If you are not sure whether something uses Base44's LLM, search the codebase for `InvokeLLM` before proceeding.

### Files that previously violated this rule (now fixed):
- `base44/functions/generateReminderSchedule/entry.ts`
- `base44/functions/generateDailyTip/entry.ts`
- `src/components/utils/birthdayScheduler.jsx`
- `src/components/utils/calendarEmojiResolver.js`

Before finishing ANY task involving AI/LLM, run a codebase search for `InvokeLLM` to confirm zero results.

## 2. PUSH NOTIFICATIONS ARE DELIVERED BY EXTERNAL ID (USER EMAIL)

**When reasoning about, explaining, or debugging notifications: this app delivers by EXTERNAL ID — the user's email. Devices register through `OneSignal.login(email)`, so the email IS the OneSignal external id. Never claim notifications are targeted by player id, and never conclude a user "has no registered device" because `onesignal_player_ids` is empty — that field is incidental, not the delivery mechanism.**

```ts
payload.include_external_user_ids = [userEmail];
```

Some senders still contain a legacy `include_player_ids` branch with an external-ID fallback (`sendOneSignalPush`, `cronDailyDigest`, `cronCommuteWatch`, and the two direct pushes in `cronRefillReminders`), and `notifySend` still returns `{ success: false, error: 'No player IDs' }` when the field is empty.

**DO NOT "fix" any of that unless Anna explicitly asks.** Rewriting those branches changes live delivery for real users, and removing the `notifySend` guard would REVIVE pushes that have been silent for ~11 months. This is knowledge for explaining behavior, NOT a license to refactor.

## 3. NOTIFICATION SENDERS THAT ACTUALLY EXIST

Do not describe, revive, or reference removed crons. The live senders are:

| Sender | Trigger | Role |
|---|---|---|
| `cronRefillReminders` | hourly | Books recurring-task pushes, promotes event/birthday reminders into OneSignal's ~30-day window, yearly birthday rollover, hourly day-of text follow-ups |
| `cronSmartTaskNudge` | every 30 min | One LLM-planned nudge per user per run, for day-only / no-time tasks |
| `cronDailyDigest` | every 30 min | One morning summary per user after quiet hours end |
| `cronCommuteWatch` | every 15 min | "Time to leave" + traffic heads-up |
| `onTaskUpdate` | Task entity events | Cancels / re-books on complete, snooze, delete, back-burner, un-complete, reminder-field edits |
| `cronDuplicateWatch` | hourly | Cleans duplicates, emails the owner — sends no user pushes |
| `schedulePush` / `notifySend` | called by the above | The actual OneSignal calls |

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
   the app doesn't actually have.

## 5. ALREADY BUILT — DO NOT PRESENT THESE AS NEW

The failure here is not only rebuilding. It is **announcing an existing feature as if it
were a new idea** — "let me add idempotency to calendar sync," "I'll build a dedupe
ledger," "we should track scheduling races." Anna has already paid for these, in credits
and in time. Presenting them as new is the same insult whether or not code gets written.

Before proposing ANY mechanism below, assume it exists and go read it.

| Mechanism | Where it lives | What it already does |
|---|---|---|
| Push deduplication / anti-stacking | `NotificationLedger` entity + `base44/shared/sendLedger.ts` | Blocks duplicate and stacked pushes, evicts proactive sends for time-critical ones |
| Calendar import idempotency | `Task.google_event_id` | One imported Google event = one task, per user, across overlapping syncs |
| Capture idempotency | `Task.capture_id` | Native share-sheet retries can't double-create |
| Creator/cron race protection | `Task.reminder_scheduling_since` + `commitNotificationIds` | Refill cron stays out while the creator is still booking |
| Per-user sync locking | `calendar_sync_in_progress_since` + heartbeat | One active Google Calendar sync per account |
| Guessed-recurrence stripping | `stripGuessedRecurrence` in `taskSchedule.js` | Kills recurrence the user never asked for |
| Quiet hours | `base44/shared/quietHours.ts` + `applyQuietHours` | Timezone-aware overnight suppression |
| Far-future scheduling | `planned_` placeholder entries, promoted by `cronRefillReminders` | OneSignal can't book past ~30 days; placeholders bridge it |
| Reminder interval decision | `base44/shared/reminderIntervalDecision.ts` | The single place interval classification happens |
| Server-side task parsing | `base44/shared/runTaskParse.ts` + `taskParsePrompt.ts` | One parser. Never add a second one (native-side parsing was tried and rejected) |

### Correct states that are NOT bugs
- **Subtasks never have notifications.** A subtask (`parent_task_id` set) with null
  `reminder_interval`, null `next_reminder`, and null `notification_recipient_email` is
  CORRECT AND INTENTIONAL. Anna has said this more than once. Do not "fix" it, do not
  flag it in a diagnostic as a problem, do not schedule pushes for it.
- Birthdays never appear in standard task lists or views — that is by design.

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