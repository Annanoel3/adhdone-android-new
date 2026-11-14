// What a repeating task's own TIME means, and what "the second Tuesday of
// every month" means. One copy, used by the repeat pill on a task card
// (TaskCard), the repeat picker and the time pill in Task Details
// (ReminderTypeSelector, TaskDetailsModal), the Home card (TodaysTasks) and
// the next-copy maker (taskRecurrence), so they can't say different things
// about one task. The server's copy of the day math is
// base44/shared/nthWeekday.ts. Keep the two in step.
//
// Anna, Nov 14 2026, after setting a time on a "Repeats daily" task in Task
// Details and seeing "Due Nov 15, 2026 • 2:00 PM": "this is a repeat daily
// thing. I set a time, and it just set a due November 15th at a certain time
// thing... if it says repeats daily up there, you should not be able to set a
// due date for it." The same day: "we need a way to allow users to make
// recurring for second tuesday of every month, third thursday, first monday,
// first sunday etc".

const validDays = (days) => (Array.isArray(days) ? days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : []);
const two = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// ── A weekday of the month ("2TU") ───────────────────────────────────────────
// Saved on the task as recurrence_nth_weekday next to recurrence_pattern
// 'monthly': a number (1 to 4, or -1 for "last") and a two-letter day. "2TU"
// second Tuesday, "1MO" first Monday, "-1FR" last Friday. Empty = the same
// DATE each month. It only means anything on a monthly repeat.
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NTH_WORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
const NTH_SHORT = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' };

export function parseNthWeekday(token) {
  const m = /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.exec(String(token ?? '').trim().toUpperCase());
  return m ? { n: Number(m[1]), weekday: CODES.indexOf(m[2]) } : null;
}

export function cleanNthWeekday(token) {
  const p = parseNthWeekday(token);
  return p ? `${p.n}${CODES[p.weekday]}` : null;
}

// The task's weekday-of-the-month, only when it repeats monthly.
export function nthOfTask(task, pattern = task?.recurrence_pattern) {
  return pattern === 'monthly' ? parseNthWeekday(task?.recurrence_nth_weekday) : null;
}

// The day of the month (1 to 31) that weekday falls on. monthIndex is 0 to 11
// and may run past either end (12 is January of the next year).
export function nthWeekdayDay(year, monthIndex, nth) {
  if (nth.n === -1) {
    const last = new Date(year, monthIndex + 1, 0);
    return last.getDate() - ((last.getDay() - nth.weekday + 7) % 7);
  }
  const firstDow = new Date(year, monthIndex, 1).getDay();
  return 1 + ((nth.weekday - firstDow + 7) % 7) + (nth.n - 1) * 7;
}

// Whether a date is that weekday of its month.
export function isNthWeekday(date, nth) {
  const d = new Date(date);
  return !isNaN(d.getTime()) && d.getDate() === nthWeekdayDay(d.getFullYear(), d.getMonth(), nth);
}

// One round on, keeping the clock time: that weekday in the month AFTER the
// month `date` is in (this month's round done early or late still moves to
// next month's, never twice in one month).
export function nextMonthNthWeekday(date, nth) {
  const d = new Date(date);
  const first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  d.setFullYear(first.getFullYear(), first.getMonth(), nthWeekdayDay(first.getFullYear(), first.getMonth(), nth));
  return d;
}

// "second Tuesday" / "last Friday"; short: "2nd Tue" / "last Fri".
export function nthWeekdayLabel(token, short = false) {
  const p = parseNthWeekday(token);
  if (!p) return '';
  return short ? `${NTH_SHORT[p.n]} ${DAY_SHORT[p.weekday]}` : `${NTH_WORD[p.n]} ${DAY_LONG[p.weekday]}`;
}

export const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

// ── Monthly on a DATE: the same day each month ───────────────────────────────
// Anna, Nov 14 2026: "we should probably assume that if someone makes
// something monthly, they actually mean that same day each month. Not however
// we were doing it before." Before, the next month was reached by adding a
// month to the date and letting the calendar spill over: the 31st in a 30-day
// month became the 1st of the month after (Oct 31 -> Dec 1), Jan 29, 30 and 31
// became Mar 1, 2 and 3, and the task then stayed on that wrong day for good.
// Now a month that doesn't have the day uses its LAST day (Jan 31 -> Feb 28),
// and the round after goes back to the day it belongs on (-> Mar 31). That day
// is remembered on the task as recurrence_month_day (29, 30 or 31), and only
// trusted while the task sits on the last day of a shorter month, so a date
// the person moved by hand is never pulled back.
const daysInMonth = (y, mi) => new Date(y, mi + 1, 0).getDate();

// The day of the month this round belongs on: its own day, or the remembered
// one when a shorter month has it on its last day. 0 when there is no date.
export function monthDayWanted(task, date) {
  const d = new Date(date);
  if (!date || isNaN(d.getTime())) return 0;
  const want = Number(task?.recurrence_month_day);
  const day = d.getDate();
  return Number.isInteger(want) && want >= 29 && want <= 31 && want > day && day === daysInMonth(d.getFullYear(), d.getMonth()) ? want : day;
}

// One round on, keeping the clock time: that day in the next month, or that
// month's last day when it is shorter.
export function nextMonthSameDay(date, want) {
  const d = new Date(date);
  const first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const day = Math.min(want >= 1 ? want : d.getDate(), daysInMonth(first.getFullYear(), first.getMonth()));
  d.setFullYear(first.getFullYear(), first.getMonth(), day);
  return d;
}

// What to remember on the next round (only a day some months don't have).
export const monthDayToKeep = (want) => (Number.isInteger(want) && want >= 29 && want <= 31 ? want : null);

// ── A monthly rule as two blanks: "the [2nd] [Tuesday] of every month" ──────
// Anna, Nov 14 2026: "Perhaps when setting monthly things it can say 'the ____
// ____ of every month'... The second blank would default to 'day.' But each
// day of the week is available to choose from."
// { ord, unit }: unit 'day' with ord 1 to 31 ("the 15th day"), or unit 0 to 6
// (Sunday to Saturday) with ord 1 to 4 or -1 for last ("the 2nd Tuesday").
// Null = no set day (a monthly task with no date yet).
const ownDate = (task) => {
  const at = task?.day_only_task ? (task?.due_date || task?.next_reminder) : (task?.next_reminder || task?.due_date);
  const d = at ? new Date(at) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

export function monthlyRuleOf(task) {
  const nth = nthOfTask(task);
  if (nth) return { ord: nth.n, unit: nth.weekday };
  const d = ownDate(task);
  return d ? { ord: monthDayWanted(task, d), unit: 'day' } : null;
}

export const monthlyOrdinals = (unit) => (unit === 'day' ? Array.from({ length: 31 }, (_, i) => i + 1) : [1, 2, 3, 4, -1]);
export const ordinalWord = (n) => (n === -1 ? 'last' : ordinal(n));
export const WEEKDAY_WORDS = DAY_LONG;

// The rule after one blank is changed, kept a real rule: a weekday takes 1st
// to 4th or last (the 15th becomes the 3rd), and going back to "day" takes
// the day the task is on.
export function changeMonthlyRule(rule, change, task, now = new Date()) {
  const cur = rule || { ord: (ownDate(task) || now).getDate(), unit: 'day' };
  if (change.unit !== undefined) {
    const unit = change.unit === 'day' ? 'day' : Number(change.unit);
    if (unit === 'day') {
      return { ord: cur.unit === 'day' ? cur.ord : (ownDate(task) || now).getDate(), unit };
    }
    const ord = cur.unit === 'day' ? Math.min(4, Math.max(1, Math.ceil(cur.ord / 7))) : cur.ord;
    return { ord, unit };
  }
  const ord = Number(change.ord);
  return monthlyOrdinals(cur.unit).includes(ord) ? { ord, unit: cur.unit } : cur;
}

export function fitsMonthlyRule(date, rule) {
  const d = new Date(date);
  if (!rule || isNaN(d.getTime())) return false;
  if (rule.unit === 'day') return d.getDate() === Math.min(rule.ord, daysInMonth(d.getFullYear(), d.getMonth()));
  return isNthWeekday(d, { n: rule.ord, weekday: rule.unit });
}

// The day ('YYYY-MM-DD') a monthly rule puts the task on: the day it is
// already on when that fits the rule (this month's round stays, late or not);
// otherwise the first such day from today on, or from tomorrow on when the
// task has a clock time that has already gone by today.
export function dayForMonthlyRule(task, rule, time, now = new Date()) {
  const own = ownDate(task);
  if (own && fitsMonthlyRule(own, rule)) return dayKey(own);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (m) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]), 0, 0);
    if (t.getTime() <= now.getTime() + 2 * 60 * 1000) at.setDate(at.getDate() + 1);
  }
  for (let i = 0; i < 70 && !fitsMonthlyRule(at, rule); i++) at.setDate(at.getDate() + 1);
  return dayKey(at);
}

// ── The repeat as ONE value ──────────────────────────────────────────────────
// A pattern, 'monthly:2TU' for a weekday of the month, 'monthly:D15' for a day
// of the month, plain 'monthly' for a monthly task with no day yet.
export function monthlyRuleValue(rule) {
  if (!rule) return 'monthly';
  return rule.unit === 'day' ? `monthly:D${rule.ord}` : `monthly:${rule.ord}${CODES[rule.unit]}`;
}

export function repeatValueOf(task) {
  const pattern = task?.recurrence_pattern && task.recurrence_pattern !== 'none' ? task.recurrence_pattern : 'none';
  return pattern === 'monthly' ? monthlyRuleValue(monthlyRuleOf(task)) : pattern;
}

// What picking that value saves. Every change of repeat sets ALL the repeat
// fields, so a weekday of the month or a remembered day never lingers under
// another repeat.
export function repeatFieldsOf(value) {
  const [pattern, rest] = String(value || 'none').split(':');
  const day = /^D(\d{1,2})$/.exec(String(rest || ''));
  return {
    recurrence_pattern: pattern || 'none',
    recurrence_nth_weekday: pattern === 'monthly' && !day ? cleanNthWeekday(rest) : null,
    recurrence_month_day: pattern === 'monthly' && day ? monthDayToKeep(Number(day[1])) : null,
  };
}

// ── Words for a repeat ───────────────────────────────────────────────────────
const WORDS = {
  daily: 'Daily', every_other_day: 'Every other day', weekdays: 'Weekdays', weekly: 'Weekly',
  every_other_week: 'Every other week', monthly: 'Monthly', yearly: 'Yearly',
};
// The short words a pill uses before the time: "Daily", "Weekdays",
// "Sat, Sun", "Monthly 2nd Tue", "Monthly".
export function repeatShortLabel(task) {
  const pattern = task?.recurrence_pattern;
  if (!pattern || pattern === 'none') return '';
  const days = validDays(task?.recurrence_days);
  if (pattern === 'weekly' && days.length) return days.map((n) => DAY_SHORT[n]).join(', ');
  const nth = nthOfTask(task);
  if (nth) return `Monthly ${nthWeekdayLabel(task.recurrence_nth_weekday, true)}`;
  if (pattern === 'monthly') {
    const d = ownDate(task);
    return d ? `Monthly ${ordinal(monthDayWanted(task, d))}` : 'Monthly';
  }
  return WORDS[pattern] || String(pattern).replace(/_/g, ' ');
}

// ── A repeat that names its own days ─────────────────────────────────────────
// A repeat that says which days it lands on all by itself: every day, Mon–Fri,
// named weekdays ("Sat, Sun"), or monthly ("the 2nd Tuesday of every month",
// "the 15th day of every month": the two blanks say the day). A task like that
// has a TIME and nothing else to set: a date would only argue with the repeat.
// Every other repeat (yearly, every other day, every other week, weekly with
// no days named) needs a date to know which day it is, so those keep theirs.
export function repeatSetsItsOwnDays(task, pattern = task?.recurrence_pattern) {
  if (pattern === 'daily' || pattern === 'weekdays' || pattern === 'monthly') return true;
  return pattern === 'weekly' && validDays(task?.recurrence_days).length > 0;
}

// The day ('YYYY-MM-DD', the phone's own calendar) that a time set on a
// repeating task lands on. The day the task is already on stays: today's pill
// moved from 10 to 11 is still today's pill. A task with no day at all (a
// fresh copy) starts the next time that clock time comes round on a day the
// repeat allows: today if it is still ahead, otherwise the next allowed day
// (2:00 PM set at 2:40 PM starts tomorrow instead of arriving already late).
// `task` is the task as it will be saved (its repeat included).
export function dayForRepeatTime(task, newTime, now = new Date()) {
  const own = task?.next_reminder || task?.due_date;
  if (own) {
    const d = new Date(own);
    if (!isNaN(d.getTime())) return dayKey(d);
  }
  const pattern = task?.recurrence_pattern;
  const [h, mi] = String(newTime || '').split(':').map((n) => parseInt(n, 10));
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number.isFinite(h) ? h : 9, Number.isFinite(mi) ? mi : 0, 0, 0);
  if (at.getTime() <= now.getTime() + 2 * 60 * 1000) at.setDate(at.getDate() + 1);
  const days = validDays(task?.recurrence_days);
  const nth = nthOfTask(task);
  const fits = (x) => (pattern === 'weekdays'
    ? x.getDay() !== 0 && x.getDay() !== 6
    : pattern === 'weekly' && days.length ? days.includes(x.getDay())
      : nth ? isNthWeekday(x, nth) : true);
  for (let i = 0; i < 70 && !fits(at); i++) at.setDate(at.getDate() + 1);
  return dayKey(at);
}
