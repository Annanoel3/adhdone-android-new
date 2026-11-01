import React from "react";
import { Check } from "lucide-react";
import { getLocalDateString } from "../utils/todayTasks";
import { fmtDay } from "./goalWeeks";

// A daily-practice step's days (ported from the Goals app's HabitWeekTracker).
// It shows the step's own week, by its real dates (goalWeeks.trackerDays),
// not this calendar week: Anna, Nov 1 2026, it rang Sunday Nov 1 as "today"
// on a week that runs Nov 2–8. Today is ringed only when it's inside that
// week; a week that hasn't started shows its dates, none tickable. A day is
// done when it was ticked here or an old repeating task for the habit was
// finished that day (doneDays has both; the goal page works that out).
// Future days can't be ticked.

export default function HabitWeekTracker({ tracker, doneDays, onToggleDay, busy, L }) {
  const today = getLocalDateString();
  const days = tracker?.days || [];
  if (days.length === 0) return null;
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const range = `${fmtDay(first)} – ${fmtDay(last)}`;
  return (
    <div className="px-3 pb-3 pt-1">
      <p className={`text-[10px] mb-1 ${L.muted}`}>
        {tracker.overdue ? `Last 7 days · ${range}` : first > today ? `Starts ${fmtDay(first)} · ${range}` : range}
      </p>
      <div className="flex items-center gap-1">
        {days.map(({ date, label, day }) => {
          const isDone = doneDays.has(date);
          const isToday = date === today;
          const isFuture = date > today;
          return (
            <button
              key={date}
              onClick={(e) => { e.stopPropagation(); if (!isFuture && !busy) onToggleDay(date); }}
              disabled={isFuture || busy}
              aria-label={`${fmtDay(date)} ${isDone ? "done" : "not done"}`}
              className={`flex flex-col items-center gap-0.5 flex-1 min-w-0 rounded-lg py-1.5 transition-all ${isFuture ? "opacity-30 cursor-default" : "cursor-pointer hover:opacity-80 active:scale-95"}`}
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
              <span className={`text-[9px] ${isToday ? L.accent : L.muted}`}>{day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
