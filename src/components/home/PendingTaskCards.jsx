import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { subscribeCaptures, captureFinished } from "@/lib/pendingCaptures";

// Tasks the user has typed or spoken that are still being set up. They sit in
// the task list itself, in the spot the finished task will take, so a new task
// is on the list the moment it is given — not once the AI is done with it.
// A capture whose every part is finished is already off the list.
export function usePendingCaptures() {
  const [captures, setCaptures] = useState([]);
  useEffect(() => subscribeCaptures((list) => setCaptures(list.filter((c) => !captureFinished(c)))), []);
  return captures;
}

// The loading bar (Anna, Nov 16 2026: "After pressing add, there should be a
// loading bar or something. It should also say the user can leave the page
// and come back."). Until then the card had a spinner and "Setting up your
// task..." and nothing that moved forward.
//
// How far along it is drawn is a guess from the clock, not a count of steps:
// setting a task up takes 10 to 20 seconds (CaptureTrace, Nov 13 to 16 2026:
// claimed to saved), so the bar covers most of its length in that time, keeps
// creeping after it, and never reaches the end. The card going away, with the
// task in its place, is the only "done". A capture split in several tasks is
// at least as far along as the parts already made. It runs from when the task
// was added, so it is in the same place on every page and after leaving one
// and coming back, which is what the line under it says they can do: the
// queue lives outside the pages (TaskCaptureProcessor, in the Layout), and a
// task the app is closed on is finished by the server or on the next open.
const BAR_START = 6;
const BAR_END = 95;
const BAR_PACE_MS = 8000;
// One picked up from an earlier open starts over from when it is shown here.
const startedAt = new Map();
function barStart(c, now) {
  if (!startedAt.has(c.id)) startedAt.set(c.id, c.resumed ? now : (c.createdAt || now));
  return startedAt.get(c.id);
}
export function barPercent(c, now) {
  const elapsed = Math.max(0, now - barStart(c, now));
  let pct = BAR_START + (BAR_END - BAR_START) * (1 - Math.exp(-elapsed / BAR_PACE_MS));
  const parts = Array.isArray(c.parts) ? c.parts.length : 0;
  if (parts > 1) pct = Math.max(pct, ((c.doneCount || 0) / parts) * 100);
  return Math.round(Math.min(BAR_END, pct));
}

// One list row per capture, styled like the task rows around it. Pass
// `captures` when the list already subscribes (so the empty state and the
// rows agree); otherwise it subscribes itself.
export default function PendingTaskCards({ theme, captures: given, className = '' }) {
  const own = usePendingCaptures();
  const captures = given || own;
  const [now, setNow] = useState(() => Date.now());
  const waiting = captures.length > 0;
  useEffect(() => {
    if (!waiting) return undefined;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [waiting]);
  useEffect(() => {
    const ids = new Set(captures.map((c) => c.id));
    for (const id of [...startedAt.keys()]) if (!ids.has(id)) startedAt.delete(id);
  }, [captures]);
  if (!waiting) return null;
  const dark = theme === 'dark';

  return (
    <>
      {captures.map((c, i) => {
        const pct = barPercent(c, now);
        return (
          <div
            key={c.id}
            className={`p-4 rounded-xl border ${
              dark ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-gray-200'
            } ${className}`}
          >
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {c.text}
                </p>
                <p className="text-xs text-gray-500">
                  {c.lastError || c.held || c.afterVisible ? 'Still setting this up…' : 'Setting up your task...'}
                </p>
              </div>
            </div>
            <div
              role="progressbar"
              aria-label="Setting up your task"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className={`mt-3 h-1.5 w-full rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}
            >
              <div
                className="h-full rounded-full bg-purple-500 transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            {i === captures.length - 1 && (
              <p className={`mt-2 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                You can leave this page and come back.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
