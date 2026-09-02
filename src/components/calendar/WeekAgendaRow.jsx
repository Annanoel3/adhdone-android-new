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

// One item in a week day card: color stripe → time column → title with a
// small type label underneath. Two columns only, so titles get room on phones.
export default function WeekAgendaRow({ item, emojiFor, useEmoji, isDark, onItemOpen, textPrimary, textSecondary }) {
  const clickable = !!(item.task || item.taskId);
  const time = formatTime(item.at);
  const label = item.overdue ? 'Overdue' : KIND_LABEL[item.kind] || '';
  return (
    <button
      onClick={() => clickable && onItemOpen?.(item)}
      disabled={!clickable}
      className={`flex items-stretch gap-2.5 w-full text-left rounded-lg pr-2 py-2.5 transition-colors ${
        item.overdue
          ? isDark ? 'bg-red-900/30' : 'bg-red-50'
          : clickable
            ? isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
            : 'cursor-default opacity-70'
      }`}
    >
      <span className={`w-1 rounded-full flex-shrink-0 ${item.overdue ? 'bg-red-500' : KIND_ACCENT[item.kind] || 'bg-gray-300'}`} />
      <span className={`text-xs tabular-nums w-14 flex-shrink-0 pt-0.5 ${time ? textPrimary + ' font-medium' : textSecondary}`}>
        {time || 'All day'}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug line-clamp-2 break-words ${
          item.overdue ? (isDark ? 'text-red-300' : 'text-red-700') + ' font-medium' : textPrimary
        }`}>
          {useEmoji && <span className="mr-1">{emojiFor(item)}</span>}
          {item.title}
        </div>
        <div className={`text-[10px] uppercase tracking-wide mt-0.5 ${item.overdue ? 'text-red-500' : textSecondary}`}>
          {label}
        </div>
      </div>
    </button>
  );
}