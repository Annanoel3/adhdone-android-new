import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Emoji per item kind — the "label" lives on the calendar itself.
const KIND_EMOJI = {
  birthday: '🎂',
  imported_event: '📅',
  imported_task: '✅',
  task: '📌',
};

const KIND_BADGE = {
  birthday: 'bg-pink-100 text-pink-700 border-pink-200',
  imported_event: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  imported_task: 'bg-blue-100 text-blue-700 border-blue-200',
  task: 'bg-amber-100 text-amber-700 border-amber-200',
};

const KIND_LABEL = {
  birthday: 'Birthday',
  imported_event: 'Event',
  imported_task: 'Task',
  task: 'Task',
};

function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDayKey(a, b) {
  return dateKey(a) === dateKey(b);
}

export default function CalendarGrid({ tasks = [], events = [], isDark }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());

  // Group all items by local-date key.
  const itemsByDate = useMemo(() => {
    const map = new Map();
    const push = (d, item) => {
      if (!d || isNaN(d)) return;
      const k = dateKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    };

    tasks.forEach((t) => {
      const raw = t.due_date || t.next_reminder;
      if (!raw) return;
      const kind = t.birthday_person ? 'birthday' : 'task';
      push(new Date(raw), { kind, title: t.title, id: t.id });
    });
    events.forEach((e) => {
      if (!e.start_time) return;
      const kind =
        e.routed_as === 'birthday' ? 'birthday'
          : e.item_type === 'task' ? 'imported_task'
          : 'imported_event';
      push(new Date(e.start_time), { kind, title: e.title, id: e.id });
    });
    return map;
  }, [tasks, events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const selectedItems = itemsByDate.get(dateKey(selected)) || [];

  const cellBase = isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-white border-gray-100';
  const cellMuted = isDark ? 'bg-gray-900/40' : 'bg-gray-50/60';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-bold ${textPrimary}`}>
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className={isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const n = new Date();
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelected(n);
            }}
            className={isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className={isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className={`text-center text-xs font-semibold py-1 ${textSecondary}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`b-${idx}`} className={`min-h-[58px] rounded-lg border ${cellMuted}`} />;
          const k = dateKey(cell);
          const dayItems = itemsByDate.get(k) || [];
          const isToday = sameDayKey(cell, today);
          const isSelected = sameDayKey(cell, selected);

          // Collapse to unique kind emojis (max 3) + overflow count.
          const kinds = [];
          dayItems.forEach((it) => { if (!kinds.includes(it.kind)) kinds.push(it.kind); });
          const shown = kinds.slice(0, 3);
          const overflow = dayItems.length - shown.length;

          return (
            <button
              key={k}
              onClick={() => setSelected(cell)}
              className={`min-h-[58px] rounded-lg border p-1 text-left transition-all ${
                isSelected
                  ? 'ring-2 ring-blue-400 ' + cellBase
                  : cellBase + ' hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-500 text-white' : textSecondary
                  }`}
                >
                  {cell.getDate()}
                </span>
                {dayItems.length > 0 && (
                  <span className={`text-[10px] ${textSecondary}`}>{dayItems.length}</span>
                )}
              </div>
              {dayItems.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 leading-none">
                  {shown.map((kd, i) => (
                    <span key={i} className="text-sm">{KIND_EMOJI[kd]}</span>
                  ))}
                  {overflow > 0 && (
                    <span className={`text-[10px] ${textSecondary} self-end`}>+{overflow}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className={`flex flex-wrap items-center gap-3 text-xs ${textSecondary}`}>
        <span className="flex items-center gap-1"><span>🎂</span> Birthday</span>
        <span className="flex items-center gap-1"><span>📅</span> Imported event</span>
        <span className="flex items-center gap-1"><span>✅</span> Imported task</span>
        <span className="flex items-center gap-1"><span>📌</span> In-app task</span>
      </div>

      {/* Selected day detail */}
      <div className={`rounded-xl border p-4 ${cellBase}`}>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          <h3 className={`font-semibold ${textPrimary}`}>
            {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          <Badge variant="outline" className={`ml-auto text-xs ${isDark ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-500'}`}>
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        {selectedItems.length === 0 ? (
          <p className={`text-sm ${textSecondary}`}>Nothing scheduled this day.</p>
        ) : (
          <ul className="space-y-2">
            {selectedItems.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-base">{KIND_EMOJI[it.kind]}</span>
                <span className={`text-sm flex-1 truncate ${textPrimary}`}>{it.title}</span>
                <Badge className={`text-xs border ${KIND_BADGE[it.kind]}`}>{KIND_LABEL[it.kind]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}