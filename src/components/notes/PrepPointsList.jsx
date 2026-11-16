import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

// What is typed into the agenda's "add" box, as separate points: each thing
// between commas is its own point, so each gets its own check while
// recording (Anna, Nov 16 2026: "each thing separated by commas was a new
// check. Now it saves as just one long thing"). From the day the agenda was
// built (Sept 27 2026) the box added the whole line as one point; the boxes
// that split on commas were the "add steps" ones on a task (SubtaskQuickAdd,
// TaskDetailsModal), and the agenda now follows the same rule. A point that
// needs a comma of its own can have it typed back in on its row.
export const MAX_POINTS = 20;
export function splitPoints(text) {
  return String(text || "").split(",").map((p) => p.trim()).filter(Boolean);
}

// Points to bring up at an event. Each one can be edited in place; it saves
// when the person leaves the box (an emptied box removes the point).
export default function PrepPointsList({ points, onChange, dark, soft }) {
  const [drafts, setDrafts] = useState(points);
  useEffect(() => setDrafts(points), [points]);

  const commit = (i) => {
    const v = (drafts[i] || "").trim();
    if (v === points[i]) return;
    onChange(v ? points.map((p, j) => (j === i ? v : p)) : points.filter((_, j) => j !== i));
  };

  if (!points.length) return null;
  return (
    <ul className="space-y-2">
      {points.map((_, i) => (
        <li key={i} className="flex items-center gap-2">
          <input
            value={drafts[i] ?? ""}
            onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
            onBlur={() => commit(i)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={`flex-1 min-w-0 h-10 rounded-lg border px-3 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`}
          />
          <button type="button" aria-label="Remove this point" onClick={() => onChange(points.filter((_, j) => j !== i))} className={soft}>
            <X className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}