import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { keywordEmojiForTitle, resolveEmojiWithAI, getCachedAiEmoji } from '@/components/utils/calendarEmojiResolver';
import WeekAgenda from '@/components/calendar/WeekAgenda';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Emoji per item kind — the "label" lives on the calendar itself.
const KIND_EMOJI = {
  birthday: '🎂',
  imported_event: '📆',
  imported_task: '✅',
  task: '✅',
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

// Distinct color palette for multi-day span bars so overlapping spans are
// visually distinguishable. Each multi-day item gets a stable color picked
// from its id (so the same trip is always the same color across days).
const SPAN_PALETTE = [
  { bar: 'bg-pink-300', pill: 'bg-pink-100', text: 'text-pink-700' },
  { bar: 'bg-indigo-300', pill: 'bg-indigo-100', text: 'text-indigo-700' },
  { bar: 'bg-blue-300', pill: 'bg-blue-100', text: 'text-blue-700' },
  { bar: 'bg-amber-300', pill: 'bg-amber-100', text: 'text-amber-700' },
  { bar: 'bg-green-300', pill: 'bg-green-100', text: 'text-green-700' },
  { bar: 'bg-purple-300', pill: 'bg-purple-100', text: 'text-purple-700' },
  { bar: 'bg-teal-300', pill: 'bg-teal-100', text: 'text-teal-700' },
  { bar: 'bg-orange-300', pill: 'bg-orange-100', text: 'text-orange-700' },
  { bar: 'bg-rose-300', pill: 'bg-rose-100', text: 'text-rose-700' },
  { bar: 'bg-cyan-300', pill: 'bg-cyan-100', text: 'text-cyan-700' },
];
function colorForSpanId(id) {
  const key = String(id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SPAN_PALETTE[h % SPAN_PALETTE.length];
}

function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDayKey(a, b) {
  return dateKey(a) === dateKey(b);
}

export default function CalendarGrid({ tasks = [], events = [], isDark, onItemOpen }) {
  // Always open on today — browsing into the past/future never sticks between
  // app opens.
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());
  const [useEmoji, setUseEmoji] = useState(() => {
    const stored = localStorage.getItem('calendar_use_emoji');
    return stored === null ? true : stored === 'true';
  });
  const toggleEmojiMode = (val) => {
    setUseEmoji(val);
    localStorage.setItem('calendar_use_emoji', String(val));
  };
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('calendar_view_mode') || 'month');
  const [weekCursor, setWeekCursor] = useState(() => new Date());
  const setView = (mode) => {
    setViewMode(mode);
    localStorage.setItem('calendar_view_mode', mode);
  };

  // Group all items by local-date key.
  const itemsByDate = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const map = new Map();
    const push = (d, item) => {
      if (!d || isNaN(d)) return;
      const k = dateKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    };

    // Map a user-set classification to a grid "kind".
    const kindFromClassification = (c) =>
      c === 'event' ? 'imported_event'
        : c === 'birthday' ? 'birthday'
        : c === 'task' ? 'task'
        : null;

    tasks.forEach((t) => {
      const kind = kindFromClassification(t.classification) ||
        (t.birthday_person ? 'birthday' : 'task');
      // Multi-day span: show the task on each day from its start through its end.
      //  - start_date + due_date: "in progress" interval task (start_date → due_date)
      //  - due_date + end_date (no start_date): one-time multi-day event (due_date → end_date)
      //  - next_reminder + end_date (no due_date): one-time event with an end span
      const spanStart = t.start_date || t.due_date || t.next_reminder;
      const spanEnd = t.end_date || (t.start_date ? t.due_date : null);
      if (spanStart && spanEnd) {
        const startD = new Date(spanStart);
        const endD = new Date(spanEnd);
        if (startD.toDateString() === endD.toDateString()) {
          push(startD, { kind, silenced: !!t.silenced, at: t.event_time || null, title: t.title, id: t.id, taskId: t.id, task: t });
        } else {
          const dayCursor = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
          const last = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
          let isFirst = true;
          while (dayCursor <= last) {
            const isLast = dayCursor.toDateString() === last.toDateString();
            push(new Date(dayCursor), {
              kind, silenced: !!t.silenced, at: t.event_time || null, title: t.title, id: t.id, taskId: t.id, task: t,
              spanPos: isLast ? 'end' : isFirst ? 'start' : 'middle',
            });
            isFirst = false;
            dayCursor.setDate(dayCursor.getDate() + 1);
          }
        }
        return;
      }
      const raw = t.due_date || t.next_reminder;
      if (!raw) return;
      const dueD = new Date(raw);
      // Overdue: an active (not completed) task whose due date has already
      // passed. Show it on every day from the due date through today so it
      // stays visible (and red) until the user completes it — not just on
      // the original due date.
      if (t.status !== 'completed') {
        const now = new Date();
        const dueDay = new Date(dueD.getFullYear(), dueD.getMonth(), dueD.getDate());
        const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (dueDay.getTime() < todayDay.getTime()) {
          const dayCursor = new Date(dueDay);
          while (dayCursor <= todayDay) {
            push(new Date(dayCursor), {
              kind, silenced: !!t.silenced, at: t.event_time || null, title: t.title, id: t.id, taskId: t.id, task: t,
              overdue: true,
            });
            dayCursor.setDate(dayCursor.getDate() + 1);
          }
          return;
        }
      }
      push(new Date(raw), { kind, silenced: !!t.silenced, at: t.event_time || null, title: t.title, id: t.id, taskId: t.id, task: t });
    });
    events.forEach((e) => {
      if (!e.start_time) return;
      const linkedTask = e.adhd_task_id ? taskById.get(e.adhd_task_id) : null;
      const kind = (linkedTask && kindFromClassification(linkedTask.classification)) ||
        (e.routed_as === 'birthday' ? 'birthday'
          : e.item_type === 'task' ? 'imported_task'
          : 'imported_event');
      const item = {
        kind, title: e.title, id: e.id,
        at: e.is_all_day ? null : e.start_time,
        taskId: e.adhd_task_id || null,
        task: linkedTask || null,
      };
      const startD = new Date(e.start_time);
      // No end time → single-day event, place once on the start date.
      if (!e.end_time) { push(startD, item); return; }
      const endD = new Date(e.end_time);
      // Same start/end day → single-day event.
      if (startD.toDateString() === endD.toDateString()) { push(startD, item); return; }
      // Multi-day: appear on each day from start through end. For all-day
      // events Google's end date is exclusive, so stop one day earlier.
      const lastDay = new Date(endD);
      if (e.is_all_day) lastDay.setDate(lastDay.getDate() - 1);
      const dayCursor = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
      const last = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
      let isFirst = true;
      while (dayCursor <= last) {
        const isLast = dayCursor.toDateString() === last.toDateString();
        push(new Date(dayCursor), {
          ...item,
          spanPos: isLast ? 'end' : isFirst ? 'start' : 'middle',
        });
        isFirst = false;
        dayCursor.setDate(dayCursor.getDate() + 1);
      }
    });
    return map;
  }, [tasks, events]);

  const [aiEmojis, setAiEmojis] = useState({});

  // Resolve context-aware emojis via AI for titles that don't match the
  // keyword list (e.g. brand names like "Honda" → 🚗, "CycleGear" → 🏍).
  useEffect(() => {
    const titlesNeedingResolution = new Set();
    itemsByDate.forEach((items) => {
      items.forEach((it) => {
        if (!keywordEmojiForTitle(it.title) && !getCachedAiEmoji(it.title)) {
          titlesNeedingResolution.add(it.title);
        }
      });
    });
    if (titlesNeedingResolution.size === 0) return;
    let cancelled = false;
    titlesNeedingResolution.forEach((title) => {
      resolveEmojiWithAI(title).then((emoji) => {
        if (cancelled || !emoji) return;
        setAiEmojis((prev) => (prev[title] ? prev : { ...prev, [title]: emoji }));
      });
    });
    return () => { cancelled = true; };
  }, [itemsByDate]);

  const emojiFor = (it) =>
    keywordEmojiForTitle(it.title)
    || aiEmojis[it.title]
    || getCachedAiEmoji(it.title)
    || KIND_EMOJI[it.kind];

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  // Week view: 7 days starting Sunday of the weekCursor's week.
  const weekStart = useMemo(() => {
    const d = new Date(weekCursor);
    const dow = d.getDay();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  }, [weekCursor]);
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);
  const weekHeaderLabel = useMemo(() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${MONTH_NAMES[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
  }, [weekDays]);

  const today = new Date();
  const selectedItems = itemsByDate.get(dateKey(selected)) || [];

  const cellBase = isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-white border-gray-100';
  const cellMuted = isDark ? 'bg-gray-900/40' : 'bg-gray-50/60';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* Month/Week navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className={`text-lg font-bold ${textPrimary}`}>
          {viewMode === 'month' ? `${MONTH_NAMES[month]} ${year}` : weekHeaderLabel}
        </h2>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className={`flex items-center rounded-lg border overflow-hidden flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <button
              onClick={() => setView('month')}
              className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${viewMode === 'month' ? 'bg-blue-500 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${viewMode === 'week' ? 'bg-blue-500 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Week
            </button>
          </div>
          <div className={`flex items-center rounded-lg border overflow-hidden flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <button
              onClick={() => toggleEmojiMode(true)}
              className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${useEmoji ? 'bg-blue-500 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              😀 Emoji
            </button>
            <button
              onClick={() => toggleEmojiMode(false)}
              className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${!useEmoji ? 'bg-blue-500 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Aa Text
            </button>
          </div>
          <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => viewMode === 'month' ? setCursor(new Date(year, month - 1, 1)) : setWeekCursor(new Date(weekCursor.getFullYear(), weekCursor.getMonth(), weekCursor.getDate() - 7))}
              className={`h-8 w-8 ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const n = new Date();
                setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
                setWeekCursor(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
                setSelected(n);
              }}
              className={`h-8 px-3 text-xs font-semibold ${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700 bg-transparent' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => viewMode === 'month' ? setCursor(new Date(year, month + 1, 1)) : setWeekCursor(new Date(weekCursor.getFullYear(), weekCursor.getMonth(), weekCursor.getDate() + 7))}
              className={`h-8 w-8 ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Day-of-week header (month grid only) */}
      {viewMode === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className={`text-center text-xs font-semibold py-1 ${textSecondary}`}>
              {d}
            </div>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      {viewMode === 'week' ? (
        <WeekAgenda
          weekDays={weekDays}
          itemsByDate={itemsByDate}
          dateKey={dateKey}
          sameDayKey={sameDayKey}
          today={today}
          selected={selected}
          onSelectDay={setSelected}
          emojiFor={emojiFor}
          useEmoji={useEmoji}
          isDark={isDark}
          onItemOpen={onItemOpen}
          cellBase={cellBase}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      ) : (
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`b-${idx}`} className={`min-h-[58px] rounded-lg border ${cellMuted}`} />;
          const k = dateKey(cell);
          const dayItems = itemsByDate.get(k) || [];
          const isToday = sameDayKey(cell, today);
          const isSelected = sameDayKey(cell, selected);

          // Back-burner (silenced) tasks collapse to small red dots so they
          // don't eat the cell space that active items need.
          const backBurnerItems = dayItems.filter((it) => it.silenced);
          const liveItems = dayItems.filter((it) => !it.silenced);
          // Separate multi-day span bars from regular items for cleaner rendering.
          const spanItems = liveItems.filter((it) => it.spanPos);
          const regularItems = liveItems.filter((it) => !it.spanPos);
          const regularShown = regularItems.slice(0, 3);
          const spanShown = spanItems.slice(0, 3);
          const totalOverflow = liveItems.length - spanShown.length - regularShown.length;
          const hasOverdue = liveItems.some((it) => it.overdue);

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
                <div className="mt-1 leading-none space-y-0.5">
                  {/* Multi-day span bars: start = pill with label, middle = thin stripe, end = pill */}
                  {spanItems.length > 0 && (
                    <div className="space-y-0.5">
                      {spanShown.map((it, i) => {
                        const colors = colorForSpanId(it.id || it.title);
                        if (it.spanPos === 'middle') {
                          return (
                            <div
                              key={`span-${i}`}
                              className={`h-1 rounded-full ${colors.bar} -mx-1`}
                              title={it.title}
                            />
                          );
                        }
                        const isStart = it.spanPos === 'start';
                        return (
                          <div
                            key={`span-${i}`}
                            className={`flex items-center gap-0.5 text-[10px] truncate ${colors.pill} ${colors.text} ${
                              isStart ? 'rounded-l-full pl-1 -mr-1' : 'rounded-r-full pr-1 -ml-1'
                            }`}
                            title={it.title}
                          >
                            {useEmoji ? (
                              <span className="text-xs flex-shrink-0">{emojiFor(it)}</span>
                            ) : (
                              <span className="truncate flex-1">{it.title}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Regular (non-span) items */}
                  {regularShown.length > 0 && (
                    useEmoji ? (
                      <div className="flex flex-wrap gap-0.5">
                        {regularShown.map((it, i) => (
                          <span key={i} className={`text-sm rounded ${it.overdue ? 'bg-red-100 px-0.5' : ''}`}>{emojiFor(it)}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {regularShown.map((it, i) => (
                          <div key={i} className={`text-[10px] truncate rounded px-1 ${it.overdue ? 'bg-red-100 text-red-700 font-medium' : textSecondary}`} title={it.title}>
                            {it.title}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {totalOverflow > 0 && (
                    <div className={`text-[10px] ${textSecondary}`}>
                      {useEmoji ? `+${totalOverflow}` : `+${totalOverflow} more`}
                    </div>
                  )}
                  {(hasOverdue || backBurnerItems.length > 0) && (
                    <div className="flex items-center gap-1">
                      {hasOverdue && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" title="Something overdue" />
                      )}
                      {backBurnerItems.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-700 inline-block" title="On the back burner" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* Legend */}
      <div className={`flex flex-wrap items-center gap-3 text-xs ${textSecondary}`}>
        <span className="flex items-center gap-1"><span>🎂</span> Birthday</span>
        <span className="flex items-center gap-1"><span>📆</span> Event</span>
        <span className="flex items-center gap-1"><span>✅</span> Task</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Overdue</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-700 inline-block" /> Back burner</span>
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
            {selectedItems.map((it, i) => {
              const clickable = !!(it.task || it.taskId);
              return (
                <li key={i}>
                  <button
                    onClick={() => clickable && onItemOpen?.(it)}
                    disabled={!clickable}
                    className={`flex items-center gap-2 w-full text-left rounded-lg p-2 transition-colors ${
                      clickable
                        ? isDark ? 'hover:bg-gray-700 cursor-pointer' : 'hover:bg-blue-50 cursor-pointer'
                        : 'cursor-default opacity-70'
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{emojiFor(it)}</span>
                    <span className={`text-sm flex-1 truncate ${it.overdue ? (isDark ? 'text-red-300' : 'text-red-600') + ' font-medium' : textPrimary}`}>{it.title}</span>
                    {it.overdue ? (
                      <Badge className="text-xs border flex-shrink-0 bg-red-100 text-red-700 border-red-200">Overdue</Badge>
                    ) : (
                      <Badge className={`text-xs border flex-shrink-0 ${KIND_BADGE[it.kind]}`}>{KIND_LABEL[it.kind]}</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}