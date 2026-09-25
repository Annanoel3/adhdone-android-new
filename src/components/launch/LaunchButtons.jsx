import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Timer } from 'lucide-react';
import { useLaunch } from '@/context/LaunchContext';

// The task timer: pick how long, and it starts right away. The countdown stays
// on screen (SprintPopup) with "I finished the task" and "Stop working" the
// whole time; when it's up it rings like an alarm and offers "Keep going"
// (Focus Mode on this task) or the same two. Replaced the old Launchpad and
// 5-min Sprint buttons.
//
// (The file keeps its old name so everything that shows it keeps working: the
// task's details, the Home "Timer" picker.)
export const TIMER_MINUTES = [5, 10, 15, 25, 45];
const MAX_MINUTES = 180;

export default function LaunchButtons({ task, theme, onStarted }) {
  const { startTimer, hasActiveLaunch } = useLaunch();
  const [custom, setCustom] = useState(false);
  const [minutes, setMinutes] = useState('');
  if (!task || task.status === 'completed') return null;

  const dark = theme === 'dark';
  const start = (m) => {
    const n = Math.round(Number(m));
    if (!Number.isFinite(n) || n < 1 || n > MAX_MINUTES) return;
    startTimer(task, n);
    setCustom(false);
    setMinutes('');
    onStarted?.();
  };

  const chip = `h-8 px-3 text-sm ${
    dark
      ? 'bg-gray-700 text-emerald-300 border-gray-600 hover:bg-gray-600'
      : 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
  }`;

  if (hasActiveLaunch) {
    return (
      <p className={`text-xs flex items-center gap-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <Timer className="w-3.5 h-3.5" /> A timer is already running.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {TIMER_MINUTES.map((m) => (
          <Button key={m} size="sm" variant="outline" className={chip} onClick={() => start(m)}>
            {m} min
          </Button>
        ))}
        <Button size="sm" variant="outline" className={chip} onClick={() => setCustom((v) => !v)}>
          Other
        </Button>
      </div>
      {custom && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); start(minutes); }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MINUTES}
            autoFocus
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Minutes"
            className={`w-24 h-8 rounded-md border px-2 text-sm ${
              dark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
            }`}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!(Number(minutes) >= 1 && Number(minutes) <= MAX_MINUTES)}
          >
            <Timer className="w-4 h-4 mr-1" /> Start
          </Button>
        </form>
      )}
    </div>
  );
}
