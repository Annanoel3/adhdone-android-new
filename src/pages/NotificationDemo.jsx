import React, { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DemoNotification from "@/components/demo/DemoNotification";

const SCRIPT = [
  {
    when: "Mon 7:40 PM",
    title: "Dentist Thursday at 9am 🦷",
    body: "Heads up early — you'll want to move that morning meeting.",
    why: "Knew this needed advance notice",
  },
  {
    when: "Thu 8:05 AM",
    title: "Leave in 20 minutes",
    body: "It's 14 min away with traffic right now.",
    why: "Timed to your actual drive",
  },
  {
    when: "Fri 5:15 PM",
    title: "Grab milk on the way home 🥛",
    body: "You pass the store in about 10 minutes.",
    why: "Reminded where it's doable",
  },
  {
    when: "Sat 10:30 AM",
    title: "Rent is due Tuesday",
    body: "Weekend you has time. Tuesday you won't.",
    why: "Moved to when you're free",
  },
  {
    when: "Sat 6:00 PM",
    title: "Mom's birthday is tomorrow 🎂",
    body: "Your text is already written — just hit send.",
    why: "Showed up with the work done",
  },
];

export default function NotificationDemo() {
  const [visible, setVisible] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setVisible(0);
    const timers = SCRIPT.map((_, i) =>
      setTimeout(() => setVisible(i + 1), 1200 + i * 2000)
    );
    return () => timers.forEach(clearTimeout);
  }, [runId]);

  return (
    <div className="min-h-screen w-full bg-[#FDF6EC] flex flex-col items-center px-6 py-10">
      <div className="pointer-events-none fixed -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 -right-24 w-[420px] h-[420px] rounded-full bg-rose-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold tracking-[0.2em] text-orange-600 uppercase mb-2">
            ADHDone
          </p>
          <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">
            Smart enough to help
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            Reminders timed to what the task actually needs.
          </p>
        </div>

        <div className="space-y-3 min-h-[520px]">
          {SCRIPT.slice(0, visible).map((item, i) => (
            <DemoNotification key={`${runId}-${i}`} item={item} index={i} />
          ))}
        </div>

        <div className="flex justify-center mt-8">
          <Button
            variant="ghost"
            onClick={() => setRunId((r) => r + 1)}
            className="text-gray-500 hover:text-gray-900 gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Replay
          </Button>
        </div>
      </div>
    </div>
  );
}