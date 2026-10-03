import React from 'react';
import { Button } from '@/components/ui/button';
import { Timer } from 'lucide-react';
import { useLaunch } from '@/context/LaunchContext';

// The task's timer: one button. Tap it and a stopwatch starts counting up on
// this task — for finding out how long the dishes really take — with "I
// finished the task" and "Stop" on screen the whole time, and the time spent
// logged either way. It used to offer 5 / 10 / 15 / 25 / 45 minutes and
// "Other"; nobody timing a chore wants to pick a length first.
//
// (The file keeps its old name so everything that shows it keeps working.)
// The collapsed card's one-tap timer (Anna, Oct 3 2026): only on tasks the
// parser judged worth timing (takes_time — the dishes, laundry, not a text),
// so the chore can be timed without opening the card. Hidden while another
// timer runs, and on done, cancelled, parked or event rows.
export function TimeItButton({ task, theme }) {
  const { startStopwatch, hasActiveLaunch } = useLaunch();
  if (!task?.takes_time || task.status !== 'active' || task.silenced || hasActiveLaunch) return null;
  if (task.classification === 'event' || task.birthday_person) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); startStopwatch(task); }}
      className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
        dark
          ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/60'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      }`}
      aria-label="Time this task"
      title="Start a stopwatch on this task"
    >
      <Timer className="w-3 h-3" />
      Time it
    </button>
  );
}

export default function LaunchButtons({ task, theme, onStarted }) {
  const { startStopwatch, hasActiveLaunch } = useLaunch();
  if (!task || task.status === 'completed') return null;

  const dark = theme === 'dark';

  if (hasActiveLaunch) {
    return (
      <p className={`text-xs flex items-center gap-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <Timer className="w-3.5 h-3.5" /> A timer is already running.
      </p>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={`h-9 px-4 text-sm ${
        dark
          ? 'bg-gray-700 text-emerald-300 border-gray-600 hover:bg-gray-600'
          : 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
      }`}
      onClick={() => { startStopwatch(task); onStarted?.(); }}
    >
      <Timer className="w-4 h-4 mr-1.5" />
      Start timer
    </Button>
  );
}
