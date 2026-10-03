import React from "react";

// One segment per step; finished steps fill in, each with its own colour.
const PALETTES = {
  dark: ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400', 'bg-teal-400'],
  minimalist: ['bg-green-600', 'bg-emerald-500', 'bg-teal-500', 'bg-lime-600', 'bg-green-400', 'bg-teal-600'],
  colorful: ['bg-purple-500', 'bg-orange-400', 'bg-teal-400', 'bg-pink-400', 'bg-violet-400', 'bg-amber-400'],
  spicybrains: ['bg-pink-500', 'bg-yellow-400', 'bg-cyan-400', 'bg-purple-500', 'bg-orange-400', 'bg-lime-400'],
};

export default function SubtaskProgressBar({ done, total, theme }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  const dark = theme === 'dark';
  const colors = PALETTES[theme] || PALETTES.minimalist;
  return (
    <div className="flex items-center gap-1.5 pt-1.5">
      <div className="flex-1 flex gap-px h-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors duration-300 ${
              i < done ? colors[i % colors.length] : dark ? 'bg-gray-700' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <span className={`text-[10px] leading-none font-medium tabular-nums ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{pct}%</span>
    </div>
  );
}