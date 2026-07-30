import React from 'react';
import { Button } from '@/components/ui/button';
import { Rocket, Timer } from 'lucide-react';
import { useLaunch } from '@/context/LaunchContext';

export default function LaunchButtons({ task, theme }) {
  const { startLaunchpad, startSprint, hasActiveLaunch } = useLaunch();
  if (!task || task.status === 'completed') return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => startLaunchpad(task)}
        disabled={hasActiveLaunch}
        className={`gap-1.5 ${
          theme === 'dark'
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
            : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white'
        }`}
      >
        <Rocket className="w-4 h-4" />
        Launch in 5 mins
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => startSprint(task)}
        disabled={hasActiveLaunch}
        className={`gap-1.5 ${
          theme === 'dark'
            ? 'bg-gray-700 text-emerald-300 border-gray-600 hover:bg-gray-600'
            : 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
        }`}
      >
        <Timer className="w-4 h-4" />
        5-min Sprint
      </Button>
    </div>
  );
}