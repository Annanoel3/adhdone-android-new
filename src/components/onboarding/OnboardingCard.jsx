import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import OnboardingBrandMark from "./OnboardingBrandMark";
import TourProgressDots from "./TourProgressDots";
import { enterOnboardingSurface, exitOnboardingSurface } from "./onboardingSurface";

// The shared shell every onboarding card uses: dimmed backdrop, optional
// spotlight ring, brand header, skip control, progress dots.
//
// role="dialog" + data-state="open" are load-bearing: the Android hardware
// back handler looks for an open overlay and sends Escape to it instead of
// quitting the app. The Escape listener below is what turns that into "leave
// this card" rather than "exit ADHDone".
export default function OnboardingCard({
  title,
  children,
  stepNumber,
  totalSteps,
  isLast,
  onNext,
  onSkip,
  spotlight,
  panelStyle,
}) {
  useEffect(() => {
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onSkip?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onSkip]);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" data-state="open">
      {/* No tap-to-dismiss — a stray tap can't skip an intro the user hasn't
          read. The Skip control is the deliberate way out. */}
      <div className="absolute inset-0 bg-black/60" />

      {spotlight && (
        <div
          className="absolute rounded-2xl ring-4 ring-primary pointer-events-none"
          style={{
            top: spotlight.top - 6,
            left: spotlight.left - 6,
            width: spotlight.width + 12,
            height: spotlight.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }}
        />
      )}

      <div
        className="absolute left-4 right-4 mx-auto max-w-md bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
        style={panelStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <OnboardingBrandMark />
          <button
            type="button"
            onClick={onSkip}
            className="-mt-1 -mr-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Skip
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <div className="mt-2">{children}</div>

        <div className="flex items-center justify-between gap-3 mt-5">
          <TourProgressDots stepNumber={stepNumber} totalSteps={totalSteps} />
          <Button onClick={onNext}>{isLast ? "OK! Sounds good" : "Next"}</Button>
        </div>
      </div>
    </div>
  );
}