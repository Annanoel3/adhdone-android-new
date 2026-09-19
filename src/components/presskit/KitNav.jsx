import React from "react";

// Jump list — the kit is long on purpose, so it needs a way in.
export default function KitNav({ sections }) {
  return (
    <nav className="rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)] p-6 mb-20">
      <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-4">What's in here</p>
      <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
        {sections.map((s, i) => (
          <li key={s.id} className="flex gap-3 text-sm">
            <span className="text-[#B4A6A6] font-mono">{String(i + 1).padStart(2, "0")}</span>
            <a href={`#${s.id}`} className="font-medium text-[#4A4242] hover:text-[#E07A8B] transition-colors">
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}