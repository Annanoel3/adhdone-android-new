import React from "react";

// A phone lock screen the notifications actually live on — gives the spot a
// real place instead of cards floating on an empty background.
export default function AdPhoneFrame({ dark = false, clock = "4:58", date = "Sunday, June 8", children }) {
  return (
    <div className="w-full rounded-[38px] p-[7px] bg-[#1b1b1f] shadow-[0_26px_60px_rgba(0,0,0,0.35)]">
      <div
        className={`relative rounded-[32px] overflow-hidden px-3 pt-3 pb-5 flex flex-col ${
          dark
            ? "bg-gradient-to-b from-[#1c2030] via-[#141726] to-[#0d0f18]"
            : "bg-gradient-to-b from-[#ffd6a8] via-[#ffb896] to-[#f79a8e]"
        }`}
        style={{ minHeight: 430 }}
      >
        {/* soft wallpaper light */}
        <div
          className={`pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl ${
            dark ? "bg-indigo-500/20" : "bg-white/50"
          }`}
        />

        {/* status bar + notch */}
        <div className="relative flex items-center justify-between px-2">
          <span className={`text-[10px] font-semibold ${dark ? "text-white/70" : "text-black/60"}`}>
            {clock.replace(":", ":")}
          </span>
          <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-20 h-5 rounded-full bg-[#1b1b1f]" />
          <div className="flex items-center gap-1">
            <div className={`w-3.5 h-1.5 rounded-sm ${dark ? "bg-white/50" : "bg-black/40"}`} />
            <div className={`w-5 h-2 rounded-sm border ${dark ? "border-white/50" : "border-black/40"}`} />
          </div>
        </div>

        {/* lock clock */}
        <div className="relative text-center mt-4 mb-4">
          <p className={`text-[11px] font-medium ${dark ? "text-white/60" : "text-black/50"}`}>{date}</p>
          <p
            className={`text-[52px] leading-none font-semibold tracking-tight ${
              dark ? "text-white/90" : "text-black/80"
            }`}
          >
            {clock}
          </p>
        </div>

        <div className="relative flex-1 flex flex-col justify-end">{children}</div>
      </div>
    </div>
  );
}