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

// One list row per capture, styled like the task rows around it. Pass
// `captures` when the list already subscribes (so the empty state and the
// rows agree); otherwise it subscribes itself.
export default function PendingTaskCards({ theme, captures: given, className = '' }) {
  const own = usePendingCaptures();
  const captures = given || own;
  if (captures.length === 0) return null;
  const dark = theme === 'dark';

  return (
    <>
      {captures.map((c) => (
        <div
          key={c.id}
          className={`p-4 rounded-xl border flex items-center gap-3 animate-pulse ${
            dark ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-gray-200'
          } ${className}`}
        >
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
      ))}
    </>
  );
}
