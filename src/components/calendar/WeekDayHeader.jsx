import React from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Bold, tinted header strip for a day card so the eye can jump day → day.
export default function WeekDayHeader({ day, isToday, count, hasBackBurner, isDark }) {
  const tone = isToday
    ? 'bg-blue-500 text-white'
    : isDark
      ? 'bg-gray-700/70 text-gray-100'
      : 'bg-gray-100 text-gray-800';
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${tone}`}>
      <span className="text-2xl font-bold leading-none tabular-nums w-8 text-center">{day.getDate()}</span>
      <div className="leading-tight flex-1 min-w-0">
        <div className="text-sm font-semibold">{DAY_NAMES[day.getDay()]}</div>
        <div className="text-[11px] opacity-80">
          {isToday ? 'Today' : `${count} item${count !== 1 ? 's' : ''}`}
        </div>
      </div>
      {hasBackBurner && (
        <span className="w-2 h-2 rounded-full bg-amber-700 inline-block flex-shrink-0" title="On the back burner" />
      )}
    </div>
  );
}