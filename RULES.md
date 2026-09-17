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

## 2. PUSH NOTIFICATIONS: TARGET BY EXTERNAL ID ONLY — NEVER PLAYER IDS

**Every OneSignal send in this app targets `include_external_user_ids: [userEmail]`. Never use `include_player_ids`. Never gate a send on `user.onesignal_player_ids` being non-empty.**

Devices register through `OneSignal.login(email)`, so the user's email IS their OneSignal external id. Stored player ids go stale on reinstall/reset and were never a reliable target.

```ts
payload.include_external_user_ids = [userEmail];
payload.channel_for_external_user_ids = 'push';
```

This cost roughly 11 months of silent failures: `notifySend` hard-returned `{ success: false, error: 'No player IDs' }` whenever a user had no stored player id, which killed the 7 PM motivation push, the weekly recap, and achievement notifications outright — while the scheduler still reported "Successful".

Before finishing ANY task involving notifications, search for `include_player_ids` and `onesignal_player_ids` and confirm no send path depends on them.

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

**Deleted (Sept 2026) — do not re-add:** `cronSmartMotivation` (7 PM check-in), `cronWeeklyRecap`, `cronTrialWarnings`. All three were dead for ~11 months due to the player-id bug above and are not wanted.