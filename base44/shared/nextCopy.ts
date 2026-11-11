// The next copy of a repeating task, made on the SERVER for one case only: a
// phone checking in from the background (cancelTaskNotifications, mode
// push_state, Android builds 48 on), which arrives signed in as the person.
//
// Why (Anna, Nov 6 2026, "yes" to making a missing next copy when a phone
// checks in, under the person's own sign-in): Chad finished his 8 AM daily
// medication at 8:08 and the app never made the next day's copy. The copy is
// only ever made by the app, and he only opens the app from that alarm, so
// with no copy nothing would ring the next morning. The app also repairs this
// on its next open (repairMissingRepeats); this reaches people who don't open it.
//
// RULES §8.5 still holds: never asServiceRole. Everything here goes through
// the client made from the phone's own request, i.e. the person's sign-in, so
// the copy is created_by them and they see it, exactly like a copy the app
// makes. This is a port of src/components/utils/taskRecurrence.jsx
// (nextOccurrence, makeNextCopy, atTimeReminderFor, bookAtTimeReminder,
// repairMissingRepeats), with the phone's local clock replaced by the
// person's time zone. Keep the two in step.

import { pushPhoneAlarms } from './reminderTitle.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS: Record<string, number> = {
  '10min': 10 * 60 * 1000,
  '20min': 20 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '2hours': 2 * 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  every_other_day: 48 * 60 * 60 * 1000,
};

type Wall = { y: number; m: number; d: number; hh: number; mi: number };

function wallOf(ms: number, tz: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour') % 24, mi: get('minute') };
}

// The UTC moment of a wall-clock time in tz (seconds dropped).
function fromWall(w: Wall, tz: string): number {
  const target = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const g = wallOf(guess, tz);
    guess += target - Date.UTC(g.y, g.m - 1, g.d, g.hh, g.mi);
  }
  return guess;
}

// Calendar moves keep the wall-clock time, like Date.setDate does on a phone.
function moveDays(ms: number, n: number, tz: string): number {
  const w = wallOf(ms, tz);
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return fromWall({ ...w, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, tz);
}
function moveMonths(ms: number, n: number, tz: string): number {
  const w = wallOf(ms, tz);
  const t = new Date(Date.UTC(w.y, w.m - 1 + n, w.d));
  return fromWall({ ...w, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, tz);
}
const dayNum = (ms: number, tz: string) => {
  const w = wallOf(ms, tz);
  return Math.floor(Date.UTC(w.y, w.m - 1, w.d) / DAY_MS);
};
const weekday = (ms: number, tz: string) => {
  const w = wallOf(ms, tz);
  return new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
};
const atClock = (ms: number, hh: number, mi: number, tz: string) => fromWall({ ...wallOf(ms, tz), hh, mi }, tz);

function advance(ms: number, pattern: string, days: any, tz: string): number {
  const daySet = Array.isArray(days) ? days.filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  if (pattern === 'daily') return moveDays(ms, 1, tz);
  if (pattern === 'every_other_day') return moveDays(ms, 2, tz);
  if (pattern === 'weekdays') {
    let d = moveDays(ms, 1, tz);
    while (weekday(d, tz) === 0 || weekday(d, tz) === 6) d = moveDays(d, 1, tz);
    return d;
  }
  if (pattern === 'weekly' && daySet.length > 0) {
    let d = moveDays(ms, 1, tz);
    let guard = 0;
    while (!daySet.includes(weekday(d, tz)) && guard++ < 7) d = moveDays(d, 1, tz);
    return d;
  }
  if (pattern === 'weekly') return moveDays(ms, 7, tz);
  if (pattern === 'every_other_week') return moveDays(ms, 14, tz);
  if (pattern === 'monthly') return moveMonths(ms, 1, tz);
  if (pattern === 'yearly') return moveMonths(ms, 12, tz);
  return ms;
}

const validMs = (v: any): number | null => {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const isBirthday = (t: any) => !!t?.birthday_person || t?.classification === 'birthday' || !!t?.is_own_birthday;
const anchorOf = (task: any) => /^(\d{1,2}):(\d{2})$/.exec(String(task?.anchor_time || ''));
const ownInterval = (task: any) => task.focus_mode_original_interval || task.reminder_interval || null;
const ownNextReminder = (task: any) =>
  task.focus_mode_original_interval ? (task.focus_mode_original_next_reminder || null) : (task.next_reminder || null);

function occurrenceMoment(task: any, nowMs: number, tz: string): number {
  if (task.classification === 'event') {
    const at = validMs(task.event_time);
    if (at !== null) return at;
  }
  if (task.day_only_task) {
    const due = validMs(task.due_date);
    if (due !== null) return due;
  }
  const next = validMs(ownNextReminder(task));
  const step = INTERVAL_MS[ownInterval(task)];
  if (step && next !== null) {
    const cursor = (task.reminder_count || 0) > 0 && next > nowMs ? next - step : next;
    const m = anchorOf(task);
    if (!m) return cursor;
    let named = atClock(cursor, Number(m[1]), Number(m[2]), tz);
    if (cursor < named) named = moveDays(named, -1, tz);
    return named;
  }
  return next ?? validMs(task.due_date) ?? nowMs;
}

// taskRecurrence.jsx lateNightEndsMin: a finish before this time of day still
// counts toward the day before (4 AM, later for a sleep that starts in the morning).
function lateNightEndsMin(owner: any): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(owner?.quiet_hours_start || '22:00'));
  const start = m ? Number(m[1]) * 60 + Number(m[2]) : 22 * 60;
  return start > 4 * 60 && start <= 12 * 60 ? start : 4 * 60;
}

export function nextOccurrenceIn(task: any, nowMs: number, tz: string, owner: any): { base: number; nextDate: number } {
  const base = occurrenceMoment(task, nowMs, tz);
  const keepOwnTime = task.classification === 'event' || !!task.day_only_task;
  const m = anchorOf(task);
  const at = (ms: number) => (keepOwnTime || !m ? ms : atClock(ms, Number(m[1]), Number(m[2]), tz));
  let next = advance(base, task.recurrence_pattern, task.recurrence_days, tz);
  let guard = 0;
  while (at(next) <= nowMs && guard++ < 1000) next = advance(next, task.recurrence_pattern, task.recurrence_days, tz);
  if (at(next) <= nowMs) next = advance(nowMs, task.recurrence_pattern, task.recurrence_days, tz);
  const nowWall = wallOf(nowMs, tz);
  let finishDay = nowMs;
  if (nowWall.hh * 60 + nowWall.mi < lateNightEndsMin(owner)) finishDay = moveDays(nowMs, -1, tz);
  if (dayNum(finishDay, tz) - dayNum(base, tz) > 0) {
    let lateGuard = 0;
    while (dayNum(at(next), tz) === dayNum(finishDay, tz) && lateGuard++ < 400) {
      next = advance(next, task.recurrence_pattern, task.recurrence_days, tz);
    }
  }
  return { base, nextDate: at(next) };
}

function shiftDays(value: any, days: number, tz: string): string | null {
  const ms = validMs(value);
  if (ms === null) return null;
  return new Date(moveDays(ms, days, tz) + (ms % 60000)).toISOString();
}

function atTimeReminderFor(task: any, nowMs: number): { at: number; title: string; body: string } | null {
  if (!task || task.silenced || task.parent_task_id || isBirthday(task)) return null;
  if (task.reminder_interval !== 'once' || task.day_only_task) return null;
  const isEvent = task.classification === 'event';
  if (task.deadline_style === 'by' && !isEvent) return null;
  const at = validMs(isEvent ? (task.event_time || task.next_reminder) : task.next_reminder);
  if (at === null || at <= nowMs + 2 * 60 * 1000) return null;
  const full = String(task.title || '').trim() || 'your task';
  const t = full.length > 40 ? `${full.slice(0, 37)}...` : full;
  return { at, title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` };
}

// What the copy would be (no writes): used by makeNextCopyAs and the self-test.
export function planNextCopy(task: any, owner: any, email: string, nowMs: number, finishedAt?: any) {
  const tz = String(owner?.timezone || 'America/Chicago');
  const fin = validMs(finishedAt);
  let { base, nextDate } = nextOccurrenceIn(task, fin !== null && fin < nowMs ? fin : nowMs, tz, owner);
  if (nextDate <= nowMs) ({ base, nextDate } = nextOccurrenceIn(task, nowMs, tz, owner));
  const days = dayNum(nextDate, tz) - dayNum(base, tz);
  const interval = ownInterval(task);
  const dayOnly = !!task.day_only_task;
  const isEvent = task.classification === 'event';
  const nextReminder = dayOnly
    ? atClock(nextDate, 9, 0, tz)
    : isEvent ? (validMs(shiftDays(ownNextReminder(task), days, tz)) ?? nextDate) : nextDate;
  const endOfNewDay = atClock(nextDate, 23, 59, tz);
  const recipient = task.notification_recipient_email || email;
  const fields: any = {
    title: task.title,
    description: task.description || '',
    urgency: task.urgency || 'medium',
    energy_required: task.energy_required || 'medium',
    takes_time: task.takes_time === true,
    worth_breaking_down: task.worth_breaking_down === true,
    breakdown_offer_dismissed: task.breakdown_offer_dismissed === true,
    prep_worthy: task.prep_worthy === true,
    prep_note: task.prep_note || null,
    prep_offer_dismissed: task.prep_offer_dismissed === true,
    reminder_interval: interval || 'once',
    original_input: task.original_input || null,
    location: task.location || null,
    classification: task.classification || 'task',
    life_area: task.life_area || 'personal',
    reminder_wish: task.reminder_wish || null,
    anchor_time: task.anchor_time || null,
    time_stated: task.time_stated === true,
    follow_up_title: task.follow_up_title || null,
    follow_up_minutes: task.follow_up_minutes || null,
    task_family: task.task_family || null,
    typical_minutes: task.typical_minutes || null,
    day_only_task: dayOnly,
    deadline_style: task.deadline_style || null,
    alert_style: task.alert_style || null,
    pictures: task.pictures || [],
    notes: task.notes || '',
    goal_id: task.goal_id || null,
    goal_step_id: task.goal_step_id || null,
    goal_context: task.goal_context || null,
    due_date: shiftDays(task.due_date, days, tz) || (dayOnly ? new Date(endOfNewDay).toISOString() : null),
    event_time: shiftDays(task.event_time, days, tz),
    end_time: shiftDays(task.end_time, days, tz),
    end_date: shiftDays(task.end_date, days, tz),
    status: 'active',
    next_reminder: new Date(nextReminder).toISOString(),
    recurrence_pattern: task.recurrence_pattern,
    recurrence_days: Array.isArray(task.recurrence_days) && task.recurrence_days.length ? task.recurrence_days : null,
    notification_recipient_email: recipient,
    onesignal_notification_ids: [],
    reminder_count: 0,
  };
  const reminder = atTimeReminderFor({ ...fields, reminder_interval: interval }, nowMs);
  return { tz, base, nextDate, fields, reminder, recipient, interval };
}

const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// taskRecurrence.jsx findNextCopy: a copy already there for that day (any
// state), by the same name (ignoring case and spacing), repeat and named time.
async function findNextCopyAs(base44: any, task: any, nextDate: number, tz: string): Promise<any | null> {
  const rows = await base44.entities.Task.filter({ recurrence_pattern: task.recurrence_pattern }, '-created_date', 100);
  return (rows || []).find((t: any) => {
    if (t.id === task.id || t.parent_task_id) return false;
    if (norm(t.title) !== norm(task.title)) return false;
    if ((t.anchor_time || null) !== (task.anchor_time || null)) return false;
    const ms = validMs((t.classification === 'event' && t.event_time) || (t.day_only_task && t.due_date) || t.next_reminder);
    return ms !== null && dayNum(ms, tz) === dayNum(nextDate, tz);
  }) || null;
}

// How far back a broken repeat is still repaired. 3 days until Nov 11 2026: a
// daily medication finished on Nov 6 whose next copy was never made was past
// repair by Nov 9, on a phone that had no way to check in sooner. 30 days is
// safe because only the NEWEST copy of a repeat is ever repaired (carriesOn).
export const REPAIR_DAYS = 30;

// Does this repeat already carry on without a new copy? Yes when another task
// of the same name, rhythm and named time is still open (whatever its day: an
// overdue one counts), or was made after this one (the chain moved on, or the
// person deleted the rest on purpose and this isn't its last link). Returns
// that task, or null when this finished task really is where the repeat stopped.
async function carriesOnAs(base44: any, task: any, families: Map<string, any[]>): Promise<any | null> {
  const key = String(task.recurrence_pattern);
  if (!families.has(key)) {
    families.set(key, (await base44.entities.Task.filter({ recurrence_pattern: task.recurrence_pattern }, '-created_date', 200)) || []);
  }
  const madeMs = validMs(task.created_date) ?? 0;
  const same = (families.get(key) || []).filter((t: any) =>
    t?.id && t.id !== task.id && !t.parent_task_id &&
    norm(t.title) === norm(task.title) &&
    (t.anchor_time || null) === (task.anchor_time || null));
  const open = same.find((t: any) => t.status === 'active' || t.status === 'snoozed');
  if (open) return open;
  const later = same.filter((t: any) => (validMs(t.created_date) ?? 0) > madeMs)
    .sort((a: any, b: any) => (validMs(a.created_date) ?? 0) - (validMs(b.created_date) ?? 0));
  return later[0] || null;
}

// Every repeating task the person finished in the last 30 days (REPAIR_DAYS)
// whose next copy was never made: linked to a copy already there, or made now
// and its at-the-time reminder booked (schedulePush, as the person, the same
// booking the app makes) and sent to the phone's alarm list.
export async function repairMissingRepeatsAs(
  base44: any,
  opts: { email: string; owner: any; nowMs?: number },
): Promise<{ made: string[]; linked: string[]; booked: number; errors: string[] }> {
  const out = { made: [] as string[], linked: [] as string[], booked: 0, errors: [] as string[] };
  const nowMs = opts.nowMs ?? Date.now();
  const since = new Date(nowMs - REPAIR_DAYS * DAY_MS).toISOString();
  let rows: any[] = [];
  try {
    // Repeating tasks only, so 30 days of them fit (a plain list of everything
    // finished would be cut off at its newest rows for someone busy).
    rows = await base44.entities.Task.filter({ status: 'completed', completed_at: { $gte: since }, recurrence_pattern: { $ne: 'none' } }, '-completed_at', 200);
  } catch (e) {
    out.errors.push(`list: ${(e as any)?.message || e}`);
    return out;
  }
  const families = new Map<string, any[]>();
  for (const t of rows || []) {
    if (!t?.id || t.parent_task_id || !t.recurrence_pattern || t.recurrence_pattern === 'none') continue;
    if (isBirthday(t) || t.next_occurrence_id) continue;
    try {
      const onward = await carriesOnAs(base44, t, families);
      if (onward?.id) {
        await base44.entities.Task.update(t.id, { next_occurrence_id: onward.id }).catch(() => {});
        out.linked.push(t.id);
        continue;
      }
      const plan = planNextCopy(t, opts.owner, opts.email, nowMs, t.completed_at);
      const existing = await findNextCopyAs(base44, t, plan.nextDate, plan.tz);
      if (existing?.id) {
        await base44.entities.Task.update(t.id, { next_occurrence_id: existing.id }).catch(() => {});
        out.linked.push(t.id);
        continue;
      }
      const fields = { ...plan.fields };
      if (plan.reminder) fields.reminder_scheduling_since = new Date(nowMs).toISOString();
      const copy = await base44.entities.Task.create(fields);
      if (!copy?.id) continue;
      out.made.push(copy.id);
      await base44.entities.Task.update(t.id, { next_occurrence_id: copy.id }).catch(() => {});
      let saved = copy;
      if (plan.reminder) {
        const sendAtISO = new Date(plan.reminder.at).toISOString();
        let id: string | null = null;
        let words = { title: plan.reminder.title, body: plan.reminder.body };
        try {
          const r = await base44.functions.invoke('schedulePush', {
            toUserExternalId: plan.recipient,
            title: plan.reminder.title,
            body: plan.reminder.body,
            sendAtISO,
            data: { screen: '/TaskNotification', taskId: copy.id, urgency: fields.urgency || 'medium', type: 'task_reminder' },
            buttons: [
              { id: 'snooze_15', text: 'Snooze 15 min' },
              { id: 'snooze_60', text: 'Snooze 1 hour' },
              { id: 'complete', text: '✅ Done' },
            ],
          });
          const result: any = r?.data || r;
          if (result?.success !== false && result?.notificationId) {
            id = String(result.notificationId);
            if (result.words?.title && result.words?.body) words = { title: result.words.title, body: result.words.body };
          }
        } catch (e) {
          out.errors.push(`book ${copy.id}: ${(e as any)?.message || e}`);
        }
        // Saved even without an id: the hourly refill books an entry that has none.
        const schedule = [{ notification_id: id, send_at: sendAtISO, label: 'right now', notification_title: words.title, notification_body: words.body }];
        saved = await base44.entities.Task.update(copy.id, {
          onesignal_notification_ids: id ? [id] : [],
          reminder_scheduling_since: null,
          reminder_schedule: schedule,
        }).catch(() => ({ ...copy, reminder_schedule: schedule, onesignal_notification_ids: id ? [id] : [] }));
        if (id) out.booked++;
      }
      // The phone's alarm list learns about it now (alarm users), as the app's
      // refreshAlarms would on the phone.
      try {
        await pushPhoneAlarms({ ...copy, ...(saved || {}), created_by: copy.created_by || opts.email }, opts.owner, { source: 'repeat_repair' });
      } catch (e) {
        out.errors.push(`alarms ${copy.id}: ${(e as any)?.message || e}`);
      }
    } catch (e) {
      out.errors.push(`${t.id}: ${(e as any)?.message || e}`);
    }
  }
  return out;
}
