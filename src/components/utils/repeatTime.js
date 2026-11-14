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

const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

// ── The repeat as ONE value, for a list of choices ───────────────────────────
// A pattern, or 'monthly:2TU' for a weekday of the month.
export function repeatValueOf(task) {
  const pattern = task?.recurrence_pattern && task.recurrence_pattern !== 'none' ? task.recurrence_pattern : 'none';
  const token = pattern === 'monthly' ? cleanNthWeekday(task?.recurrence_nth_weekday) : null;
  return token ? `monthly:${token}` : pattern;
}

// What picking that value saves. Every change of repeat sets BOTH fields, so
// a weekday of the month never lingers under another repeat.
export function repeatFieldsOf(value) {
  const [pattern, token] = String(value || 'none').split(':');
  return {
    recurrence_pattern: pattern || 'none',
    recurrence_nth_weekday: pattern === 'monthly' ? cleanNthWeekday(token) : null,
  };
}

// The monthly choices for a task, the way calendars offer them: by the day
// the task is on. A task on Tue Nov 10 gets "Monthly on the 10th" and
// "Monthly on the second Tuesday"; one in its month's last week also gets
// "Monthly on the last Tuesday". The task's own weekday-of-the-month is always
// in the list. A task with no day gets plain "Monthly" (there is no day to
// name yet).
export function monthlyChoicesFor(task) {
  const own = nthOfTask(task) ? cleanNthWeekday(task.recurrence_nth_weekday) : null;
  const at = task?.day_only_task ? (task?.due_date || task?.next_reminder) : (task?.next_reminder || task?.due_date);
  const d = at ? new Date(at) : null;
  const has = !!d && !isNaN(d.getTime());
  const list = [{ value: 'monthly', label: has ? `Monthly on the ${ordinal(d.getDate())}` : 'Monthly' }];
  const tokens = [];
  if (has) {
    const n = Math.ceil(d.getDate() / 7);
    if (n <= 4) tokens.push(`${n}${CODES[d.getDay()]}`);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() + 7 > daysInMonth) tokens.push(`-1${CODES[d.getDay()]}`);
  }
  if (own && !tokens.includes(own)) tokens.push(own);
  for (const t of tokens) list.push({ value: `monthly:${t}`, label: `Monthly on the ${nthWeekdayLabel(t)}` });
  return list;
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
  return WORDS[pattern] || String(pattern).replace(/_/g, ' ');
}

// ── A repeat that names its own days ─────────────────────────────────────────
// A repeat that says which days it lands on all by itself: every day, Mon–Fri,
// named weekdays ("Sat, Sun"), or a weekday of the month ("the second
// Tuesday"). A task like that has a TIME and nothing else to set: a date would
// only argue with the repeat. Every other repeat (monthly on a date, yearly,
// every other day, weekly with no days named) needs a date to know which day
// it is, so those keep theirs.
export function repeatSetsItsOwnDays(task, pattern = task?.recurrence_pattern) {
  if (pattern === 'daily' || pattern === 'weekdays') return true;
  if (pattern === 'weekly') return validDays(task?.recurrence_days).length > 0;
  return !!nthOfTask(task, pattern);
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
