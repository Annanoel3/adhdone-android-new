import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "task_sort_preference";
const SORT_EVENT = "task_sort_change";

export const SORT_OPTIONS = {
  created_date: "Newest First",
  priority: "By Priority",
  due_date: "By Due Date",
  energy: "By Energy",
};
// Only offered while the Tasks page shows Completed (Anna, Oct 7 2026): most
// recently finished first. Anywhere else it reads as "Newest First".
export const COMPLETED_SORT = "completed_at";
export const COMPLETED_SORT_LABEL = "Recently Completed";

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const priorityRank = (t) => PRIORITY_ORDER[t?.urgency] ?? 2;

// The moment a task is for, the way the card shows it (collapsedDate): a
// one-time task's own time (next_reminder), else its due date, else its next
// reminder. NaN when it has none. `timed`: it has a clock time of its own
// (an event's start, a one-time task's time, a dated deadline) — not an
// all-day task's day, and not a rhythm's next ping ("every hour": the ping
// moving past isn't the task being late).
const momentOf = (t) => {
  const own = t.event_time || ((t.reminder_interval === 'once' && t.next_reminder) ? t.next_reminder : null) || t.due_date || null;
  const raw = own || t.next_reminder;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return { ms: Number.isFinite(ms) ? ms : NaN, timed: !t.day_only_task && !!own && Number.isFinite(ms) };
};
const localDay = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// "By Due Date" is the order of the day, and the home-screen widget uses the
// same order. Anna, Nov 6 2026: early times on top, no time in the middle,
// late times at the bottom; then, asked where early ends: "anything before 12
// on top. Anything from 1-3 in the middle. (Aka in the middle of tasks without
// times). And anything after 4 at the bottom". (The first version, earlier
// that day, read "late" as "overdue" and put a 9 PM and a 10 PM task on top
// at 4:39 PM because their times were still ahead.) It goes by time of day,
// not by whether the time has passed, so the order is the same all day.
// Day by day (overdue tasks and tasks with no date count as today), each day:
//   1. clock time before noon, earliest first;
//   2. no clock time (an all-day task, a dateless task, a rhythm's next
//      ping), by priority, with the tasks timed noon to 3:59 PM set in the
//      middle of them, earliest first;
//   3. clock time 4 PM or later, earliest first.
// Ties go by priority, then oldest first.
const EARLY_BEFORE_MIN = 12 * 60;
const LATE_FROM_MIN = 16 * 60;
const minutesOfDay = (ms) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const olderFirst = (a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
const byPriority = (a, b) => (priorityRank(a) - priorityRank(b)) || olderFirst(a, b);
const byClock = (a, b) => (minutesOfDay(momentOf(a).ms) - minutesOfDay(momentOf(b).ms)) || byPriority(a, b);

export function timeOfDayOrder(tasks, nowMs = Date.now()) {
  const today = localDay(nowMs);
  const days = new Map();
  for (const t of tasks) {
    const { ms, timed } = momentOf(t);
    const day = Number.isFinite(ms) ? Math.max(localDay(ms), today) : today;
    if (!days.has(day)) days.set(day, { early: [], none: [], midday: [], late: [] });
    const g = days.get(day);
    if (!timed) {
      g.none.push(t);
    } else {
      const m = minutesOfDay(ms);
      (m < EARLY_BEFORE_MIN ? g.early : m < LATE_FROM_MIN ? g.midday : g.late).push(t);
    }
  }
  const out = [];
  for (const day of [...days.keys()].sort((x, y) => x - y)) {
    const g = days.get(day);
    g.none.sort(byPriority);
    const half = Math.ceil(g.none.length / 2);
    out.push(
      ...g.early.sort(byClock),
      ...g.none.slice(0, half),
      ...g.midday.sort(byClock),
      ...g.none.slice(half),
      ...g.late.sort(byClock),
    );
  }
  return out;
}

// Pure helper so callers can sort without subscribing to state.
export function sortTasks(tasks, sortBy) {
  // "By Due Date" places tasks in blocks (see timeOfDayOrder), not pair by pair.
  if (sortBy === "due_date") return timeOfDayOrder(tasks || [], Date.now());
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "priority": {
        return priorityRank(a) - priorityRank(b);
      }
      case "energy": {
        const energyOrder = { low: 0, medium: 1, high: 2 };
        return (energyOrder[a.energy_required] ?? 1) - (energyOrder[b.energy_required] ?? 1);
      }
      case COMPLETED_SORT: {
        // Finished most recently first. Older completions recorded no
        // completed_at; their last update is the closest thing.
        const doneAt = (t) => new Date(t.completed_at || t.updated_date || t.created_date).getTime();
        return doneAt(b) - doneAt(a);
      }
      case "created_date":
      default: {
        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
      }
    }
  });
  return sorted;
}

// A reinstall or a new phone starts with no local copy; the account remembers
// the choice (User.task_sort). Fills in only when nothing is stored here — a
// choice made on this phone always wins over the profile copy. Called from
// Layout once the profile is known; mounted lists pick it up through the event.
export function seedTaskSortFromProfile(user) {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const v = user?.task_sort;
    if (!v || !SORT_OPTIONS[v]) return;
    localStorage.setItem(STORAGE_KEY, v);
    window.dispatchEvent(new CustomEvent(SORT_EVENT, { detail: { sortBy: v } }));
  } catch (e) { /* no storage */ }
}

export function useTaskSort() {
  const [sortBy, setSortByState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "created_date"
  );

  const setSortBy = useCallback((value) => {
    setSortByState(value);
    localStorage.setItem(STORAGE_KEY, value);
    // And on the account, for the next phone or reinstall.
    base44.auth.updateMe({ task_sort: value }).catch(() => {});
    // Notify other mounted instances (Home + Tasks) in the same tab.
    window.dispatchEvent(new CustomEvent(SORT_EVENT, { detail: { sortBy: value } }));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.sortBy) setSortByState(e.detail.sortBy);
    };
    const storageHandler = (e) => {
      if (e.key === STORAGE_KEY) setSortByState(e.newValue || "created_date");
    };
    window.addEventListener(SORT_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(SORT_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  return { sortBy, setSortBy };
}