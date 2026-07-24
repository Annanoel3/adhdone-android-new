import { useState, useEffect, useCallback } from "react";

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
        // Recurring tasks update next_reminder when they recreate, so this
        // keeps them sorted by their freshly assigned date.
        const aDate = a.next_reminder ? new Date(a.next_reminder).getTime() : Infinity;
        const bDate = b.next_reminder ? new Date(b.next_reminder).getTime() : Infinity;
        return aDate - bDate;
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

export function useTaskSort() {
  const [sortBy, setSortByState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "created_date"
  );

  const setSortBy = useCallback((value) => {
    setSortByState(value);
    localStorage.setItem(STORAGE_KEY, value);
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