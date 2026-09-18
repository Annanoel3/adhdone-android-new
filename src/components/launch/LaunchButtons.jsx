import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket, Timer, Info } from 'lucide-react';
import { useLaunch } from '@/context/LaunchContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import FirstUseDialog, { firstUseSeen, markFirstUseSeen } from '@/components/onboarding/FirstUseDialog';

// Each of the two is explained the FIRST time it's tapped, not before — the
// explanation lands when the user is actually curious, and the button still
// does what they pressed it for straight after.
const FIRST_USE = {
  launchpad: {
    flag: 'firstuse_launchpad_done',
    title: 'Launchpad 🚀',
    body: "A gentle 5-minute countdown that eases you toward starting. When it hits zero you lift off into Focus Mode on this task — for when \"just start\" feels impossible.",
    confirmLabel: "Start the countdown",
  },
  sprint: {
    flag: 'firstuse_sprint_done',
    title: '5-min Sprint ⏱️',
    body: "A 5-minute timer starting right now — no ramp-up, just a short, low-pressure burst of doing the thing. Great for \"I'll do 5 minutes and see what happens.\"",
    confirmLabel: "Start my 5 minutes",
  },
};

export default function LaunchButtons({ task, theme, onStarted }) {
  const { startLaunchpad, startSprint, hasActiveLaunch } = useLaunch();
  const [pending, setPending] = useState(null);
  if (!task || task.status === 'completed') return null;

  const run = (kind) => {
    if (kind === 'launchpad') startLaunchpad(task);
    else startSprint(task);
    onStarted?.();
  };

  // First tap ever → explain, then run it when they tap through.
  const handlePress = (kind) => {
    if (!firstUseSeen(FIRST_USE[kind].flag)) {
      setPending(kind);
      return;
    }
    run(kind);
  };

  const confirmFirstUse = () => {
    const kind = pending;
    setPending(null);
    if (!kind) return;
    markFirstUseSeen(FIRST_USE[kind].flag);
    run(kind);
  };

  const infoBtnClass = `flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
    theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
  }`;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          onClick={() => handlePress('launchpad')}
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
        <Popover>
          <PopoverTrigger asChild>
            <button className={infoBtnClass} aria-label="What is Launchpad?">
              <Info className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className={`w-60 p-3 text-xs ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200' : 'text-gray-600'}`}>
            <p className={`font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Launchpad</p>
            <p>A gentle 5-minute countdown that eases you toward starting. When it hits zero, you lift off into Focus Mode on this task — perfect when "just start" feels impossible.</p>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handlePress('sprint')}
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
        <Popover>
          <PopoverTrigger asChild>
            <button className={infoBtnClass} aria-label="What is a 5-min Sprint?">
              <Info className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className={`w-60 p-3 text-xs ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200' : 'text-gray-600'}`}>
            <p className={`font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>5-min Sprint</p>
            <p>Starts a 5-minute timer right now — no ramp-up, just a quick, low-pressure burst of doing the task. Great for "I'll just do 5 minutes and see what happens."</p>
          </PopoverContent>
        </Popover>
      </div>

      <FirstUseDialog
        open={!!pending}
        onConfirm={confirmFirstUse}
        title={pending ? FIRST_USE[pending].title : ''}
        body={pending ? FIRST_USE[pending].body : ''}
        confirmLabel={pending ? FIRST_USE[pending].confirmLabel : 'Got it'}
        theme={theme}
      />
    </div>
  );
}