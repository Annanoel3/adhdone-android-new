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
// reminder. NaN when it has none.
const momentOf = (t) => {
  const raw = (t.reminder_interval === 'once' && t.next_reminder) ? t.next_reminder : (t.due_date || t.next_reminder);
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};
const localDay = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// "By Due Date" is the order of the day (Anna, Nov 6 2026: "early tasks go
// first. Tasks with no time go second. Tasks that are late go last"), and the
// home-screen widget uses the same order:
//   1. tasks with a clock time still ahead, earliest first;
//   2. tasks with no clock time (an all-day task on its day, a task with no
//      date), by day, then priority;
//   3. late ones last: a clock time already gone by, or an all-day task whose
//      day has passed, earliest first.
// Ties within a group go by priority, then oldest first.
export function timeOfDayCompare(a, b, nowMs = Date.now()) {
  const place = (t) => {
    const ms = momentOf(t);
    const timed = !t.day_only_task && Number.isFinite(ms);
    if (timed) return ms >= nowMs ? { group: 0, key: ms } : { group: 2, key: ms };
    // No clock time: an all-day task is late once its day is over.
    if (Number.isFinite(ms) && localDay(ms) < localDay(nowMs)) return { group: 2, key: ms };
    return { group: 1, key: Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER };
  };
  const pa = place(a);
  const pb = place(b);
  if (pa.group !== pb.group) return pa.group - pb.group;
  // Inside the no-time group every task on the same day is equal on time:
  // priority decides, then the day.
  if (pa.group === 1) {
    const da = Number.isFinite(pa.key) && pa.key !== Number.MAX_SAFE_INTEGER ? localDay(pa.key) : Infinity;
    const db = Number.isFinite(pb.key) && pb.key !== Number.MAX_SAFE_INTEGER ? localDay(pb.key) : Infinity;
    if (da !== db) return da - db;
    if (priorityRank(a) !== priorityRank(b)) return priorityRank(a) - priorityRank(b);
  } else if (pa.key !== pb.key) {
    return pa.key - pb.key;
  } else if (priorityRank(a) !== priorityRank(b)) {
    return priorityRank(a) - priorityRank(b);
  }
  return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
}

// Pure helper so callers can sort without subscribing to state.
export function sortTasks(tasks, sortBy) {
  const sorted = [...tasks];
  const nowMs = Date.now();
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "priority": {
        return priorityRank(a) - priorityRank(b);
      }
      case "due_date": {
        return timeOfDayCompare(a, b, nowMs);
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