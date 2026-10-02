// Due-date-aware "today's task" helpers shared across progress, the daily recap,
// and the daily tip. A task counts as "today's" when it has no due date OR its
// due date is today or earlier (overdue tasks are still owed today). Tasks whose
// due date is in the future are "upcoming" and are excluded from today's counts
// (but surfaced separately in the daily recap).
//
// For one-time tasks (reminder_interval === 'once') with no due_date but a
// next_reminder, the next_reminder date acts as the effective date so a task
// scheduled for Nov 1 doesn't appear in "Today" on Jul 29.

export const getLocalDateString = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export const getTaskDueLocalDate = (task) => {
  if (!task) return null;
  // If start_date is set, that's the effective start for "today" purposes —
  // the task is "in progress" from start_date through due_date.
  if (task.start_date) return getLocalDateString(new Date(task.start_date));
  if (task.due_date) return getLocalDateString(new Date(task.due_date));
  // One-time tasks use next_reminder as the effective date when no due_date
  if (task.reminder_interval === 'once' && task.next_reminder) {
    return getLocalDateString(new Date(task.next_reminder));
  }
  // A repeating task's next occurrence is made the moment the last one is
  // checked off, and its next_reminder is the day it's for ("Take Pills,
  // daily at 10": done today → tomorrow at 10). That occurrence belongs on
  // tomorrow's list, not today's, even when it also has a rhythm ("keep
  // reminding me until I do it"). Once its day comes it stays in Today until
  // it's done, like everything else.
  if (task.recurrence_pattern && task.recurrence_pattern !== 'none' && task.next_reminder) {
    return getLocalDateString(new Date(task.next_reminder));
  }
  return null;
};

// Last day of a multi-day span (inclusive), if any. Only used for events with
// an explicit end_date — NOT for due_date, which is a deadline (the task stays
// "today" as overdue until completed, even after the deadline passes).
export const getTaskEndLocalDate = (task) => {
  if (!task) return null;
  if (task.end_date) return getLocalDateString(new Date(task.end_date));
  return null;
};

// A task counts as "today" when its start has arrived (today >= start), and
// stays "today" until it's completed or deleted — overdue tasks and events
// whose day (or last day) has passed remain in Today. Tasks with no effective
// date (a reminder rhythm with no date and no repeat) are always today.
export const isTodayTask = (task, todayStr = getLocalDateString()) => {
  // Back Burner: silenced tasks drop out of Today's Tasks — they're intentionally
  // out of sight (and silent) until the user reactivates them.
  if (task.silenced) return false;
  const start = getTaskDueLocalDate(task);
  if (!start) return true;
  if (start > todayStr) return false;
  // Once started it stays in Today until it's finished or deleted — a
  // multi-day event whose last day has passed no longer drops out on its own.
  // Nothing disappears just because its time went by.
  return true;
};

// A real task (not a subtask, not a birthday) that was completed on the user's
// LOCAL calendar day. Always compare local dates — comparing the UTC date makes
// evening completions vanish from "today" once UTC rolls past midnight.
export const isCompletedToday = (task, todayStr = getLocalDateString()) => {
  if (task.status !== 'completed' || task.parent_task_id || task.birthday_person) return false;
  const when = task.completed_at || task.updated_date;
  if (!when) return false;
  return getLocalDateString(new Date(when)) === todayStr;
};

// A date given to a task that never had one is a DEADLINE — "do this BY then",
// not "on that day" (Anna, Oct 2 2026). People add a date to a task that has
// sat on today's list too long to get it off the list, and still want to be
// nudged about it right up to that day; "on that day" went quiet until then.
// Same for a task that only had a time. A task that already had a date keeps
// whatever it was ("on" stays "on", "by" stays "by"). Repeats, calendar
// events and birthdays are tied to their day and are left alone.
export const firstDateMakesDeadline = (task, nextDueISO) => {
  if (!task || !nextDueISO || task.due_date) return {};
  if (task.recurrence_pattern && task.recurrence_pattern !== 'none') return {};
  if (task.event_time || task.device_event_id || task.google_event_id || task.classification === 'event') return {};
  if (task.birthday_person || task.classification === 'birthday') return {};
  return { deadline_style: 'by' };
};

// effective start date strictly in the future
export const isUpcomingTask = (task, todayStr = getLocalDateString()) => {
  const start = getTaskDueLocalDate(task);
  return !!start && start > todayStr;
};