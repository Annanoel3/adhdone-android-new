import React from "react";
import { Check } from "lucide-react";
import { getLocalDateString } from "../utils/todayTasks";

// This week, Monday to Sunday, for a daily-habit step (ported from the Goals
// app's HabitWeekTracker). A day is done when it was ticked here or the
// habit's task was finished that day (doneDays has both; the goal page works
// that out). Future days can't be ticked.

const DAYS = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];

function currentWeekDates() {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 7 }, (_, i) =>
    getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset + i)));
}

export default function HabitWeekTracker({ doneDays, onToggleDay, busy, L }) {
  const weekDates = currentWeekDates();
  const today = getLocalDateString();
  return (
    <div className="flex items-center gap-1 px-3 pb-3 pt-1">
      {DAYS.map((label, i) => {
        const dateStr = weekDates[i];
        const isDone = doneDays.has(dateStr);
        const isToday = dateStr === today;
        const isFuture = dateStr > today;
        return (
          <button
            key={dateStr}
            onClick={(e) => { e.stopPropagation(); if (!isFuture && !busy) onToggleDay(dateStr); }}
            disabled={isFuture || busy}
            aria-label={`${label} ${isDone ? "done" : "not done"}`}
            className={`flex flex-col items-center gap-0.5 flex-1 rounded-lg py-1.5 transition-all ${isFuture ? "opacity-30 cursor-default" : "cursor-pointer hover:opacity-80 active:scale-95"}`}
          >
            <span className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? L.accent : L.muted}`}>{label}</span>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
              isDone
                ? "bg-green-500 shadow-sm"
                : isToday
                  ? "border-2 border-violet-400"
                  : L.dark ? "border border-gray-600" : "border border-gray-300"
            }`}>
              {isDone && <Check className="w-3 h-3 text-white stroke-[3]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
