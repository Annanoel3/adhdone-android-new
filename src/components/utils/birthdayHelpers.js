// Shared birthday helpers. Birthdays live on the Task entity but behave like
// their own feature: they stay OUT of regular task lists except on the day
// itself, when they surface alongside the day's real tasks.

import { getLocalDateString } from "./todayTasks";

export const isBirthdayTask = (t) =>
  !!t && (!!t.birthday_person || t.classification === "birthday");

// The birthday's own day, in the user's local calendar.
export const isBirthdayToday = (t, todayStr = getLocalDateString()) => {
  if (!isBirthdayTask(t) || !t.next_reminder) return false;
  return getLocalDateString(new Date(t.next_reminder)) === todayStr;
};

// A task list should show this record today: regular tasks always, birthdays
// only on the day itself.
export const passesBirthdayDayFilter = (t) =>
  !isBirthdayTask(t) || isBirthdayToday(t);

export const daysUntilBirthday = (iso) => {
  const todayStr = getLocalDateString();
  const target = getLocalDateString(new Date(iso));
  const a = new Date(`${todayStr}T00:00:00`);
  const b = new Date(`${target}T00:00:00`);
  return Math.round((b - a) / 86400000);
};

// The next birthday still to come THIS calendar month (today counts). Returns
// null once the month's birthdays have all passed — the strip then shows its
// quiet empty state instead of jumping months ahead.
export const getNextBirthdayThisMonth = (tasks) => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return (
    (tasks || [])
      .filter((t) => isBirthdayTask(t) && t.status === "active" && t.next_reminder)
      .filter((t) => {
        const d = new Date(t.next_reminder);
        return d.getMonth() === month && d.getFullYear() === year && daysUntilBirthday(t.next_reminder) >= 0;
      })
      .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder))[0] || null
  );
};