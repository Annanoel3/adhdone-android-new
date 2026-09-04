import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { subscribeCaptures } from "@/lib/pendingCaptures";

// Placeholder cards for tasks the AI is still parsing. Shown at the top of
// Today's Tasks so the user gets instant feedback after speaking/typing.
export default function PendingTaskCards({ theme }) {
  const [captures, setCaptures] = useState([]);

  useEffect(() => subscribeCaptures(setCaptures), []);

  if (captures.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {captures.map((c) => (
        <div
          key={c.id}
          className={`p-4 rounded-xl border flex items-center gap-3 animate-pulse ${
            theme === 'dark'
              ? 'bg-gray-900/50 border-gray-700'
              : 'bg-white border-gray-200'
          }`}
        >
          <Loader2 className="w-5 h-5 animate-spin text-purple-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {c.text}
            </p>
            <p className="text-xs text-gray-500">Setting up your task...</p>
          </div>
        </div>
      ))}
    </div>
  );
}