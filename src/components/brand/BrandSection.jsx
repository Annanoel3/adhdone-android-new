import React from "react";

export function SectionTitle({ kicker, title, children }) {
  return (
    <div className="mb-8">
      {kicker && <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-2">{kicker}</p>}
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2F2A2A] mb-3">{title}</h2>
      {children && <p className="text-base text-[#5A5252] max-w-2xl leading-relaxed">{children}</p>}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)] ${className}`}>
      {children}
    </div>
  );
}

export function Swatch({ label, hex, note }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl border border-black/10 shadow-sm flex-shrink-0" style={{ background: hex }} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#2F2A2A]">{label}</p>
        <p className="text-[11px] text-[#7A6F6F] font-mono">{hex}</p>
        {note && <p className="text-[11px] text-[#7A6F6F]">{note}</p>}
      </div>
    </div>
  );
}