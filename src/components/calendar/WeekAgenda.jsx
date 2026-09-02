import React from 'react';
import WeekAgendaRow from '@/components/calendar/WeekAgendaRow';
import WeekDayHeader from '@/components/calendar/WeekDayHeader';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Week view as a vertical stack of day cards. Each day gets a bold header
// strip; empty days collapse to a single quiet line so busy days stand out.
// Items are tapped directly — there's no separate "selected day" panel here.
export default function WeekAgenda({
  weekDays,
  itemsByDate,
  dateKey,
  sameDayKey,
  today,
  emojiFor,
  useEmoji,
  isDark,
  onItemOpen,
  cellBase,
  textPrimary,
  textSecondary,
}) {
  return (
    <div className="space-y-3">
      {weekDays.map((day) => {
        const k = dateKey(day);
        const allItems = itemsByDate.get(k) || [];
        const dayItems = allItems.filter((it) => !it.silenced);
        const backBurner = allItems.filter((it) => it.silenced);
        const isToday = sameDayKey(day, today);

        if (dayItems.length === 0) {
          return (
            <div
              key={k}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${cellBase} ${isToday ? 'border-blue-400' : 'opacity-70'}`}
            >
              <span className={`text-sm font-bold tabular-nums w-8 text-center ${isToday ? 'text-blue-500' : textPrimary}`}>
                {day.getDate()}
              </span>
              <span className={`text-sm font-semibold ${textPrimary}`}>{DAY_SHORT[day.getDay()]}</span>
              <span className={`text-xs ${textSecondary}`}>{isToday ? 'Today · nothing scheduled' : 'Nothing scheduled'}</span>
              {backBurner.length > 0 && (
                <span className="ml-auto w-2 h-2 rounded-full bg-amber-700 inline-block flex-shrink-0" title="On the back burner" />
              )}
            </div>
          );
        }

        return (
          <div
            key={k}
            className={`rounded-xl border overflow-hidden ${cellBase} ${isToday ? 'border-blue-400 shadow-sm' : ''}`}
          >
            <WeekDayHeader
              day={day}
              isToday={isToday}
              count={dayItems.length}
              hasBackBurner={backBurner.length > 0}
              isDark={isDark}
            />
            <div className={`px-2 divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}`}>
              {dayItems.map((it, i) => (
                <WeekAgendaRow
                  key={i}
                  item={it}
                  emojiFor={emojiFor}
                  useEmoji={useEmoji}
                  isDark={isDark}
                  onItemOpen={onItemOpen}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}