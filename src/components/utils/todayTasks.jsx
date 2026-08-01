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
  if (task.due_date) return getLocalDateString(new Date(task.due_date));
  // One-time tasks use next_reminder as the effective date when no due_date
  if (task.reminder_interval === 'once' && task.next_reminder) {
    return getLocalDateString(new Date(task.next_reminder));
  }
  return null;
};

// Last day of a multi-day event (inclusive), if any.
export const getTaskEndLocalDate = (task) => {
  if (!task || !task.end_date) return null;
  return getLocalDateString(new Date(task.end_date));
};

// A task counts as "today" when its start has arrived (today >= start) and —
// for multi-day events — today is still within the span (today <= end).
// Ordinary overdue tasks (no end_date) remain "today" until completed, same
// as before. Tasks with no effective date (recurring, no due) are always today.
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