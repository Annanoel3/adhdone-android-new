import React from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Week view as full-width day rows — narrow 7-column strips leave no room for
// titles on mobile, so each day gets its own readable card instead.
export default function WeekAgenda({
  weekDays,
  itemsByDate,
  dateKey,
  sameDayKey,
  today,
  selected,
  onSelectDay,
  emojiFor,
  useEmoji,
  isDark,
  onItemOpen,
  cellBase,
  textPrimary,
  textSecondary,
}) {
  return (
    <div className="space-y-2">
      {weekDays.map((day) => {
        const k = dateKey(day);
        const allItems = itemsByDate.get(k) || [];
        // Back-burner tasks collapse to red dots instead of full rows.
        const dayItems = allItems.filter((it) => !it.silenced);
        const backBurner = allItems.filter((it) => it.silenced);
        const isToday = sameDayKey(day, today);
        const isSelected = sameDayKey(day, selected);
        return (
          <div
            key={k}
            onClick={() => onSelectDay(day)}
            className={`rounded-xl border p-3 cursor-pointer transition-all ${
              isSelected ? 'ring-2 ring-blue-400 ' + cellBase : cellBase + ' hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 ${
                  isToday ? 'bg-blue-500 text-white' : isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {day.getDate()}
              </span>
              <span className={`text-sm font-semibold ${textPrimary}`}>{DAY_NAMES[day.getDay()]}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {dayItems.length > 0 && (
                  <span className={`text-[11px] ${textSecondary}`}>
                    {dayItems.length} item{dayItems.length !== 1 ? 's' : ''}
                  </span>
                )}
                {backBurner.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-700 inline-block" title="On the back burner" />
                )}
              </div>
            </div>

            {dayItems.length === 0 ? (
              <p className={`text-xs ${textSecondary}`}>Nothing scheduled.</p>
            ) : (
              <div className="space-y-1">
                {dayItems.map((it, i) => {
                  const clickable = !!(it.task || it.taskId);
                  return (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); if (clickable) onItemOpen?.(it); }}
                      disabled={!clickable}
                      className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                        it.overdue
                          ? isDark ? 'bg-red-900/40' : 'bg-red-50'
                          : clickable
                            ? isDark ? 'hover:bg-gray-700' : 'hover:bg-blue-50'
                            : 'cursor-default opacity-70'
                      }`}
                    >
                      {useEmoji && <span className="text-base flex-shrink-0">{emojiFor(it)}</span>}
                      <span
                        className={`text-sm flex-1 truncate ${
                          it.overdue ? (isDark ? 'text-red-300' : 'text-red-700') + ' font-medium' : textPrimary
                        }`}
                        title={it.title}
                      >
                        {it.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}