import React from "react";

const LOGO = "https://media.base44.com/images/public/68dd79726fce6eca73056b9b/e174efe73_eb99dda5c_CopyofNope10802.png";

/**
 * Parent-developer credit — Mediocre at Best Dev is the studio behind ADHDone
 * (still one person). `compact` renders a single-line pill for above-the-fold use.
 */
export default function DeveloperCredit({ className = "", compact = false }) {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-3 rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-sm pl-2 pr-5 py-2 ${className}`}>
        <img src={LOGO} alt="Mediocre at Best Dev" className="w-11 h-11 rounded-xl shadow" />
        <span className="text-left leading-tight">
          <span className="block text-[11px] font-bold tracking-widest uppercase text-[#B4A6A6]">An app by</span>
          <span className="block text-base font-extrabold text-[#2F2A2A]">Mediocre at Best Dev</span>
          <span className="block text-xs text-[#7A6F6F] mt-0.5">A one-woman studio, building the fix for her own chaos.</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center gap-5 rounded-3xl bg-white/80 backdrop-blur border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)] p-6 ${className}`}>
      <img src={LOGO} alt="Mediocre at Best Dev" className="w-20 h-20 rounded-2xl shadow-md flex-shrink-0" />
      <div className="text-center sm:text-left">
        <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-1">An app by</p>
        <p className="text-xl font-extrabold tracking-tight text-[#2F2A2A]">Mediocre at Best Dev</p>
        <p className="text-sm text-[#5A5252] mt-1.5 leading-relaxed">
          A one-woman studio behind ADHDone — building the fix for her own chaos, and sharing it.
        </p>
      </div>
    </div>
  );
}