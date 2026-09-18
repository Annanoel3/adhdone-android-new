import React from 'react';
import { base44 } from '@/api/base44Client';

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