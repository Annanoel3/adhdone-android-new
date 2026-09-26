import { base44 } from '@/api/base44Client';
import { INTERVAL_MS } from './taskSchedule';
import { scheduleReminder, cancelScheduledReminder } from './reminderScheduler';
import { commitNotificationIds } from './notificationOwnership';

const DAY_MS = 24 * 60 * 60 * 1000;
// Until this hour a finish still counts toward the day before (see nextOccurrence).
const LATE_NIGHT_ENDS_HOUR = 4;

// Advance a date by one cycle of the pattern. 'weekdays' steps forward a day
// and then skips Saturday/Sunday, so a business-days habit never lands on the
// weekend.
function advance(date, pattern, days) {
  const d = new Date(date);
  const daySet = Array.isArray(days) ? days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  if (pattern === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (pattern === 'every_other_day') {
    d.setDate(d.getDate() + 2);
  } else if (pattern === 'weekdays') {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } else if (pattern === 'weekly' && daySet.length > 0) {
    // Specific weekdays ("Wednesdays and Thursdays"): the next listed day.
    d.setDate(d.getDate() + 1);
    let guard = 0;
    while (!daySet.includes(d.getDay()) && guard++ < 7) d.setDate(d.getDate() + 1);
  } else if (pattern === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (pattern === 'every_other_week') {
    d.setDate(d.getDate() + 14);
  } else if (pattern === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else if (pattern === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

// Birthdays only (what "Done" on a birthday should do is still undecided).
// Everything else uses nextOccurrence below.
function getNextRecurrenceDate(task) {
  const baseDate = task.next_reminder ? new Date(task.next_reminder) : new Date();
  const now = new Date();
  let nextDate = advance(baseDate, task.recurrence_pattern, task.recurrence_days);

  // If computed date is still in the past, calculate from now
  if (nextDate <= now) {
    nextDate = advance(now, task.recurrence_pattern, task.recurrence_days);
  }

  return nextDate;
}

// The clock time the user named for the task ("pills at 10"), applied to the
// next occurrence. Without it, a task whose next_reminder had been bumped
// along by hourly reminders carried the bumped time into tomorrow.
function applyAnchorTime(date, task) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task?.anchor_time || ''));
  if (!m) return date;
  const out = new Date(date);
  out.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return out;
}

const validDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const isBirthday = (t) => !!t?.birthday_person || t?.classification === 'birthday' || !!t?.is_own_birthday;

const sameLocalDay = (a, b) => {
  const x = validDate(a);
  const y = validDate(b);
  return !!x && !!y && x.toDateString() === y.toDateString();
};

// Whole local calendar days from one moment to another. Rounded, so the hour
// a clock change adds or removes never counts as a day.
function dayDelta(from, to) {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

// The same clock time, `days` calendar days later (setDate keeps the local
// time across a clock change).
function shiftDays(value, days) {
  const d = validDate(value);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Focus Mode puts a repeating task on its hourly check-ins for the length of
// the session and remembers what it had. Finishing it in Focus Mode used to
// hand the next copy that temporary hourly rhythm; the copy gets what the task
// really had.
function ownInterval(task) {
  return task.focus_mode_original_interval || task.reminder_interval || null;
}
function ownNextReminder(task) {
  return task.focus_mode_original_interval ? (task.focus_mode_original_next_reminder || null) : (task.next_reminder || null);
}

// The moment the occurrence being finished was FOR — its own day, not
// wherever its reminders have got to. A rhythm task's next_reminder is moved
// along with every ping, so finishing it after an 11 PM ping (next_reminder
// already past midnight) made the next copy skip a day.
function occurrenceMoment(task, now) {
  // An appointment is on its own day; an all-day task is due at the end of its day.
  if (task.classification === 'event') {
    const at = validDate(task.event_time);
    if (at) return at;
  }
  if (task.day_only_task) {
    const due = validDate(task.due_date);
    if (due) return due;
  }
  const next = validDate(ownNextReminder(task));
  const ms = INTERVAL_MS[ownInterval(task)];
  if (ms && next) {
    // reminder_count goes up each time the pings move next_reminder on, so a
    // count means next_reminder is the NEXT ping, and the one that last went
    // out (an interval earlier) is where this occurrence stands. With no count
    // nothing has pinged yet and next_reminder is still the occurrence's own time.
    const cursor = (task.reminder_count || 0) > 0 && next.getTime() > now.getTime()
      ? new Date(next.getTime() - ms)
      : next;
    // Its day is the one the time the person named falls on — the day before,
    // when the pings have rolled overnight into a morning still before that
    // time (same reading as the details card's Due pill).
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(task.anchor_time || ''));
    if (!m) return cursor;
    const named = new Date(cursor);
    named.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (cursor.getTime() < named.getTime()) named.setDate(named.getDate() - 1);
    return named;
  }
  return next || validDate(task.due_date) || new Date(now);
}

// When the next occurrence is for: one cycle of the pattern after this one's
// own day, and the first such day still ahead — so a copy is never made for a
// time already gone by, and a weekly or monthly task stays on its own weekday
// or date instead of drifting to "a week from whenever it was ticked off".
export function nextOccurrence(task, now = new Date()) {
  const base = occurrenceMoment(task, now);
  // An appointment keeps its own clock time and an all-day task is open until
  // the end of its day; anything else starts at the time the person named.
  const keepOwnTime = task.classification === 'event' || !!task.day_only_task;
  const at = (d) => (keepOwnTime ? new Date(d) : applyAnchorTime(d, task));
  let next = advance(base, task.recurrence_pattern, task.recurrence_days);
  let guard = 0;
  while (at(next) <= now && guard++ < 1000) {
    next = advance(next, task.recurrence_pattern, task.recurrence_days);
  }
  if (at(next) <= now) next = advance(now, task.recurrence_pattern, task.recurrence_days);
  // A late finish covers the day it happened. Finishing an occurrence from an
  // earlier day (last night's 9 PM litter box, done at 8:45 the next morning)
  // counts as today's as well, so the next copy is the first one AFTER today.
  // It used to be tonight's, back on Today the moment it was checked off.
  // Finishing on time or early changes nothing here. The small hours still
  // belong to the night before: last night's litter box done at 12:30 AM is
  // just late, and tonight's copy stays.
  const finishDay = new Date(now);
  if (finishDay.getHours() < LATE_NIGHT_ENDS_HOUR) finishDay.setDate(finishDay.getDate() - 1);
  if (dayDelta(base, finishDay) > 0) {
    let lateGuard = 0;
    while (sameLocalDay(at(next), finishDay) && lateGuard++ < 400) {
      next = advance(next, task.recurrence_pattern, task.recurrence_days);
    }
  }
  return { base, nextDate: at(next) };
}

// The one reminder a repeating task gets for each occurrence: AT its own time
// ("pills daily at 10" → 10:00), never moved for quiet hours, nothing extra — a
// repeating task carries no lead-time plan (the server's plan builder skips
// them too). Only for a task pinned to a clock time: a rhythm ("keep reminding
// me") is booked by the hourly refill, an all-day task and a "by 5 PM"
// deadline by smart nudges, a birthday by its own scheduler, and a step never
// reminds on its own. The words are the ones every at-the-time reminder uses
// (multiReminderScheduler's, and onTaskUpdate's when a task is un-checked):
// they name the task. getReminderCopy's "whenever you've got a minute" /
// "no need to tackle it tonight" are nudge words and would be wrong at the
// very time the task is set for.
export function atTimeReminderFor(task, now = new Date()) {
  if (!task || task.silenced || task.parent_task_id || isBirthday(task)) return null;
  if (task.reminder_interval !== 'once' || task.day_only_task) return null;
  const isEvent = task.classification === 'event';
  if (task.deadline_style === 'by' && !isEvent) return null;
  const at = validDate(isEvent ? (task.event_time || task.next_reminder) : task.next_reminder);
  if (!at || at.getTime() <= now.getTime() + 2 * 60 * 1000) return null;
  const full = (task.title || '').trim() || 'your task';
  const t = full.length > 40 ? `${full.slice(0, 37)}...` : full;
  return { at, title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` };
}

// Books that one reminder and saves it on the task the way every other
// booking does (commitNotificationIds, plus a one-entry reminder_schedule so
// the details card, a rename and the phone's alarm all see it). If OneSignal
// refuses, the entry is still saved with no id: the hourly refill books any
// entry without one, so the reminder isn't lost.
export async function bookAtTimeReminder(task, email, now = new Date()) {
  const plan = atTimeReminderFor(task, now);
  if (!task?.id || !plan) return { ids: [], schedule: [] };
  const sendAtISO = plan.at.toISOString();
  let id = null;
  try {
    id = await scheduleReminder({
      email,
      title: plan.title,
      body: plan.body,
      sendAtISO,
      taskId: task.id,
      exact: true,
      data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency || 'medium', type: 'task_reminder' },
      buttons: [
        { id: 'snooze_15', text: 'Snooze 15 min' },
        { id: 'snooze_60', text: 'Snooze 1 hour' },
        { id: 'complete', text: '✅ Done' },
      ],
    });
  } catch (e) {
    console.error('[taskRecurrence] Could not book the reminder at the task\'s time:', e);
  }
  const schedule = [{
    notification_id: id || null,
    send_at: sendAtISO,
    label: 'right now',
    notification_title: plan.title,
    notification_body: plan.body,
  }];
  const ids = id ? [id] : [];
  await commitNotificationIds(task.id, ids, { reminder_schedule: schedule }).catch((e) => {
    console.error('[taskRecurrence] Could not save the booked reminder:', e);
  });
  return { ids, schedule };
}

// Whether the SAVED task is already finished — the record, not the card on
// screen, which can be stale (finished from its notification or on another
// screen). Finishing it again made a second copy of a repeating task.
export async function isAlreadyCompleted(task) {
  if (!task?.id) return false;
  if (task.status === 'completed') return true;
  try {
    const fresh = await base44.entities.Task.get(task.id);
    return fresh?.status === 'completed';
  } catch (e) {
    return false;
  }
}

// The copy a completion of this task already made, if there is one. Exact
// when the task recorded it (next_occurrence_id; tasks finished before that
// field existed have none); otherwise a task with the same title, repeat and
// named time on the same day (the time keeps two same-named tasks apart —
// pills at 8 AM and pills at 8 PM).
async function findNextCopy(task, nextDate) {
  let recordedId = task.next_occurrence_id || null;
  try {
    const fresh = await base44.entities.Task.get(task.id);
    if (fresh?.next_occurrence_id) recordedId = fresh.next_occurrence_id;
  } catch (e) { /* the lookup below still runs */ }
  if (recordedId) {
    try {
      const copy = await base44.entities.Task.get(recordedId);
      if (copy?.id) return copy;
    } catch (e) { /* deleted: fall through to the lookup */ }
  }
  try {
    const rows = await base44.entities.Task.filter(
      { title: task.title, recurrence_pattern: task.recurrence_pattern },
      '-created_date',
      20
    );
    return (rows || []).find((t) =>
      t.id !== task.id && !t.parent_task_id &&
      (t.anchor_time || null) === (task.anchor_time || null) &&
      sameLocalDay((t.classification === 'event' && t.event_time) || (t.day_only_task && t.due_date) || t.next_reminder, nextDate)
    ) || null;
  } catch (e) {
    return null;
  }
}

// A completion that is still making its copy, by task id. A second tap on the
// same task while the first is still working makes nothing (it used to make a
// second copy), and taking the completion back waits for that copy so the
// right one is removed.
const makingCopy = new Map();

export function createNextRecurrence(task) {
  if (!task || !task.recurrence_pattern || task.recurrence_pattern === 'none') return Promise.resolve(null);
  if (!task.id) return isBirthday(task) ? createNextBirthday(task) : Promise.resolve(null);
  if (makingCopy.has(task.id)) return Promise.resolve(null);
  // Birthdays keep the copy they always made (next year's, same day and time),
  // but never twice: finishing the same birthday again (from the alarm, the
  // list, another screen) made a second and third copy of next year's.
  if (isBirthday(task)) {
    const bjob = makeNextBirthdayOnce(task).finally(() => makingCopy.delete(task.id));
    makingCopy.set(task.id, bjob);
    return bjob;
  }
  const job = makeNextCopy(task).finally(() => makingCopy.delete(task.id));
  makingCopy.set(task.id, job);
  return job;
}

async function makeNextCopy(task) {
  // A step never repeats on its own — its parent does. A copy of one would be
  // a stray top-level task with reminders of its own.
  if (task.parent_task_id) return null;

  const now = new Date();
  const { base, nextDate } = nextOccurrence(task, now);

  // Never twice: this occurrence's copy may already be there (a second tap,
  // or the task was un-checked and checked again).
  if (await findNextCopy(task, nextDate)) return null;

  const days = dayDelta(base, nextDate);
  const interval = ownInterval(task);
  const dayOnly = !!task.day_only_task;
  const isEvent = task.classification === 'event';
  // An all-day task keeps the 9 AM anchor every all-day task has; an
  // appointment keeps its own reminder time, moved to the new day.
  const nextReminder = dayOnly
    ? new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 9, 0, 0, 0)
    : isEvent
      ? (validDate(shiftDays(ownNextReminder(task), days)) || nextDate)
      : nextDate;
  const endOfNewDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 23, 59, 0, 0);

  let recipient = task.notification_recipient_email || null;
  if (!recipient) {
    // Finishing a task clears its recipient on the server; the copy is the
    // signed-in user's either way.
    try { recipient = (await base44.auth.me())?.email || null; } catch (e) { recipient = null; }
  }

  const fields = {
    title: task.title,
    description: task.description || '',
    urgency: task.urgency || 'medium',
    energy_required: task.energy_required || 'medium',
    reminder_interval: interval || 'once',
    // What makes this task itself, carried to every occurrence: where it
    // happens, what the user originally wrote, how they asked to be reminded,
    // the time they named, and the chore's follow-up step.
    original_input: task.original_input || null,
    location: task.location || null,
    classification: task.classification || 'task',
    life_area: task.life_area || 'personal',
    reminder_wish: task.reminder_wish || null,
    anchor_time: task.anchor_time || null,
    follow_up_title: task.follow_up_title || null,
    follow_up_minutes: task.follow_up_minutes || null,
    // Also part of what the task is: whether it is all-day, whether its date
    // is an "on" or a "by", how it arrives on the phone (alarm or push), and
    // its attachments. The copy used to drop these, so an all-day chore came
    // back as a timed one and a full-screen alarm came back as a plain push.
    day_only_task: dayOnly,
    deadline_style: task.deadline_style || null,
    alert_style: task.alert_style || null,
    pictures: task.pictures || [],
    notes: task.notes || '',
    // Its dates move to the new day together.
    due_date: shiftDays(task.due_date, days) || (dayOnly ? endOfNewDay.toISOString() : null),
    event_time: shiftDays(task.event_time, days),
    end_time: shiftDays(task.end_time, days),
    end_date: shiftDays(task.end_date, days),
    status: 'active',
    next_reminder: nextReminder.toISOString(),
    recurrence_pattern: task.recurrence_pattern,
    recurrence_days: Array.isArray(task.recurrence_days) && task.recurrence_days.length ? task.recurrence_days : null,
    notification_recipient_email: recipient,
    onesignal_notification_ids: [],
    reminder_count: 0,
  };

  // A timed occurrence gets its reminder booked right here — nothing else
  // would book it (the refill only books rhythms, smart nudges wait until the
  // time has gone by). Judged on the task's OWN interval: a task with none
  // (smart reminders) has no clock time, whatever its copy is saved with.
  const willBook = !!atTimeReminderFor({ ...fields, reminder_interval: interval }, now);
  // Tells the refill cron to stay out while the reminder is being booked.
  if (willBook) fields.reminder_scheduling_since = now.toISOString();

  const newTask = await base44.entities.Task.create(fields);

  // Remember which copy this completion made, so taking the completion back
  // removes exactly that one and checking it again doesn't make another.
  base44.entities.Task.update(task.id, { next_occurrence_id: newTask.id }).catch(() => {});

  if (willBook) {
    try {
      await bookAtTimeReminder({ ...newTask, reminder_interval: interval }, recipient, now);
    } catch (e) {
      console.error('Failed to book the next occurrence\'s reminder', e);
    }
  }

  // The phone's alarm list learns about the new occurrence now, not on the
  // next app open.
  import('./widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});

  return { task: newTask, nextDate };
}

// Taking a completion back (un-checking a repeating task) takes back the copy
// that completion made — only while that copy is still untouched: active, not
// snoozed or parked, same title, notes, pictures and time, and no steps.
// Otherwise un-checking and checking again left two copies. Returns the
// removed copy's id, or null.
export async function removeNextRecurrence(task) {
  if (!task?.id || !task.recurrence_pattern || task.recurrence_pattern === 'none') return null;
  if (task.parent_task_id || isBirthday(task)) return null;
  const pending = makingCopy.get(task.id);
  if (pending) {
    try { await pending; } catch (e) { /* nothing was made */ }
  }
  const { nextDate } = nextOccurrence(task, new Date());
  const copy = await findNextCopy(task, nextDate);
  if (!copy || !(await isUntouchedCopy(copy, task))) return null;

  const ids = Array.from(new Set([
    ...(copy.onesignal_notification_ids || []),
    ...((copy.reminder_schedule || []).map((r) => r?.notification_id)),
  ])).filter((id) => id && !String(id).startsWith('planned_'));
  if (ids.length > 0) await cancelScheduledReminder(ids);
  await base44.entities.Task.delete(copy.id);
  await base44.entities.Task.update(task.id, { next_occurrence_id: null }).catch(() => {});
  import('./widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});
  return copy.id;
}

async function isUntouchedCopy(copy, original) {
  if (!copy || copy.status !== 'active' || copy.silenced) return false;
  if ((copy.snooze_count || 0) > 0) return false;
  if ((copy.title || '') !== (original.title || '')) return false;
  if ((copy.notes || '') !== (original.notes || '')) return false;
  if ((copy.pictures || []).length !== (original.pictures || []).length) return false;
  if ((copy.anchor_time || null) !== (original.anchor_time || null)) return false;
  try {
    const steps = await base44.entities.Task.filter({ parent_task_id: copy.id });
    return !(steps && steps.length > 0);
  } catch (e) {
    return false;
  }
}

async function makeNextBirthdayOnce(task) {
  const nextDate = applyAnchorTime(getNextRecurrenceDate(task), task);
  if (await findNextCopy(task, nextDate)) return null;
  const result = await createNextBirthday(task);
  if (result?.task?.id) {
    base44.entities.Task.update(task.id, { next_occurrence_id: result.task.id }).catch(() => {});
  }
  return result;
}

// Unchanged from before, apart from carrying is_own_birthday.
async function createNextBirthday(task) {
  const nextDate = applyAnchorTime(getNextRecurrenceDate(task), task);

  const newTask = await base44.entities.Task.create({
    title: task.title,
    description: task.description || '',
    urgency: task.urgency || 'medium',
    energy_required: task.energy_required || 'medium',
    reminder_interval: task.reminder_interval || 'once',
    original_input: task.original_input || null,
    location: task.location || null,
    classification: task.classification || 'task',
    life_area: task.life_area || 'personal',
    reminder_wish: task.reminder_wish || null,
    anchor_time: task.anchor_time || null,
    follow_up_title: task.follow_up_title || null,
    follow_up_minutes: task.follow_up_minutes || null,
    status: 'active',
    next_reminder: nextDate.toISOString(),
    recurrence_pattern: task.recurrence_pattern,
    recurrence_days: Array.isArray(task.recurrence_days) && task.recurrence_days.length ? task.recurrence_days : null,
    notification_recipient_email: task.notification_recipient_email || null,
    birthday_person: task.birthday_person || null,
    is_own_birthday: !!task.is_own_birthday,
    birthday_remind_week_before: task.birthday_remind_week_before,
    birthday_remind_day_before: task.birthday_remind_day_before,
    birthday_remind_day_of: task.birthday_remind_day_of,
    onesignal_notification_ids: [],
    reminder_count: 0
  });

  // For yearly birthday reminders, schedule the 🎂 reminders (1 week before,
  // 1 day before, day of) on the new occurrence so they keep firing every year.
  if (task.birthday_person) {
    try {
      const { scheduleBirthdayReminders } = await import('./birthdayScheduler');
      await scheduleBirthdayReminders(newTask);
    } catch (e) {
      console.error('Failed to schedule birthday reminders for recurrence', e);
    }
  }

  return { task: newTask, nextDate };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Wed, Thu" for a task that repeats on specific weekdays; '' otherwise.
export function recurrenceDaysLabel(days) {
  if (!Array.isArray(days) || days.length === 0) return '';
  const names = days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).map((n) => DAY_NAMES[n]);
  if (names.length === 0) return '';
  if (names.length === 7) return 'every day';
  return names.join(', ');
}

export function getRecurrenceLabel(pattern, days) {
  const labels = {
    none: '',
    daily: '🔁 Daily',
    every_other_day: '🔁 Every other day',
    weekdays: '🔁 Weekdays (Mon–Fri)',
    weekly: '🔁 Weekly',
    every_other_week: '🔁 Every other week',
    monthly: '🔁 Monthly',
    yearly: '🎂 Yearly'
  };
  if (pattern === 'weekly') {
    const which = recurrenceDaysLabel(days);
    if (which) return `🔁 ${which}`;
  }
  return labels[pattern] || '';
}
