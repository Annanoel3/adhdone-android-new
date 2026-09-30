import React from 'react';
import { base44 } from '@/api/base44Client';

// ── Custom tags ──────────────────────────────────────────────────────────────────
// One free-text tag per task, typed by the user on the card. The same words
// always get the same colour on every card without anyone picking one: the
// colour comes from the tag's letters, with case and spacing ignored, so
// "Mom", "mom" and "MOM " all match.

export const TAG_MAX = 24;

export const normalizeTag = (t) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, TAG_MAX);

const TAG_PALETTE = [
  { light: 'bg-rose-100 text-rose-800 border-rose-200', dark: 'bg-rose-900/40 text-rose-200 border-rose-800' },
  { light: 'bg-orange-100 text-orange-800 border-orange-200', dark: 'bg-orange-900/40 text-orange-200 border-orange-800' },
  { light: 'bg-amber-100 text-amber-800 border-amber-200', dark: 'bg-amber-900/40 text-amber-200 border-amber-800' },
  { light: 'bg-lime-100 text-lime-800 border-lime-200', dark: 'bg-lime-900/40 text-lime-200 border-lime-800' },
  { light: 'bg-emerald-100 text-emerald-800 border-emerald-200', dark: 'bg-emerald-900/40 text-emerald-200 border-emerald-800' },
  { light: 'bg-teal-100 text-teal-800 border-teal-200', dark: 'bg-teal-900/40 text-teal-200 border-teal-800' },
  { light: 'bg-sky-100 text-sky-800 border-sky-200', dark: 'bg-sky-900/40 text-sky-200 border-sky-800' },
  { light: 'bg-indigo-100 text-indigo-800 border-indigo-200', dark: 'bg-indigo-900/40 text-indigo-200 border-indigo-800' },
  { light: 'bg-violet-100 text-violet-800 border-violet-200', dark: 'bg-violet-900/40 text-violet-200 border-violet-800' },
  { light: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200', dark: 'bg-fuchsia-900/40 text-fuchsia-200 border-fuchsia-800' },
  { light: 'bg-pink-100 text-pink-800 border-pink-200', dark: 'bg-pink-900/40 text-pink-200 border-pink-800' },
  { light: 'bg-cyan-100 text-cyan-800 border-cyan-200', dark: 'bg-cyan-900/40 text-cyan-200 border-cyan-800' },
];

export function tagPillClass(tag, theme) {
  const key = normalizeTag(tag).toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const c = TAG_PALETTE[h % TAG_PALETTE.length];
  return theme === 'dark' ? c.dark : c.light;
}

// Work / Personal tag on a task card. The parser guesses it at creation; this
// is the one-tap override when it guesses wrong. Unset reads as personal.
export default function LifeAreaPill({ task, theme, onUpdateTask }) {
  const isWork = task.life_area === 'work';

  const toggle = (e) => {
    e.stopPropagation();
    const next = isWork ? 'personal' : 'work';
    if (onUpdateTask) onUpdateTask({ ...task, life_area: next });
    base44.entities.Task.update(task.id, { life_area: next }).catch((error) => {
      console.error('Error updating life area:', error);
    });
  };

  return (
    <button
      onClick={toggle}
      title={isWork ? 'Marked as work — tap to make it personal' : 'Marked as personal — tap to make it work'}
      className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
        theme === 'dark'
          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {isWork ? '💼 Work' : '🏠 Personal'}
    </button>
  );
}