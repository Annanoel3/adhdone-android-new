import React, { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DemoNotification from "@/components/demo/DemoNotification";

const SCRIPT = [
  {
    when: "Wed 8:30 PM",
    title: "Dentist tomorrow at 9am 🦷",
    body: "Just so tomorrow morning isn't a surprise.",
    why: "Night-before heads up",
  },
  {
    when: "Thu 8:05 AM",
    title: "Time to head out 🚗",
    body: "It's 14 minutes away — leave in about 20.",
    why: "Real drive time, not a guess",
  },
  {
    when: "Sat 6:00 PM",
    title: "Mom's birthday is tomorrow 🎂",
    body: "Your text is already written — just hit send.",
    why: "Shows up with the work done",
  },
  {
    when: "Sun 2:15 PM",
    title: "One thing: fold the laundry 🧺",
    body: "Not the whole list. Just this one.",
    why: "One nudge, never a pile-up",
  },
];

export default function NotificationDemo() {
  const [visible, setVisible] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setVisible(0);
    const timers = SCRIPT.map((_, i) =>
      setTimeout(() => setVisible(i + 1), 1000 + i * 1800)
    );
    return () => timers.forEach(clearTimeout);
  }, [runId]);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#FDF6EC] flex flex-col items-center px-5 py-5">
      <div className="pointer-events-none fixed -top-28 -left-20 w-80 h-80 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-20 -right-20 w-80 h-80 rounded-full bg-rose-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm flex flex-col h-full">
        <div className="text-center mb-4 shrink-0">
          <p className="text-[10px] font-bold tracking-[0.2em] text-orange-600 uppercase mb-1">
            ADHDone
          </p>
          <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">
            Smart enough to help
          </h1>
          <p className="text-[13px] text-gray-600 mt-1">
            Reminders timed to what the task actually needs.
          </p>
        </div>

        <div className="flex-1 flex flex-col justify-start gap-2.5 min-h-0">
          {SCRIPT.slice(0, visible).map((item, i) => (
            <DemoNotification key={`${runId}-${i}`} item={item} index={i} />
          ))}
        </div>

        <div className="flex justify-center shrink-0 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRunId((r) => r + 1)}
            className="text-gray-400 hover:text-gray-900 gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Replay
          </Button>
        </div>
      </div>
    </div>
  );
}