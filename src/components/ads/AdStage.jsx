import React from "react";

// Full-bleed vertical canvas for a single ad variant. Sized for a phone /
// 9:16 crop so a screen recording needs no reframing.
export default function AdStage({ tone = "warm", children }) {
  const dark = tone === "dark";
  return (
    <div
      className={`h-screen w-full overflow-hidden flex flex-col items-center justify-center px-6 transition-colors duration-700 ${
        dark ? "bg-[#111113]" : "bg-[#FDF6EC]"
      }`}
    >
      {!dark && (
        <>
          <div className="pointer-events-none fixed -top-28 -left-20 w-80 h-80 rounded-full bg-orange-200/40 blur-3xl" />
          <div className="pointer-events-none fixed -bottom-24 -right-20 w-80 h-80 rounded-full bg-rose-200/40 blur-3xl" />
        </>
      )}
      <div className="relative w-full max-w-sm flex flex-col justify-center flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}