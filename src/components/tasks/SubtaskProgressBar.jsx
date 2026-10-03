import React from "react";

export default function SubtaskProgressBar({ done, total, theme }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  const dark = theme === 'dark';
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}>
        <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{pct}%</span>
    </div>
  );
}