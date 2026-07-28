// Due-date-aware "today's task" helpers shared across progress, the daily recap,
// and the daily tip. A task counts as "today's" when it has no due date OR its
// due date is today or earlier (overdue tasks are still owed today). Tasks whose
// due date is in the future are "upcoming" and are excluded from today's counts
// (but surfaced separately in the daily recap).

export const getLocalDateString = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export const getTaskDueLocalDate = (task) => {
  if (!task || !task.due_date) return null;
  return getLocalDateString(new Date(task.due_date));
};

// due today OR earlier (overdue) OR no due date
export const isTodayTask = (task, todayStr = getLocalDateString()) => {
  const due = getTaskDueLocalDate(task);
  return !due || due <= todayStr;
};

// due date strictly in the future
export const isUpcomingTask = (task, todayStr = getLocalDateString()) => {
  const due = getTaskDueLocalDate(task);
  return !!due && due > todayStr;
};