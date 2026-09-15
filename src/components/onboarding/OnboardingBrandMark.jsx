import React from "react";

// The in-app ADHDone lockup — sage primary square + wordmark. Theme tokens
// only, so it reads correctly in dark and every seasonal mode.
export default function OnboardingBrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-extrabold">
        A
      </div>
      <span className="text-sm font-extrabold tracking-tight text-foreground">ADHDone</span>
    </div>
  );
}