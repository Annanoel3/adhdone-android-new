import React, { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DemoNotification from "@/components/demo/DemoNotification";

// Every line here is something the app actually sends. No invented features.
const SCRIPT = [
  {
    when: "Wed 8:30 PM",
    title: "Dentist tomorrow at 9:00 AM 🦷",
    body: "So tomorrow morning isn't a surprise.",
    why: "Night-before heads-up for day-only plans",
  },
  {
    when: "Thu 7:20 AM",
    title: "🚧 Traffic is worse than usual",
    body: "Your drive is running about 26 min instead of the usual 14. Leaving by 8:24 keeps you on time.",
    why: "Live Google traffic on your saved route",
  },
  {
    when: "Thu 8:24 AM",
    title: "🚗 Time to leave for work",
    body: "It's about 26 min with traffic right now — leaving now gets you there by 9:00 AM.",
    why: "Measured drive time + 10 min to get out the door",
  },
  {
    when: "Thu 11:40 AM",
    title: "(quiet — you're on shift)",
    body: "Nudges and check-ins hold until you're off. Anything tied to a real time still comes through.",
    why: "Work hours you set, respected",
  },
  {
    when: "Sat 6:00 PM",
    title: "Mom's birthday is tomorrow 🎂",
    body: "Her text is already drafted — open it and hit send.",
    why: "Birthday text written ahead of time",
  },
  {
    when: "Sun 2:15 PM",
    title: "One thing: fold the laundry 🧺",
    body: "Not the whole list. Just this one.",
    why: "One nudge at a time, never a pile-up",
  },
];

// How many fit on one phone screen. When a batch is full, the tray clears and
// the remaining notifications pop up on a fresh screen — never scrolling.
const PER_SCREEN = 3;

export default function NotificationDemo() {
  const [visible, setVisible] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setVisible(0);
    // Each notification stays up long enough to actually be read: a base beat
    // plus reading time for its own text, so longer messages linger.
    let elapsed = 900;
    const timers = SCRIPT.map((item, i) => {
      const chars = `${item.title} ${item.body} ${item.why || ""}`.length;
      const t = setTimeout(() => setVisible(i + 1), elapsed);
      elapsed += 1100 + chars * 28;
      return t;
    });
    return () => timers.forEach(clearTimeout);
  }, [runId]);

  // Only the current screenful is on display.
  const batchStart = Math.floor(Math.max(visible - 1, 0) / PER_SCREEN) * PER_SCREEN;
  const shown = SCRIPT.slice(batchStart, visible);

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

        <div className="flex-1 flex flex-col justify-start gap-2.5 min-h-0 overflow-hidden">
          {shown.map((item, i) => (
            <DemoNotification
              key={`${runId}-${batchStart + i}`}
              item={item}
              index={i}
            />
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