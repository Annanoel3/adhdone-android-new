import React from "react";

/**
 * Parent-developer credit — Mediocre at Best Dev is the studio behind ADHDone
 * (still one person). Shown on the public landing page and the brand book.
 */
export default function DeveloperCredit({ className = "" }) {
  return (
    <div className={`flex flex-col sm:flex-row items-center gap-5 rounded-3xl bg-white/80 backdrop-blur border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)] p-6 ${className}`}>
      <img
        src="https://media.base44.com/images/public/68dd79726fce6eca73056b9b/e174efe73_eb99dda5c_CopyofNope10802.png"
        alt="Mediocre at Best Dev"
        className="w-20 h-20 rounded-2xl shadow-md flex-shrink-0"
      />
      <div className="text-center sm:text-left">
        <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-1">An app by</p>
        <p className="text-xl font-extrabold tracking-tight text-[#2F2A2A]">Mediocre at Best Dev</p>
        <p className="text-sm text-[#5A5252] mt-1.5 leading-relaxed">
          The studio behind ADHDone — which is still just one person with ADHD, making apps.
        </p>
      </div>
    </div>
  );
}