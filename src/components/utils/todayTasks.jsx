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

// A task counts as "today" when its start has arrived (today >= start). Tasks
// with no end_date stay "today" until completed — overdue tasks remain in
// Today. Tasks with an explicit end_date (multi-day events) drop out once
// the span ends. Tasks with no effective date (recurring, no due) are always today.
export const isTodayTask = (task, todayStr = getLocalDateString()) => {
  const start = getTaskDueLocalDate(task);
  if (!start) return true;
  if (start > todayStr) return false;
  const end = getTaskEndLocalDate(task);
  if (end && end < todayStr) return false;
  return true;
};

// effective start date strictly in the future
export const isUpcomingTask = (task, todayStr = getLocalDateString()) => {
  const start = getTaskDueLocalDate(task);
  return !!start && start > todayStr;
};