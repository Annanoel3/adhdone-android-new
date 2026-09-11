import React from "react";

// The Play Store look: warm cream base with big soft peach/pink blobs.
export default function BrandBackdrop({ children, className = "" }) {
  return (
    <div className={`relative min-h-screen overflow-hidden text-[#2F2A2A] ${className}`} style={{ background: "#FFF6EF" }}>
      <div className="pointer-events-none absolute -top-40 -left-40 w-[28rem] h-[28rem] rounded-full opacity-90"
        style={{ background: "radial-gradient(circle, #FBC4A8 0%, #FBC4A8 45%, transparent 72%)" }} />
      <div className="pointer-events-none absolute top-1/3 -right-48 w-[30rem] h-[30rem] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle, #F9A8B8 0%, #F9A8B8 40%, transparent 72%)" }} />
      <div className="pointer-events-none absolute -bottom-52 -left-32 w-[32rem] h-[32rem] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle, #FAB4A6 0%, #FAB4A6 40%, transparent 72%)" }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}