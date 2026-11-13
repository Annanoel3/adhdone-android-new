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
// `steps`: the task's steps when the card has them. With an open step the
// timer goes on that step, not the whole task (LaunchContext.startStopwatch).
export function TimeItButton({ task, theme, steps }) {
  const { startStopwatch, hasActiveLaunch } = useLaunch();
  if (!task?.takes_time || task.status !== 'active' || task.silenced || hasActiveLaunch) return null;
  if (task.classification === 'event' || task.birthday_person) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); startStopwatch(task, { steps }); }}
      className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
        dark
          ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/60'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      }`}
      aria-label="Time this task"
      title="Start a stopwatch on this task"
    >
      <Timer className="w-3 h-3" />
      <span className="max-[420px]:hidden">Time it</span>
    </button>
  );
}

// A step's own timer (Anna, Nov 13 2026: "Is there a way to time each step
// instead of the whole task when there's subtasks?"). The same stopwatch, on
// the step: "I finished this step" ticks that step alone and the task stays
// open. Shown where the task's own timer is: on the card for a task the
// parser judged worth timing (takes_time), in Task Details also for one it
// never judged (`unjudged`). Not on a done step, one still being saved, or
// while another timer runs.
export function StepTimeButton({ step, parent, theme, unjudged = false }) {
  const { startStopwatch, hasActiveLaunch } = useLaunch();
  if (!step?.id || String(step.id).startsWith('temp_') || step.status !== 'active' || hasActiveLaunch) return null;
  if (!parent || parent.status !== 'active' || parent.silenced) return null;
  if (parent.classification === 'event' || parent.birthday_person) return null;
  if (unjudged ? parent.takes_time === false : !parent.takes_time) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); startStopwatch(step, { parent }); }}
      className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded border transition-colors ${
        dark
          ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/60'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      }`}
      aria-label="Time this step"
      title="Start a stopwatch on this step"
    >
      <Timer className="w-3.5 h-3.5" />
    </button>
  );
}

// `steps`: the task's steps when the caller has them (see TimeItButton).
export default function LaunchButtons({ task, theme, onStarted, steps }) {
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
      onClick={() => { startStopwatch(task, { steps }); onStarted?.(); }}
    >
      <Timer className="w-4 h-4 mr-1.5" />
      Start timer
    </Button>
  );
}
