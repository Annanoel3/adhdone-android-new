import React from 'react';

const KIND_ACCENT = {
  birthday: 'bg-pink-400',
  imported_event: 'bg-indigo-400',
  imported_task: 'bg-blue-400',
  task: 'bg-emerald-400',
};

const KIND_LABEL = {
  birthday: 'Birthday',
  imported_event: 'Event',
  imported_task: 'Task',
  task: 'Task',
};

function formatTime(at) {
  if (!at) return null;
  const d = new Date(at);
  if (isNaN(d)) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
}

// One structured line in the week agenda: color stripe → time → title → type.
export default function WeekAgendaRow({ item, emojiFor, useEmoji, isDark, onItemOpen, textPrimary, textSecondary }) {
  const clickable = !!(item.task || item.taskId);
  const time = formatTime(item.at);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (clickable) onItemOpen?.(item); }}
      disabled={!clickable}
      className={`flex items-center gap-2 w-full text-left rounded-lg pr-2 py-2 overflow-hidden transition-colors ${
        item.overdue
          ? isDark ? 'bg-red-900/30' : 'bg-red-50'
          : clickable
            ? isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
            : 'cursor-default opacity-70'
      }`}
    >
      <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${item.overdue ? 'bg-red-500' : KIND_ACCENT[item.kind] || 'bg-gray-300'}`} />
      <span className={`text-[11px] tabular-nums w-12 flex-shrink-0 ${textSecondary}`}>
        {time || 'all day'}
      </span>
      {useEmoji && <span className="text-base flex-shrink-0">{emojiFor(item)}</span>}
      <span
        className={`text-sm flex-1 truncate ${
          item.overdue ? (isDark ? 'text-red-300' : 'text-red-700') + ' font-medium' : textPrimary
        }`}
        title={item.title}
      >
        {item.title}
      </span>
      <span className={`text-[10px] uppercase tracking-wide flex-shrink-0 ${textSecondary}`}>
        {item.overdue ? 'Overdue' : KIND_LABEL[item.kind]}
      </span>
    </button>
  );
}