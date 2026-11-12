// What a rename changes on the task itself. No network here, only the rules
// (renameReread.js does the asking and the saving).
//
// Anna, Nov 12 2026: "any change to a task whether it be date, time, name etc
// should initiate a relook". A rename used to re-book the pushes under the new
// name and have Smart Reminders plan again, and nothing read the new name: two
// chores renamed to end in "weekly" stayed one-time tasks.
//
// The rule: the new name can ADD a day, a time or a repeat, or change one it
// states differently. It never takes one away. `added` is the model's answer
// to "what does the new name say that the old one didn't" (parseTask,
// { renamed }); `parsed` is the same parser a new task goes through, reading
// the new name as of now. Only the parts `added` names are taken from it, so
// the day the parser fills in for a bare "2pm" never moves a task that
// already has its day, and a typo fix changes nothing.

import { deriveSchedule, deadlineWindowStart } from './taskSchedule';

const REPEATS = ['daily', 'every_other_day', 'weekdays', 'weekly', 'every_other_week', 'monthly', 'yearly'];
// A rhythm the person asked for ("keep reminding me every hour"): its pings
// are the refill job's, and its time is where they start. Left as it is.
const RHYTHMS = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clockOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const valid = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
// A local day and clock time as a moment on this phone's clock.
const momentOf = (day, time) => {
  const [y, m, d] = String(day).split('-').map((n) => parseInt(n, 10));
  const [h, min] = String(time || '00:00').split(':').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, h, min, 0, 0);
};
const sortedDays = (v) => {
  if (!Array.isArray(v)) return null;
  const days = [...new Set(v.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return days.length ? days : null;
};

const wordsOf = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

// Every word of the new name was already in the old one (words taken out,
// moved around, or only capitals and punctuation changed): nothing was added,
// so there is nothing new to read and nobody is asked.
export function addsNothing(oldTitle, newTitle) {
  const had = new Set(wordsOf(oldTitle));
  return wordsOf(newTitle).every((w) => had.has(w));
}

// Tasks whose day and repeat are not the name's to set: a birthday (its
// person and date), a step (it never reminds on its own), a goal's task (the
// goal's plan sets its days), and anything finished or cancelled.
export function skipsReread(task) {
  if (!task?.id) return true;
  if (task.status && task.status !== 'active') return true;
  if (task.classification === 'birthday' || task.birthday_person || task.is_own_birthday) return true;
  if (task.parent_task_id) return true;
  if (task.goal_id || task.goal_step_id) return true;
  return false;
}

// → { repeat, when }, each null when the rename changes nothing there.
//   repeat: { recurrence_pattern, recurrence_days }
//   when:   { fields, bookAt, day, time, becameEvent }; `fields` are saved as
//           they are, `bookAt` is the moment its reminders are planned from
//           (null: nothing to book now).
export function planRenameChanges(task, added, parsed, now = new Date()) {
  const plan = { repeat: null, when: null };
  if (!task || !added || !parsed) return plan;
  const T = task;
  const isEvent = T.classification === 'event';

  // ── How often ──────────────────────────────────────────────────────────────
  let pattern = REPEATS.includes(T.recurrence_pattern) ? T.recurrence_pattern : 'none';
  if (added.repeat === true && REPEATS.includes(parsed.recurrence_pattern)) {
    const days = parsed.recurrence_pattern === 'weekly' ? sortedDays(parsed.recurrence_days) : null;
    const samePattern = parsed.recurrence_pattern === pattern;
    const sameDays = JSON.stringify(days) === JSON.stringify(sortedDays(T.recurrence_days));
    // The same pattern with no weekdays named ("weekly" on a task already set
    // to every Monday) changes nothing: the name never takes the days away.
    if (!samePattern || (days && !sameDays)) {
      plan.repeat = { recurrence_pattern: parsed.recurrence_pattern, recurrence_days: days };
      pattern = parsed.recurrence_pattern;
    }
  }

  // ── When ───────────────────────────────────────────────────────────────────
  const wantsDay = added.day === true && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.target_date || ''));
  const wantsTime = added.time === true && /^\d{2}:\d{2}$/.test(String(parsed.target_time || ''));
  if ((!wantsDay && !wantsTime) || RHYTHMS.includes(T.reminder_interval)) return plan;

  // What the task has now: its day, and its clock time when it has one.
  const start = valid(isEvent ? (T.event_time || T.next_reminder || T.due_date) : (T.due_date || T.next_reminder));
  const timedStart = isEvent ? valid(T.event_time) : (T.day_only_task ? null : valid(T.next_reminder));
  const hasDay = start ? dayOf(start) : null;
  const hasTime = timedStart ? clockOf(timedStart) : null;

  const today = dayOf(now);
  const floor = now.getTime() + 2 * 60 * 1000;
  const parsedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.target_date || '')) ? parsed.target_date : null;
  // Only a time was added: it goes on the day the task already has. A task
  // with no day, or one whose day is behind it, takes the parser's day for a
  // bare time (today, or tomorrow when that time has gone by).
  let day = wantsDay ? parsed.target_date : (hasDay && hasDay >= today ? hasDay : parsedDay);
  let time = wantsTime ? parsed.target_time : hasTime;
  if (!day) return plan;
  // A day already behind us is not put on a task by a rename.
  if (day < today) return plan;
  if (time && momentOf(day, time).getTime() <= floor) {
    if (!wantsDay && parsedDay && parsedDay !== day && momentOf(parsedDay, time).getTime() > floor) {
      day = parsedDay;
    } else if (wantsDay && !wantsTime && day >= today) {
      // Only the day is new, and the clock time the task had has already gone
      // by on it ("today", typed at 2:30 on a task that was Friday at 2): the
      // day is taken, with no time.
      time = null;
    }
    // Otherwise it is today, at a time that has just gone by ("this
    // afternoon", read as 2:00 at 2:30): saved as that, the way the same
    // words are on a new task. It is due then and nothing is booked, so it
    // reads as overdue, not undated (RULES.md §9 Q3).
  }
  // The name now says what the task already has.
  if (day === hasDay && (time || null) === (hasTime || null)) return plan;

  // A plain task whose new name reads as an appointment becomes one, the way
  // the same words would on a new task. Nothing is ever turned back.
  const plainTask = !T.classification || T.classification === 'task';
  const toEvent = isEvent || (plainTask && parsed.classification === 'event');
  const saysBy = parsed.deadline_style === 'by';
  const hadBy = T.deadline_style === 'by';
  // "By Friday" or "on Friday" is the new name's call when it names the day;
  // a time added to a "by" deadline keeps it a deadline.
  const style = toEvent
    ? (isEvent && hadBy ? 'by' : 'on')
    : ((wantsDay || !hasDay) ? (saysBy ? 'by' : 'on') : (saysBy || hadBy ? 'by' : 'on'));

  // The same sums a new task gets (taskSchedule.deriveSchedule).
  const merged = {
    classification: toEvent ? 'event' : (T.classification || 'task'),
    target_date: day,
    target_time: time || null,
    day_only_task: !time,
    deadline_style: style,
    recurrence_pattern: pattern,
    reminder_interval: null,
    end_date: wantsDay && parsed.end_date ? parsed.end_date : null,
    due_date: null,
  };
  const s = deriveSchedule(merged, now);

  const fields = {
    next_reminder: s.nextReminder ? s.nextReminder.toISOString() : null,
    due_date: s.dueDateISO || null,
    day_only_task: !time,
    deadline_style: style,
    anchor_time: time || null,
    // A time they typed is theirs (it may ring in quiet hours, RULES.md §9
    // Q4); one the parser picked from "tonight" is not. A time the task
    // already had keeps whichever it was.
    time_stated: !!time && (wantsTime ? parsed.time_stated === true : T.time_stated === true),
    reminder_interval: 'once',
  };
  if (toEvent) {
    fields.classification = 'event';
    fields.event_time = s.eventTimeISO || null;
  }
  // A new "by" deadline is on Today from now until its day, as on a new task.
  // A start day the task already has is left alone.
  if (!T.start_date && (wantsDay || !hasDay)) {
    const windowStart = deadlineWindowStart(merged, s.dueDateISO, now);
    if (windowStart) fields.start_date = windowStart;
  }
  // A span of days: the new name's own last day, or the old span moved along
  // with its first day.
  if (wantsDay && parsed.end_date && s.endDateISO) {
    fields.end_date = s.endDateISO;
  } else if (T.end_date && hasDay && day !== hasDay && valid(T.end_date)) {
    const moved = Math.round((momentOf(day, '12:00').getTime() - momentOf(hasDay, '12:00').getTime()) / DAY_MS);
    const end = valid(T.end_date);
    end.setDate(end.getDate() + moved);
    fields.end_date = end.toISOString();
  }
  // A block ("10:00 AM – 6:00 PM") keeps its length.
  if (T.end_time && timedStart && time && valid(T.end_time)) {
    const shift = momentOf(day, time).getTime() - timedStart.getTime();
    fields.end_time = new Date(valid(T.end_time).getTime() + shift).toISOString();
  }
  // A one-time task moved LATER is a push, the same count every date pill
  // keeps (Insights and Smart Reminders read it). Events and repeats aren't.
  const was = valid(T.due_date || T.next_reminder);
  const willBe = valid(fields.due_date || fields.next_reminder);
  if (!toEvent && pattern === 'none' && was && willBe && willBe.getTime() > was.getTime()) {
    fields.due_date_pushes = (T.due_date_pushes || 0) + 1;
  }

  plan.when = { fields, bookAt: fields.next_reminder, day, time: time || null, becameEvent: toEvent && !isEvent };
  return plan;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const repeatWords = (pattern, days) => {
  if (pattern === 'weekly' && Array.isArray(days) && days.length > 0) {
    if (days.length === 7) return 'every day';
    if (days.join(',') === '1,2,3,4,5') return 'on weekdays';
    return `every ${days.map((n) => DAY_NAMES[n]).join(', ')}`;
  }
  return {
    daily: 'every day',
    every_other_day: 'every other day',
    weekdays: 'on weekdays',
    weekly: 'every week',
    every_other_week: 'every other week',
    monthly: 'every month',
    yearly: 'every year',
  }[pattern] || '';
};

// One short line saying what was read from the new name, for the toast.
export function renameSummary(plan) {
  const parts = [];
  if (plan?.when) {
    const at = momentOf(plan.when.day, plan.when.time || '12:00');
    const dayText = at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    parts.push(plan.when.time
      ? `${dayText} at ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : dayText);
  }
  if (plan?.repeat) {
    const how = repeatWords(plan.repeat.recurrence_pattern, plan.repeat.recurrence_days);
    if (how) parts.push(`repeats ${how}`);
  }
  if (parts.length === 0) return '';
  const line = parts.join(', ');
  if (!plan?.when) return `Now ${line}`;
  const deadline = plan.when.fields?.deadline_style === 'by' && plan.when.fields?.classification !== 'event';
  return `${deadline ? 'Due by' : 'Set for'} ${line}`;
}
