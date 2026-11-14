// What a repeating task's own TIME means. One copy, used by the repeat pill on
// a task card (TaskCard) and by the time pill in Task Details
// (TaskDetailsModal), so the two can't say different things about one task.
//
// Anna, Nov 14 2026, after setting a time on a "Repeats daily" task in Task
// Details and seeing "Due Nov 15, 2026 • 2:00 PM": "this is a repeat daily
// thing. I set a time, and it just set a due November 15th at a certain time
// thing... if it says repeats daily up there, you should not be able to set a
// due date for it."

const validDays = (days) => (Array.isArray(days) ? days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : []);
const two = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// A repeat that says which days it lands on all by itself: every day, Mon–Fri,
// or named weekdays ("Sat, Sun"). A task like that has a TIME and nothing
// else to set: a date would only argue with the repeat. Every other repeat
// (monthly, yearly, every other day, weekly with no days named) needs a date
// to know which day it is, so those keep theirs.
export function repeatSetsItsOwnDays(task, pattern = task?.recurrence_pattern) {
  if (pattern === 'daily' || pattern === 'weekdays') return true;
  return pattern === 'weekly' && validDays(task?.recurrence_days).length > 0;
}

// The day ('YYYY-MM-DD', the phone's own calendar) that a time set on a
// repeating task lands on. The day the task is already on stays: today's pill
// moved from 10 to 11 is still today's pill. A task with no day at all (a
// fresh copy) starts the next time that clock time comes round on a day the
// repeat allows: today if it is still ahead, otherwise the next allowed day
// (2:00 PM set at 2:40 PM starts tomorrow instead of arriving already late).
export function dayForRepeatTime(task, newTime, pattern = task?.recurrence_pattern, now = new Date()) {
  const own = task?.next_reminder || task?.due_date;
  if (own) {
    const d = new Date(own);
    if (!isNaN(d.getTime())) return dayKey(d);
  }
  const [h, mi] = String(newTime || '').split(':').map((n) => parseInt(n, 10));
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number.isFinite(h) ? h : 9, Number.isFinite(mi) ? mi : 0, 0, 0);
  if (at.getTime() <= now.getTime() + 2 * 60 * 1000) at.setDate(at.getDate() + 1);
  const days = validDays(task?.recurrence_days);
  const fits = (x) => (pattern === 'weekdays'
    ? x.getDay() !== 0 && x.getDay() !== 6
    : pattern === 'weekly' && days.length ? days.includes(x.getDay()) : true);
  for (let i = 0; i < 7 && !fits(at); i++) at.setDate(at.getDate() + 1);
  return dayKey(at);
}
