# PROJECT RULES — DO NOT VIOLATE

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