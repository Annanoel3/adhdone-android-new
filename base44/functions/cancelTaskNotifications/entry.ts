// Nov 27 2026 (midday): FRESH PUSH ADDRESS. When a notification to a phone has been refused by Google's push service since that phone's last 12-hour check, the answer to its next check carries fresh_push_address: true, and the Android build after 49 throws its push address away and gets a new one (PushHealthWorker); builds before ignore the word. The check also keeps an 8-character one-way tag of the address before and after (never the address), so a phone that keeps handing over a refused address can be seen.
// Re-saved Nov 25 2026 (night) so the bundled shared/claudeAi.ts and shared/aiCost.ts are picked up: Claude for everyone is ready and held off until the app's disclosures name Anthropic (CLAUDE_JOBS_LIVE, CLAUDE_EVERYONE), and when the Claude credit runs out calls go straight to OpenAI (CREDITS GONE). Nothing else in this file changes.
// Nov 16 2026 (late): the off switch for the phone's new alarm screen (Android build 49: a big round Done, a Later bar that has to be held; Anna: "Your design is good too"). The answers to the phone's own reports (the 12-hour check-in, and a choice made on an alarm) now carry alarm_screen, "classic" or "new" (shared/alarmScreen.ts: User.alarm_screen for one person, a constant for everyone). Builds before 49 ignore the extra word; nothing else changes. Re-saved once more for the bundled shared/reminderTitle.ts: an alarm about a task that IS sending someone a text carries the words for its open button ("Send the text" / "Write the text").
// Nov 16 2026 (night): how long a Later or a snooze keeps a task quiet is JUDGED per task (shared/notNowBreak.ts, gpt-6-astra), with Anna's table as the limit: shorter than the table when the task should not wait that long, never longer, never under 20 minutes, and never shorter than the break before it that day. No answer within 8 seconds and the table's own length is used, as before. Anna: "it's supposed to be smart, so how quick something comes back should be based on intelligence", and yes to it "as long as it doesn't go too long or overload with notifications". See "Not now" below.
// Re-saved Nov 15 2026 (evening) so the bundled shared/nextCopy.ts, taskParsePrompt.ts and runTaskParse.ts are picked up: the next copy of a repeating call-someone task keeps who it's to and their number (Task.calls_someone, call_person, call_phone), and the parser says when a task IS making a phone call. Nothing else changes here.
// Re-saved Nov 15 2026 (afternoon) so the bundled shared/nextCopy.ts, taskParsePrompt.ts and runTaskParse.ts are picked up: the next copy of a repeating text-someone task (Task.texts_someone) keeps who it's to and their number, the same as the app's own copy does (the words are typed fresh each round); the parser says when a task IS sending someone a text (Anna: "If someone makes a task to text someone, maybe we should use our ability to press send from the app").
// Re-saved Nov 15 2026 so the bundled shared/nextCopy.ts, taskParsePrompt.ts and runTaskParse.ts are picked up: the next copy of a repeating event keeps how long it runs (Task.event_guess_minutes; never shown, read only by shared/leaveOrigin.ts) and whether it means going somewhere (goes_somewhere), the same as the app's own copy does; the parser reads an event's end when the person gave one and estimates its usual length when they didn't (Anna: "Wish we could tell which events lasted an hour vs which ones last like 5 hours").
// Re-saved Nov 14 2026 (afternoon, a second time) so the bundled shared/nextCopy.ts and nthWeekday.ts are picked up: a monthly repeat on a date gets its next copy on the same DAY of next month, or that month's last day when it is shorter, and goes back to its own day after (Jan 31 -> Feb 28 -> Mar 31, Task.recurrence_month_day; adding a month to the date turned Jan 31 into Mar 3 for good). Anna: "if someone makes something monthly, they actually mean that same day each month".
// Re-saved Nov 14 2026 (afternoon) so the bundled shared/nextCopy.ts, runTaskParse.ts and nthWeekday.ts are picked up: a monthly repeat on a weekday of the month ("the second Tuesday", Task.recurrence_nth_weekday) gets its next copy on that weekday of next month (Anna: "we need a way to allow users to make recurring for second tuesday of every month, third thursday, first monday").
// Re-saved Nov 14 2026 so the bundled shared/runTaskParse.ts and nextCopy.ts are picked up: the parser no longer invents a "next step" for a chore and a repeating task's next copy carries none (Anna: "Remove it").
// Re-saved Nov 12 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r44, a chore is only brought up when there is time to finish it before their bedtime (laundry at 10:29 PM, an hour before quiet hours; Anna: "Too late to be suggesting this").
// Re-saved Nov 11 2026 so the bundled shared/easeOff.ts is picked up: the lowest eased plan is one regular notification every other day.
// Re-saved Nov 11 2026 so the bundled shared/easeOff.ts is picked up: with the morning summary gone, the eased plans are the one alarm or notice a day alone, and no task is put on the lowest plan until its new rhythm is decided.
// Re-saved Nov 11 2026 so the bundled shared/nextCopy.ts is picked up: a repeat whose next copy was never made is repaired up to 30 days later (was 3), and only where the repeat really stopped (no open or newer copy of it).
// Re-saved Nov 11 2026 so the bundled shared/sendLedger.ts is picked up: reminder history is filed by what OneSignal says happened (sent, reached no phone, or cancelled and not kept).
// Nov 11 2026: mode push_change (PushChangeWatch, Android build 49): every change to a phone's push sign-up, logged the moment it happens in User.phone_push_log.
// Re-saved Nov 10 2026 so the bundled shared/taskParsePrompt.ts is picked up: a shared or pasted confirmation gets a short calendar-style title (no order numbers, order dates, hours or fine print), and a dated visit for care or tests is an event.
// Re-saved Nov 9 2026 (night) so the bundled shared/easeOff.ts is picked up: a one-time task is never put on the morning-summary-only plan.
// Re-saved Nov 7 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r43, store runs wait for daytime or early evening (after about 7 PM, the next day).
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 4 2026 (night) so the bundled shared/sendLedger.ts is picked up: an event's night-before / morning-of / prep ask is never cancelled to make room for a task's reminder booked after it.
// Re-saved Nov 4 2026 (evening) so the bundled shared/reminderTitle.ts is picked up: an appointment with no prep note yet gets "Add prep notes" as its night-before / morning-of alarm's second button (shared/prepNote.ts).
// Re-saved Nov 4 2026 (event alarms, all of them) so the bundled shared/reminderTitle.ts is picked up: every reminder of a timed event rings for an alarm user (night before, morning of, hour before, leave now, its time).
// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Re-saved Oct 17 2026 so the bundled shared/runTaskParse.ts, shared/taskParsePrompt.ts and shared/reminderTitle.ts are picked up: everything they ask runs on gpt-6-astra, the parser's calendar beats the real date astra is given, and "tomorrow morning" / "Sunday night" get a time.
// Re-saved Oct 16 2026 so the bundled shared/reminderTitle.ts is picked up: a daily reminder after its first day reads as a reminder, never "slipped past".
// Re-saved Oct 13 2026 (night) so the bundled shared/reminderTitle.ts is picked up: an appointment's alarm carries "Record notes" as its second button.
// Re-saved Oct 13 2026 (evening) so the bundled shared/reminderTitle.ts is picked up: an event's alarm is marked `event` for the phone (build 42 on shows "Got it" only).
// Re-saved Oct 13 2026 so the bundled shared/reminderTitle.ts is picked up: a timed event's alarm rings at its time (and "leave now"), its heads-ups stay pushes.
// Re-saved Oct 12 2026 (pets) so the bundled shared/reminderTitle.ts is picked up: a pet's birthday alarm has no "Write a text" button.
// Re-saved Oct 12 2026 so the bundled shared/reminderTitle.ts is picked up: a time
// they set inside quiet hours rings as an alarm (throughQuiet), RULES.md §9 Q4.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCancel } from '../../shared/sendLedger.ts';
import { userTimeZone, resolveQuietHours, localMinutesOfDay } from '../../shared/quietHours.ts';
import { judgeBreakMinutes, BREAK_MIN_MINUTES } from '../../shared/notNowBreak.ts';
import { alarmScreenFor } from '../../shared/alarmScreen.ts';
import { pushPhoneAlarms, phoneAlarmsFor } from '../../shared/reminderTitle.ts';
import { judgeAlarmPairs } from '../../shared/runTaskParse.ts';
import { putOffFields, easeStep } from '../../shared/easeOff.ts';
import { repairMissingRepeatsAs } from '../../shared/nextCopy.ts';
import { aiServe } from '../../shared/aiPerson.ts';

// ── Mode "later": a break the person asked for ───────────────────────────────
// Later on an alarm (or a reminder's notification) used to change nothing but a
// count. From Oct 6 2026 it gives the task a break, and from Oct 20 2026 a
// snooze does too (see "Not now" below for how long). Same rule as
// widgetBridge.js laterBreakUntil,
// which applies it when the app syncs; the phone (1.3.14+, LaterBreak) calls
// this the moment Later is tapped so it takes effect with the app closed.
// Here: the task's booked pushes inside the break are cancelled (found in the
// send ledger, which has every booked push with its time), a rhythm's next ping
// moves to the break's end, the nudge planner is told its plan is out of date,
// and the phone gets the task's alarm list without the break's alarms.
const LATER_BREAK_MS = 3 * 60 * 60 * 1000;
// "Done for the day" ends at their morning: when their quiet hours end
// (08:00 unless they changed it), next one coming, never less than three hours.

function zoneParts(ms: number, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const g: Record<string, string> = {};
  for (const x of p) g[x.type] = x.value;
  return { y: Number(g.year), m: Number(g.month), d: Number(g.day), h: Number(g.hour), min: Number(g.minute), s: Number(g.second) };
}
function zoneDateKey(ms: number, timeZone: string): string {
  const z = zoneParts(ms, timeZone);
  return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
}
// The instant of a wall-clock time in a zone (good to the minute across DST).
// Each pass moves the guess by how far its wall clock is from the one wanted.
// (Until Oct 10 2026 the second pass measured against the guess instead of the
// wanted time and added the zone offset twice: a second Later in Austin ran
// to 1 PM the next day instead of 8 AM.)
function atZoneTime(y: number, m: number, d: number, hour: number, timeZone: string, minute = 0): number {
  const want = Date.UTC(y, m - 1, d, hour, minute, 0);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const z = zoneParts(guess, timeZone);
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
    guess += (want - asUtc);
  }
  return guess;
}

// ── "Not now": Later, or a snooze (Anna, Oct 20 2026) ────────────────────────
// Each time someone says "not now" to a task in a day, it gets a break, by its
// priority (Anna's table):
//   1st: 3 hours (low, medium), 2 hours (high), 1 hour (urgent)
//   2nd: 3 hours (low, medium, high), 1 hour (urgent)
//   3rd: done for the day (low, medium); 2 more hours (high, urgent)
//   4th: done for the day (high, urgent)
// Done for the day runs until their next morning, when their quiet hours end.
// A snooze is one "not now" however many times in a row it's snoozed, and its
// break starts once the snooze has rung again: the ring they asked for always
// comes. Two things end a break early: the time they set for the task today
// still rings (Anna, Oct 10 2026: Later on an early reminder means nothing
// more until the named time), and a "by" deadline later today keeps one
// reminder 30 minutes before it.
// Until Oct 20 a task due today, or an urgent one, got no break at all (Oct 11
// 2026, after a second Later sent "Go to PetSmart" to the next morning), and
// every daily routine is due today: Anna's vitamins rang 6 times on Oct 19,
// three of them after she'd said Later ("it becomes harassment once a user
// presses a later or time button").
const HOUR_MS = 60 * 60 * 1000;
const NOT_NOW_STEPS: Record<string, (number | 'day')[]> = {
  low: [3, 3, 'day'],
  medium: [3, 3, 'day'],
  high: [2, 3, 2, 'day'],
  urgent: [1, 1, 2, 'day'],
};

// A time as the platform stores it (it can come back with no zone letter; UTC).
function parseMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

// Which "not now" this is today for the task (1 = the first).
function notNowLevel(task: any, timeZone: string, atMs: number): { day: string; level: number } {
  const day = zoneDateKey(atMs, timeZone);
  const sofar = task?.not_now_day === day ? Math.max(0, Math.floor(Number(task?.not_now_count) || 0)) : 0;
  return { day, level: sofar + 1 };
}

// Their next morning: when their quiet hours end (08:00 unless they changed
// it; Anna, Oct 10 2026: not everyone's morning is 8), never less than three
// hours away.
function nextMorning(fromMs: number, timeZone: string, owner: any): number {
  const endMin = resolveQuietHours(owner).endMin;
  for (const dayOffset of [0, 1, 2]) {
    const z = zoneParts(fromMs + dayOffset * 24 * HOUR_MS, timeZone);
    const at = atZoneTime(z.y, z.m, z.d, Math.floor(endMin / 60), timeZone, endMin % 60);
    if (at > fromMs) return Math.max(at, fromMs + LATER_BREAK_MS);
  }
  return fromMs + LATER_BREAK_MS;
}

// The time they set for the task today still rings, and a "by" deadline later
// today keeps one reminder 30 minutes before it.
function clipToTheirTime(task: any, timeZone: string, startMs: number, untilMs: number): number {
  const raw = task?.due_date ? String(task.due_date) : '';
  if (!raw || raw.length <= 10 || task?.day_only_task) return untilMs;
  const dueMs = parseMs(raw);
  if (!Number.isFinite(dueMs) || dueMs <= startMs) return untilMs;
  if (zoneDateKey(dueMs, timeZone) !== zoneDateKey(startMs, timeZone)) return untilMs;
  const cap = task?.deadline_style === 'by' ? dueMs - 30 * 60 * 1000 : dueMs;
  return cap > startMs && cap < untilMs ? cap : untilMs;
}

// The table's own end for this "not now" (Anna's table above), from startMs.
function tableUntil(task: any, timeZone: string, startMs: number, owner: any, level: number): number {
  const steps = NOT_NOW_STEPS[String(task?.urgency || '')] || NOT_NOW_STEPS.medium;
  const step = steps[Math.min(Math.max(1, level), steps.length) - 1];
  return step === 'day' ? nextMorning(startMs, timeZone, owner) : startMs + step * HOUR_MS;
}

// JUDGED LENGTH (Anna, Nov 16 2026; shared/notNowBreak.ts). The table is the
// limit, not the length: the model reads what the task is and may make this
// break shorter than the table, never longer and never under 20 minutes. A
// second or third "not now" the same day is never shorter than the one before
// it (when that one's length is still on the task). Null = no answer in time,
// a tap that reached us long after it was made, or nothing to shorten: the
// table's own length is used, exactly as before this existed.
async function judgedBreak(
  base44: any, task: any, owner: any, timeZone: string, startMs: number, nowMs: number,
  level: number, day: string, how: 'later' | 'snooze', tapMs: number,
): Promise<{ minutes: number; why: string } | null> {
  try {
    if (!owner || task?.status !== 'active') return null;
    if (nowMs - tapMs > 10 * 60 * 1000) return null;
    const limitMinutes = (tableUntil(task, timeZone, startMs, owner, level) - startMs) / 60000;
    if (!(limitMinutes > BREAK_MIN_MINUTES)) return null;
    const q = resolveQuietHours(owner);
    // How fast a Later was pressed: the newest reminder about this task that
    // went out in the minute before the press (an alarm rings for a minute).
    let answeredSecs: number | null = null;
    if (how === 'later') {
      const rows = await base44.asServiceRole.entities.NotificationLedger.filter({ task_id: task.id }, '-send_at', 20).catch(() => []);
      let best = NaN;
      for (const r of rows || []) {
        const at = new Date(r?.send_at || 0).getTime();
        if (Number.isFinite(at) && at <= tapMs + 3000 && tapMs - at <= 60 * 1000 && !(best > at)) best = at;
      }
      if (Number.isFinite(best)) answeredSecs = Math.max(0, (tapMs - best) / 1000);
    }
    const judged = await judgeBreakMinutes(task, owner, {
      nowMs, timeZone, level, how, limitMinutes,
      quietStartMin: q.enabled ? q.startMin : 0,
      quietEndMin: q.enabled ? q.endMin : 0,
      localMin: localMinutesOfDay(new Date(nowMs), timeZone),
      answeredSecs,
    });
    if (!judged) return null;
    // Never shorter than the break before it today.
    const prev = task?.not_now_day === day ? Number(task?.last_alarm_choice?.break_minutes) : NaN;
    const minutes = Math.min(Math.round(limitMinutes), Number.isFinite(prev) && prev > judged.minutes ? Math.round(prev) : judged.minutes);
    return { minutes, why: judged.why };
  } catch (e) {
    console.error('[cancelTaskNotifications] break length not judged, the table stands:', (e as any)?.message || e);
    return null;
  }
}

// When this "not now" break ends. startMs: when it starts (the tap for Later,
// the snooze's ring for a snooze). judgedMinutes: JUDGED LENGTH above.
function notNowUntil(task: any, timeZone: string, startMs: number, owner: any, level: number, judgedMinutes: number | null = null): number {
  let until = tableUntil(task, timeZone, startMs, owner, level);
  if (judgedMinutes !== null && Number.isFinite(judgedMinutes) && judgedMinutes > 0) {
    until = Math.min(until, startMs + Math.max(BREAK_MIN_MINUTES, judgedMinutes) * 60 * 1000);
  }
  // Never shorter than a break already running.
  const prevMs = parseMs(task?.later_until);
  if (Number.isFinite(prevMs) && prevMs > until) until = prevMs;
  return clipToTheirTime(task, timeZone, startMs, until);
}

// When the phone says the tap happened (build 39 sends it, since a tap made
// with no signal arrives later): trusted within the last 3 days, never ahead.
function tapTime(body: any, nowMs: number): number {
  const at = Number(body?.at);
  return Number.isFinite(at) && at > nowMs - 3 * 24 * 60 * 60 * 1000 && at <= nowMs + 60 * 1000 ? Math.min(at, nowMs) : nowMs;
}

// Puts a task on a break until untilMs: its booked pushes inside the break are
// cancelled (found in the send ledger, which has every booked push with its
// time), a rhythm's next ping moves to the break's end, the nudge planner is
// told its plan is out of date, and the phone gets the task's alarm list
// without the break's alarms. keepSnooze: a snooze is waiting on the phone,
// and an empty list would take it off (AlarmScheduler.replaceTask), so then
// nothing is sent and the phone's next sync tidies up.
async function breakTask(base44: any, task: any, owner: any, untilMs: number, nowMs: number, extra: any, source: string, keepSnooze: boolean) {
  const appId = String(Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
  const restKey = String(Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
  // A tap that only reached us after its break was over: nothing to cancel or move.
  const noBreak = untilMs <= nowMs;
  const isRhythm = !noBreak && !!task.reminder_interval && task.reminder_interval !== 'once';

  // Which booked pushes fall inside the break (a rhythm: every live ping — the
  // refill books a fresh run from the break's end).
  let rows: any[] = [];
  try {
    rows = (await base44.asServiceRole.entities.NotificationLedger.filter({ task_id: task.id }, '-send_at', 200)) || [];
  } catch (_) { rows = []; }
  const dropIds = new Set<string>();
  for (const r of rows) {
    const at = new Date(r?.send_at || 0).getTime();
    if (!noBreak && r?.notification_id && at > nowMs && (isRhythm || at < untilMs)) dropIds.add(String(r.notification_id));
  }
  for (const e of (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : [])) {
    const at = new Date(e?.send_at || 0).getTime();
    if (e?.notification_id && !String(e.notification_id).startsWith('planned_') && at > nowMs && at < untilMs) dropIds.add(String(e.notification_id));
  }
  let cancelled = 0;
  if (appId && restKey) {
    for (const id of dropIds) {
      try {
        const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
          method: 'DELETE', headers: { 'Authorization': `Basic ${restKey}` },
        });
        if (res.ok) cancelled++;
      } catch (_) { /* a push that already went is nothing to cancel */ }
    }
  }
  // (Only the ones still ahead leave the ledger; one already sent stays on
  // the record Smart Reminders budgets from — sendLedger.ledgerCancel.)
  if (dropIds.size) await ledgerCancel(base44, Array.from(dropIds));

  const fields: any = { ...extra, later_until: new Date(untilMs).toISOString() };
  const ids = (task.onesignal_notification_ids || []).filter((id: string) => !dropIds.has(String(id)));
  if (ids.length !== (task.onesignal_notification_ids || []).length) fields.onesignal_notification_ids = ids;
  const schedule = (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : []).filter((e: any) => !(e?.notification_id && dropIds.has(String(e.notification_id))));
  if (schedule.length !== (task.reminder_schedule || []).length) fields.reminder_schedule = schedule;
  if (isRhythm) {
    fields.onesignal_notification_ids = [];
    fields.last_scheduled_until = null;
    fields.next_reminder = new Date(untilMs).toISOString();
  } else if (task.next_reminder) {
    const nr = new Date(task.next_reminder).getTime();
    if (nr > nowMs && nr < untilMs) fields.next_reminder = new Date(untilMs).toISOString();
  }
  await base44.asServiceRole.entities.Task.update(task.id, fields);

  // The planner looks again (with the break on the task's line) on its next run.
  if (owner?.id) {
    const nowIso = new Date(nowMs).toISOString();
    await base44.asServiceRole.entities.User.update(owner.id, { smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso }).catch(() => {});
  }
  // The phone's copy of the task's alarms, without the break's.
  if (owner) {
    const after = { ...task, ...fields };
    if (!keepSnooze || phoneAlarmsFor(after, owner, nowMs).length > 0) {
      await pushPhoneAlarms(after, owner, { before: task, changedAt: nowMs, source });
    }
  }
  return { fields, cancelled };
}

async function applyLaterBreak(base44: any, task: any, body: any, _appId: string, _restKey: string) {
  const nowMs = Date.now();
  // The phone's report queue retries until it hears back: a Later already
  // applied is answered again, never applied twice (each one counts toward
  // the day's "not now"s).
  const reportId = typeof body?.report_id === 'string' ? body.report_id.slice(0, 64) : '';
  const seenIds: string[] = Array.isArray(task.alarm_report_ids) ? task.alarm_report_ids : [];
  if (reportId && seenIds.includes(reportId)) {
    return { success: true, taskId: task.id, later_until: task.later_until || null, duplicate: true };
  }
  const tapMs = tapTime(body, nowMs);
  await logAlarmChoice(base44, task.notification_recipient_email || task.created_by, { task_id: task.id, choice: 'later', atMs: tapMs, report_id: reportId });
  const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by }).catch(() => []);
  const owner = owners?.[0] || null;
  const timeZone = (typeof body?.timezone === 'string' && body.timezone.trim()) || userTimeZone(owner);
  const notNow = notNowLevel(task, timeZone, tapMs);
  const judged = await judgedBreak(base44, task, owner, timeZone, tapMs, nowMs, notNow.level, notNow.day, 'later', tapMs);
  const untilMs = notNowUntil(task, timeZone, tapMs, owner, notNow.level, judged ? judged.minutes : null);
  const extra: any = {
    later_count: (task.later_count || 0) + 1,
    not_now_day: notNow.day,
    not_now_count: notNow.level,
    last_alarm_choice: {
      choice: 'later', at: new Date(tapMs).toISOString(), until: new Date(untilMs).toISOString(),
      // JUDGED LENGTH: what it chose and why, for reading back later.
      ...(judged ? { break_minutes: judged.minutes, break_why: judged.why } : {}),
    },
  };
  if (reportId) extra.alarm_report_ids = [...seenIds, reportId].slice(-20);
  // Later counts as putting it off (Anna, Oct 22 2026): put off on 3
  // different days, it moves to an eased plan (shared/easeOff.ts).
  Object.assign(extra, putOffFields(task, tapMs, timeZone));
  Object.assign(extra, await easeStep({ ...task, ...extra }, owner, nowMs).catch(() => ({})));
  const { fields, cancelled } = await breakTask(base44, task, owner, untilMs, nowMs, extra, 'laterBreak', false);
  console.log(`[cancelTaskNotifications] Later (not now #${notNow.level} today) for task ${task.id}: break until ${fields.later_until}${judged ? ` (judged ${judged.minutes} min: ${judged.why})` : ' (the table)'}, ${cancelled} push(es) cancelled`);
  return { success: true, taskId: task.id, later_until: fields.later_until, canceledCount: cancelled };
}

// A snooze is a "not now" too (Anna, Oct 20 2026). Snoozed again when it rang
// back, it's the same one; its break starts when the snooze rings again.
async function snoozeBreak(base44: any, task: any, saved: any, owner: any, timeZone: string, atMs: number, minutes: number, untilMs: number, nowMs: number) {
  if (!owner || task?.status !== 'active') return;
  const backMs = Number.isFinite(untilMs) && untilMs > atMs && untilMs < atMs + 24 * HOUR_MS
    ? untilMs
    : atMs + Math.max(1, minutes || 10) * 60 * 1000;
  const prevSnoozeMs = parseMs(task.snoozed_until);
  const sameRun = Number.isFinite(prevSnoozeMs) && prevSnoozeMs <= atMs + 2 * 60 * 1000 && prevSnoozeMs >= atMs - 30 * 60 * 1000;
  const notNow = notNowLevel(task, timeZone, atMs);
  const level = sameRun && notNow.level > 1 ? notNow.level - 1 : notNow.level;
  const judged = await judgedBreak(base44, task, owner, timeZone, backMs, nowMs, level, notNow.day, 'snooze', atMs);
  const breakUntil = notNowUntil(task, timeZone, backMs, owner, level, judged ? judged.minutes : null);
  const extra: any = { not_now_day: notNow.day, not_now_count: level };
  // JUDGED LENGTH: kept on the snooze's own record, for the next "not now".
  if (judged && saved?.last_alarm_choice) extra.last_alarm_choice = { ...saved.last_alarm_choice, break_minutes: judged.minutes, break_why: judged.why };
  const { fields } = await breakTask(base44, { ...task, ...saved }, owner, breakUntil, nowMs, extra, 'snoozeBreak', true);
  console.log(`[phoneReport] snooze (not now #${level} today${sameRun ? ', same run' : ''}) on task ${task.id}: break until ${fields.later_until}${judged ? ` (judged ${judged.minutes} min: ${judged.why})` : ' (the table)'}`);
}

// Every choice made on an alarm or a reminder's notification, one row each,
// kept as AppEvent 'alarm_choice' (Anna, Oct 19 2026: "make it so that we
// can't undercount missed alarms"). The task keeps only its last choice and
// running counts, a repeating task's day is reset when it rolls over, and a
// deleted task takes both with it, so the owner health check
// (cronRefillReminders, check 10) counts rings from here. No titles (the
// AppEvent rule): the task id only. Written before the task is changed, so a
// report that fails after this and is sent again can show twice; the reader
// keeps one per ring.
async function logAlarmChoice(base44: any, email: string, e: { task_id: string; choice: string; atMs: number; how?: string | null; minutes?: number | null; report_id?: string; task_gone?: boolean }) {
  try {
    const props: any = {
      task_id: e.task_id,
      choice: e.choice,
      at: new Date(e.atMs).toISOString(),
      how: e.how || null,
      minutes: e.minutes ?? null,
      report_id: e.report_id || null,
    };
    if (e.task_gone) props.task_gone = true;
    await base44.asServiceRole.entities.AppEvent.create({ event: 'alarm_choice', user_email: String(email || '').toLowerCase(), props });
  } catch (err) {
    console.error('[cancelTaskNotifications] alarm choice not logged:', (err as any)?.message || err);
  }
}

// ── The phone's other reports (build 39 on, Base44Api.phoneReport) ─────────
// Anna, Oct 10 2026: "make sure nothing requires the user to open the app for
// something to update", and Smart Reminders sees "any choice made on an alarm
// (10 min, 30 min, 1 hour etc)". The phone sends each choice the moment it's
// made (retrying in the background without a connection):
//  - "alarm_choice": a snooze (and when it brings the reminder back), Stop, or
//    ringing out unanswered, on an alarm or a reminder's notification. Counted
//    once per report_id. The planner looks again on its next run.
//  - "pair": two alarms for different tasks at the same moment: one alarm
//    naming both, or the second waits 10 minutes? The model judges
//    (runTaskParse.judgeAlarmPairs); answers are kept on the person.
//  - "woke": "Notice when I wake up" is on and the phone was first unlocked
//    this morning at woke_at (WakeWatch on the phone).
// Only the signed-in person's own tasks and profile are touched.
const PAIR_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function localDay(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

async function phoneReport(req: Request, body: any): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let me: any = null;
  try { me = await base44.auth.me(); } catch { me = null; }
  if (!me?.email) return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
  const svc = base44.asServiceRole.entities;
  const email = String(me.email).toLowerCase();
  const owns = (t: any) => !!t && (String(t.created_by || '').toLowerCase() === email
    || String(t.notification_recipient_email || '').toLowerCase() === email);
  const owner = (await svc.User.filter({ email: me.email }, '-created_date', 1).catch(() => []))?.[0] || null;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const timeZone = (typeof body?.timezone === 'string' && body.timezone.trim()) || userTimeZone(owner);

  // The phone's push sign-up check (PushHealthWorker, Android build after 47;
  // PushHealthCheck on the iPhone from the build after 7, platform "ios"):
  // what the phone itself saw, sent from the background with the app unopened,
  // after a Play Store update or restart and every 12 hours. phone_seen_at is
  // proof the app is still installed (Nov 6 2026: phones whose pushes went dead
  // looked exactly like uninstalls from the server). Never the token itself.
  if (body.mode === 'push_state') {
    const b = (v: any) => v === true;
    const state = {
      at: nowIso,
      why: String(body?.why || '').slice(0, 20),
      allowed: b(body?.allowed),
      opted_in_before: b(body?.opted_in_before),
      had_token_before: b(body?.had_token_before),
      opted_in_after: b(body?.opted_in_after),
      has_token_after: b(body?.has_token_after),
      nudged: b(body?.nudged),
      subscription_id: String(body?.subscription_id || '').slice(0, 64),
      build: Number(body?.build) || null,
      // Which phone sent it: Android and iPhone build numbers are separate counts.
      platform: body?.platform === 'ios' ? 'ios' : 'android',
      error: body?.error ? String(body.error).slice(0, 200) : null,
      // What OneSignal's server says about this phone's push sign-up right after
      // the phone's check: enabled + its code (1 = subscribed, -10 = not
      // subscribed). Read, never changed, from here. null = could not ask.
      server_enabled: null as boolean | null,
      server_code: null as number | null,
      // A short tag of the push address the phone holds, before and after its
      // check (8 characters of a one-way hash, from the build after 49; never
      // the address itself): whether a phone hands OneSignal the same address
      // again after Google's push service refused it (Nov 27 2026).
      token_tag_before: /^[0-9a-f]{8}$/.test(String(body?.token_tag_before || '')) ? String(body.token_tag_before) : null,
      token_tag_after: /^[0-9a-f]{8}$/.test(String(body?.token_tag_after || '')) ? String(body.token_tag_after) : null,
      // Set below: whether this answer asked the phone for a brand-new push
      // address (FRESH PUSH ADDRESS).
      asked_fresh: false,
    };
    try {
      const appId = String(Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
      const restKey = String(Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
      if (appId && restKey && state.subscription_id) {
        const res = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(String(me.email))}`, {
          headers: { Authorization: `Basic ${restKey}` },
        });
        const os: any = res.ok ? await res.json().catch(() => null) : null;
        const sub = (Array.isArray(os?.subscriptions) ? os.subscriptions : []).find((s: any) => s?.id === state.subscription_id);
        if (sub) {
          state.server_enabled = sub.enabled === true;
          state.server_code = Number.isFinite(Number(sub.notification_types)) ? Number(sub.notification_types) : null;
        }
      }
    } catch (e) {
      console.warn('[phoneReport] push_state OneSignal lookup failed:', (e as any)?.message || e);
    }
    // FRESH PUSH ADDRESS (Nov 27 2026). Bri's phone: Google's push service
    // refused a notification to it at 1:09 PM on Nov 26; at 11:30 PM its
    // 12-hour check signed up again and OneSignal said subscribed; the next
    // notification, at 9:39 AM on Nov 27, was refused the same way (and it had
    // happened on Nov 19). Signing up again hands OneSignal the address the
    // phone already holds, and a refused address stays refused. So when a
    // notification has been refused since this phone's last check, the answer
    // asks it to throw that address away and get a new one from Google (the
    // build after 49 does: PushHealthWorker). Builds before ignore the word.
    {
      const msOfField = (v: any) => Date.parse(String(v || '')) || 0;
      const prevAt = msOfField(owner?.phone_push_state?.at);
      const refusedMs = msOfField(owner?.push_unreachable_at);
      state.asked_fresh = !!owner && state.platform === 'android' && state.allowed && refusedMs > 0 && refusedMs > prevAt;
    }
    // An update: how it happened (Anna, Nov 6 2026: "Keep track of when
    // anyone's phone automatically updates"). 'tapped_update' = the Update
    // button on the app's update card in the last 2 hours; 'while_using' = the
    // app was open in the 10 minutes before (most likely updated by hand);
    // 'auto' = neither: Google Play updated it by itself (or, rarely, the
    // person updated it in the Play Store without opening ADHDone). One row per
    // update in User.app_update_log, newest last, 30 kept.
    const extra: any = {};
    if (state.why === 'updated' && owner) {
      const msOfField = (v: any) => Date.parse(String(v || '')) || 0;
      const tappedMs = msOfField(owner.app_update_tapped_at);
      const openMs = msOfField(owner.last_active_at);
      const how = tappedMs && nowMs - tappedMs < 2 * 60 * 60 * 1000 ? 'tapped_update'
        : openMs && nowMs - openMs < 10 * 60 * 1000 ? 'while_using'
        : 'auto';
      (state as any).how = how;
      const fromBuild = Number(owner.app_build) || null;
      const log = Array.isArray(owner.app_update_log) ? owner.app_update_log : [];
      extra.app_update_log = [...log, { at: nowIso, build: state.build, from_build: fromBuild, how }].slice(-30);
    }
    if (owner?.id) await svc.User.update(owner.id, { phone_push_state: state, phone_seen_at: nowIso, ...extra });
    console.log(`[phoneReport] push_state ${email}: ${JSON.stringify(state)}`);
    // A repeating task finished lately whose next copy was never made gets it
    // now, under the person's own sign-in (this request is theirs; never
    // asServiceRole, RULES §8.5), with its reminder booked and the phone's
    // alarm list told. Anna, Nov 6 2026: "yes" (shared/nextCopy.ts).
    if (owner) {
      try {
        const fixed = await repairMissingRepeatsAs(base44, { email: String(me.email), owner, nowMs: Date.now() });
        if (fixed.made.length || fixed.linked.length || fixed.errors.length) {
          console.log(`[phoneReport] push_state ${email}: next copies made ${fixed.made.length} (booked ${fixed.booked}), linked ${fixed.linked.length}${fixed.errors.length ? `, errors: ${fixed.errors.join(' | ')}` : ''}`);
        }
      } catch (e) {
        console.warn('[phoneReport] push_state next-copy repair failed:', (e as any)?.message || e);
      }
    }
    // The answer also names the alarm screen this phone shows (build 49 on),
    // and asks for a fresh push address when one was refused (above).
    return Response.json({ success: true, alarm_screen: alarmScreenFor(owner), ...(state.asked_fresh ? { fresh_push_address: true } : {}) });
  }

  // Every change to the phone's push sign-up, the moment it happens
  // (PushChangeWatch, Android build 49 on; Anna, Nov 10 2026: "yeah you can add
  // that to v49"). OneSignal keeps no history of a subscription's tokens (their
  // support, Nov 9 2026), and push_state above keeps only the latest 12-hour
  // look, so a token vanishing while the app was installed was never seen when
  // it happened. Appended to User.phone_push_log (newest last, 30 kept) with
  // what OneSignal's server says right then. Also phone_seen_at: the app is
  // installed. Nothing else is touched. Never the token itself.
  if (body.mode === 'push_change') {
    const b = (v: any) => v === true;
    const changedMs = Number(body?.changed_at);
    const entry: any = {
      at: Number.isFinite(changedMs) && changedMs > 0 ? new Date(changedMs).toISOString() : nowIso,
      got_at: nowIso,
      had_token: b(body?.had_token),
      was_opted_in: b(body?.was_opted_in),
      id_before: String(body?.id_before || '').slice(0, 64),
      has_token: b(body?.has_token),
      opted_in: b(body?.opted_in),
      subscription_id: String(body?.subscription_id || '').slice(0, 64),
      allowed: b(body?.allowed),
      on_screen: b(body?.on_screen),
      importance: Number.isFinite(Number(body?.importance)) ? Number(body.importance) : null,
      build: Number(body?.build) || null,
      server_enabled: null as boolean | null,
      server_code: null as number | null,
    };
    const subId = entry.subscription_id || entry.id_before;
    try {
      const appId = String(Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
      const restKey = String(Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
      if (appId && restKey && subId) {
        const res = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(String(me.email))}`, {
          headers: { Authorization: `Basic ${restKey}` },
        });
        const os: any = res.ok ? await res.json().catch(() => null) : null;
        const sub = (Array.isArray(os?.subscriptions) ? os.subscriptions : []).find((x: any) => x?.id === subId);
        if (sub) {
          entry.server_enabled = sub.enabled === true;
          entry.server_code = Number.isFinite(Number(sub.notification_types)) ? Number(sub.notification_types) : null;
        }
      }
    } catch (e) {
      console.warn('[phoneReport] push_change OneSignal lookup failed:', (e as any)?.message || e);
    }
    if (owner?.id) {
      const log = Array.isArray(owner.phone_push_log) ? owner.phone_push_log : [];
      await svc.User.update(owner.id, { phone_push_log: [...log, entry].slice(-30), phone_seen_at: nowIso });
    }
    console.log(`[phoneReport] push_change ${email}: ${JSON.stringify(entry)}`);
    return Response.json({ success: true });
  }

  if (body.mode === 'woke') {
    const ms = Date.parse(String(body?.woke_at || ''));
    if (!Number.isFinite(ms) || ms > nowMs + 60 * 1000 || ms < nowMs - 24 * 60 * 60 * 1000) {
      return Response.json({ success: false, error: 'woke_at out of range' }, { status: 400 });
    }
    if (owner?.id) {
      await svc.User.update(owner.id, { woke_at: new Date(ms).toISOString(), smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso });
    }
    console.log(`[phoneReport] ${email} up at ${new Date(ms).toISOString()}`);
    return Response.json({ success: true });
  }

  if (body.mode === 'pair') {
    const asked = (Array.isArray(body?.pairs) ? body.pairs : []).slice(0, 20)
      .map((p: any) => ({ id: String(p?.id || ''), a: String(p?.a || ''), b: String(p?.b || '') }))
      .filter((p: any) => p.id && p.a && p.b && p.a !== p.b);
    const ids = [...new Set(asked.flatMap((p: any) => [p.a, p.b]))] as string[];
    const tasks: Record<string, any> = {};
    await Promise.all(ids.map(async (id) => {
      const t = await svc.Task.get(id).catch(() => null);
      if (owns(t)) tasks[id] = t;
    }));
    const cache: Record<string, any> = { ...(owner?.alarm_pairs || {}) };
    const answers: Record<string, { together: boolean }> = {};
    const toJudge: any[] = [];
    for (const p of asked) {
      if (!tasks[p.a] || !tasks[p.b]) continue;
      const hit = cache[p.id];
      if (hit && typeof hit.together === 'boolean' && nowMs - Date.parse(hit.at || '') < PAIR_KEEP_MS) {
        answers[p.id] = { together: hit.together };
        continue;
      }
      const show = (t: any) => ({ title: t.title, said: t.original_input || null, urgency: t.urgency || null, location: t.location || null });
      toJudge.push({ id: p.id, a: show(tasks[p.a]), b: show(tasks[p.b]) });
    }
    if (toJudge.length) {
      const got = await judgeAlarmPairs(toJudge).catch((e) => { console.error('[phoneReport] pair judgment failed:', e?.message || e); return {} as any; });
      for (const [id, v] of Object.entries(got as Record<string, any>)) {
        answers[id] = { together: v.together };
        cache[id] = { together: v.together, why: v.why || null, at: nowIso };
      }
      if (owner?.id && Object.keys(got).length) {
        const kept = Object.entries(cache)
          .filter(([, v]: any) => nowMs - Date.parse(v?.at || '') < PAIR_KEEP_MS)
          .sort((x: any, y: any) => Date.parse(y[1]?.at || '') - Date.parse(x[1]?.at || ''))
          .slice(0, 200);
        await svc.User.update(owner.id, { alarm_pairs: Object.fromEntries(kept) }).catch(() => {});
      }
    }
    return Response.json({ success: true, answers });
  }

  // "alarm_choice"
  let readErr: any = null;
  const task = await svc.Task.get(String(body?.task_id || '')).catch((e: any) => { readErr = e; return null; });
  if (!task) {
    // A read that failed for a passing reason (the database busy, a timeout):
    // a 5xx makes the phone keep the report and send it again, where a 404
    // makes it drop the report for good (ChoiceSyncWorker).
    const status = Number(readErr?.status ?? readErr?.response?.status ?? NaN);
    const passing = !!readErr && (status >= 500 || status === 429
      || (!Number.isFinite(status) && /fetch|network|timeout|timed out|ECONN|socket/i.test(String(readErr?.message || readErr))));
    if (passing) return Response.json({ success: false, error: 'Try again' }, { status: 503 });
    // Deleted while the report was on its way: the ring still counts.
    const goneChoice = String(body?.choice || '');
    if (body?.task_id && ['snooze', 'dismiss', 'ignored', 'closed'].includes(goneChoice)) {
      await logAlarmChoice(base44, email, {
        task_id: String(body.task_id).slice(0, 64),
        choice: goneChoice,
        atMs: tapTime(body, nowMs),
        how: ['home', 'back', 'closed'].includes(String(body?.how || '')) ? String(body.how) : null,
        report_id: typeof body?.report_id === 'string' ? body.report_id.slice(0, 64) : '',
        task_gone: true,
      });
    }
    return Response.json({ success: false, error: 'Task not found' }, { status: 404 });
  }
  if (!owns(task)) return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
  const reportId = typeof body?.report_id === 'string' ? body.report_id.slice(0, 64) : '';
  const seenIds: string[] = Array.isArray(task.alarm_report_ids) ? task.alarm_report_ids : [];
  if (reportId && seenIds.includes(reportId)) return Response.json({ success: true, duplicate: true });
  const choice = String(body?.choice || '');
  if (!['snooze', 'dismiss', 'ignored', 'closed'].includes(choice)) {
    return Response.json({ success: false, error: 'unknown choice' }, { status: 400 });
  }
  const atMs = tapTime(body, nowMs);
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(Number(body?.minutes) || 0)));
  const untilMs = Number(body?.until);
  // Home or Back on the alarm screen while it rang (build 40 on): 'closed'
  // with how = 'home' | 'back' | 'closed' (the screen went away some other
  // way), or a 'snooze' with how set when Home or Back rang it again in 10
  // minutes (a time they set inside quiet hours). Anna, Oct 12 2026.
  const how = ['home', 'back', 'closed'].includes(String(body?.how || '')) ? String(body.how) : null;
  await logAlarmChoice(base44, email, { task_id: task.id, choice, atMs, how, minutes: choice === 'snooze' ? minutes : null, report_id: reportId });
  const fields: any = {
    last_alarm_choice: {
      choice,
      at: new Date(atMs).toISOString(),
      minutes: choice === 'snooze' ? minutes : null,
      until: choice === 'snooze' && Number.isFinite(untilMs) && untilMs > 0 ? new Date(untilMs).toISOString() : null,
      ...(how ? { how } : {}),
    },
  };
  if (reportId) fields.alarm_report_ids = [...seenIds, reportId].slice(-20);
  if (choice === 'snooze') {
    fields.snooze_count = (task.snooze_count || 0) + 1;
    fields.consecutive_snoozes = (task.consecutive_snoozes || 0) + 1;
    if (Number.isFinite(untilMs) && untilMs > nowMs && untilMs < nowMs + 24 * 60 * 60 * 1000) {
      fields.snoozed_until = new Date(untilMs).toISOString();
    }
  } else {
    if (choice === 'dismiss') fields.dismissed_count = (task.dismissed_count || 0) + 1;
    if (choice === 'ignored') fields.ignored_count = (task.ignored_count || 0) + 1;
    if (choice === 'closed') fields.closed_count = (task.closed_count || 0) + 1;
    // The ring that just ended was the snooze coming back: that snooze is over.
    const snoozeMs = Date.parse(task.snoozed_until || '');
    if (Number.isFinite(snoozeMs) && snoozeMs <= nowMs + 2 * 60 * 1000) fields.snoozed_until = null;
  }
  // Every one of these is putting it off (Anna, Oct 22 2026): put off on 3
  // different days, the task moves to an eased plan (shared/easeOff.ts).
  Object.assign(fields, putOffFields(task, atMs, timeZone));
  Object.assign(fields, await easeStep({ ...task, ...fields }, owner, nowMs).catch(() => ({})));
  await svc.Task.update(task.id, fields);
  // A snooze they picked is a "not now" (Anna, Oct 20 2026); Home or Back on a
  // time they set inside quiet hours rings it again on its own, and isn't one.
  if (choice === 'snooze' && !how) {
    try {
      await snoozeBreak(base44, task, fields, owner, timeZone, atMs, minutes, untilMs, nowMs);
    } catch (e) {
      console.error('[phoneReport] snooze break not applied:', (e as any)?.message || e);
    }
  }
  if (owner?.id) {
    const userFields: any = { smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso };
    // The first time today they did something with a reminder: a sign they're
    // up (an alarm ringing out unanswered is not).
    const firstMs = Date.parse(owner.day_first_sign_at || '');
    if (choice !== 'ignored' && !(Number.isFinite(firstMs) && localDay(firstMs, timeZone) === localDay(atMs, timeZone))) {
      userFields.day_first_sign_at = new Date(atMs).toISOString();
    }
    await svc.User.update(owner.id, userFields).catch(() => {});
  }
  console.log(`[phoneReport] ${choice}${choice === 'snooze' ? ` ${minutes} min` : ''} on task ${task.id}`);
  // The answer also names the alarm screen this phone shows (build 49 on).
  return Response.json({ success: true, alarm_screen: alarmScreenFor(owner) });
}

Deno.serve(aiServe(async (req) => {
  try {
    const body = await req.json();
    if (body?.mode === 'alarm_choice' || body?.mode === 'pair' || body?.mode === 'woke' || body?.mode === 'push_state' || body?.mode === 'push_change') {
      return await phoneReport(req, body);
    }
    const { taskId } = body || {};

    if (!taskId) {
      return Response.json({ 
        success: false, 
        error: 'taskId required' 
      }, { status: 400 });
    }

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return Response.json({ 
        success: false, 
        error: 'OneSignal credentials missing' 
      }, { status: 500 });
    }

    const base44 = createClientFromRequest(req);

    // Who's asking. Only the task's owner (or its reminder recipient), an app
    // admin, or the app's own backend (the internal key) may cancel a task's
    // reminders. Anyone holding a task id used to be able to silence it.
    const internalKey = Deno.env.get('CRON_SECRET')?.trim();
    const presentedKey = typeof body?.internalKey === 'string' ? body.internalKey.trim() : '';
    const isInternal = !!internalKey && presentedKey === internalKey;
    let me: any = null;
    if (!isInternal) {
      try {
        me = await base44.auth.me();
      } catch {
        me = null;
      }
      if (!me?.email) {
        return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
      }
    }

    const task = await base44.asServiceRole.entities.Task.get(taskId);

    if (!task) {
      return Response.json({ 
        success: false, 
        error: 'Task not found' 
      }, { status: 404 });
    }

    if (!isInternal) {
      const email = String(me.email).toLowerCase();
      const allowed = email === String(task.created_by || '').toLowerCase() ||
        email === String(task.notification_recipient_email || '').toLowerCase() ||
        me.role === 'admin';
      if (!allowed) {
        console.warn('[cancelTaskNotifications] refused: caller does not own this task');
        return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
      }
    }

    // Owner check of JUDGED LENGTH ({ taskId, mode: 'break_preview' }, admin
    // only): what a Later pressed on this task right now would get, and what
    // the table alone would have given. Nothing is changed, booked or
    // cancelled. level: pretend it is the 2nd or 3rd "not now" today.
    if (body?.mode === 'break_preview') {
      if (isInternal || me?.role !== 'admin') return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
      const nowMs = Date.now();
      const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by }).catch(() => []);
      const owner = owners?.[0] || null;
      const timeZone = userTimeZone(owner);
      const notNow = notNowLevel(task, timeZone, nowMs);
      const level = Number.isFinite(Number(body?.level)) && Number(body.level) >= 1 ? Math.floor(Number(body.level)) : notNow.level;
      const judged = await judgedBreak(base44, task, owner, timeZone, nowMs, nowMs, level, notNow.day, 'later', nowMs);
      const minutesTo = (ms: number) => Math.round((ms - nowMs) / 60000);
      return Response.json({
        success: true,
        preview: true,
        level,
        priority: task.urgency || 'medium',
        table_minutes: minutesTo(notNowUntil(task, timeZone, nowMs, owner, level)),
        judged_minutes: judged ? judged.minutes : null,
        why: judged ? judged.why : null,
        break_minutes: minutesTo(notNowUntil(task, timeZone, nowMs, owner, level, judged ? judged.minutes : null)),
        note: 'Preview only: nothing was changed.',
      });
    }

    // Later tapped on the task's alarm or reminder: a break, not a full cancel.
    if (body?.mode === 'later') {
      return Response.json(await applyLaterBreak(base44, task, body, ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY));
    }

    let canceledCount = 0;

    // Cancel all pending OneSignal notifications from onesignal_notification_ids
    if (task.onesignal_notification_ids && Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.onesignal_notification_ids.length} notifications for task ${taskId}`);

      for (const notificationId of task.onesignal_notification_ids) {
        try {
          const url = `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled notification ${notificationId}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel notification ${notificationId}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling notification ${notificationId}:`, error);
        }
      }
    }

    // Also cancel one-time/event reminders stored in reminder_schedule —
    // these are separate OneSignal notification IDs not tracked in
    // onesignal_notification_ids and would otherwise keep firing.
    if (task.reminder_schedule && Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.reminder_schedule.length} reminder_schedule entries for task ${taskId}`);

      for (const entry of task.reminder_schedule) {
        if (!entry?.notification_id) continue;
        try {
          const url = `https://onesignal.com/api/v1/notifications/${entry.notification_id}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled reminder_schedule notification ${entry.notification_id}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel reminder_schedule notification ${entry.notification_id}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling reminder_schedule notification ${entry.notification_id}:`, error);
        }
      }
    }

    await ledgerCancel(base44, [
      ...(task.onesignal_notification_ids || []),
      ...((task.reminder_schedule || []).map((e: any) => e?.notification_id)),
    ]);

    // Clear the notification IDs, reminder_schedule, and last_scheduled_until from the task.
    // mode "drop_rhythm" (admin only) also turns an every-X rhythm into a single
    // reminder at the task's time; its wish is still there for the nudge planner
    // to keep at them. Used Oct 7 2026 to take "Take Pills" off hourly pings.
    const dropRhythm = body?.mode === 'drop_rhythm' && me?.role === 'admin';
    await base44.asServiceRole.entities.Task.update(taskId, {
      onesignal_notification_ids: [],
      reminder_schedule: [],
      last_scheduled_until: null,
      ...(dropRhythm ? { reminder_interval: 'once' } : {}),
    });

    console.log(`[cancelTaskNotifications] Cleared notification IDs for task ${taskId}`);

    return Response.json({ 
      success: true, 
      canceledCount: canceledCount,
      taskId: taskId
    });
  } catch (error) {
    console.error('[cancelTaskNotifications] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}));
// Redeployed Nov 4 2026: shared/reminderTitle.ts lets the iPhone app ring (phoneCanRing).

// Redeployed Nov 5 2026: the parser now judges goes_somewhere (shared/runTaskParse.ts).

// Redeployed Nov 5 2026 (evening): shared/reminderTitle.ts tells the reminder-words model the task's corrected name beats the words it was first typed with.

// Re-saved Nov 12 2026: shared/reminderTitle.ts (the alarm of their own young child's birthday has no "Write a text" button; birthday_no_text).
