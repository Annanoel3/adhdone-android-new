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

// Pure helper so callers can sort without subscribing to state.
export function sortTasks(tasks, sortBy) {
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "priority": {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (priorityOrder[a.urgency] ?? 2) - (priorityOrder[b.urgency] ?? 2);
      }
      case "due_date": {
        // Match the collapsedDate display logic in TaskCard:
        // 1. One-time tasks show next_reminder (the actual event time), not due_date
        // 2. Recurring tasks with due_date show "Due <date>"
        // 3. Other tasks with next_reminder show that date
        const dueSortKey = (t) => {
          if (t.reminder_interval === 'once' && t.next_reminder) return new Date(t.next_reminder).getTime();
          if (t.due_date) return new Date(t.due_date).getTime();
          if (t.next_reminder) return new Date(t.next_reminder).getTime();
          return Date.now();
        };
        return dueSortKey(a) - dueSortKey(b);
      }
      case "energy": {
        const energyOrder = { low: 0, medium: 1, high: 2 };
        return (energyOrder[a.energy_required] ?? 1) - (energyOrder[b.energy_required] ?? 1);
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