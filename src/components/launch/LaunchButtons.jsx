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
