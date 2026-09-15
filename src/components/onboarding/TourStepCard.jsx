import React, { useEffect, useState } from "react";
import OnboardingCard from "./OnboardingCard";

// One tour step: dims the screen, optionally rings the element it's talking
// about, and shows the explanation near it.
export default function TourStepCard({ step, isLast, stepNumber, totalSteps, onNext, onSkip }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    setRect(null);
    if (!step.selector) return;
    const el = document.querySelector(step.selector);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  // When the card sits above the highlighted element it can get pushed under
  // the status bar and clipped — clamp it so it always keeps room to render.
  const SAFE_TOP = 72;
  const MIN_CARD = 190;
  const panelStyle = rect
    ? spaceBelow > 240
      ? { top: Math.max(SAFE_TOP, rect.bottom + 16) }
      : {
          bottom: Math.min(
            window.innerHeight - rect.top + 16,
            Math.max(0, window.innerHeight - SAFE_TOP - MIN_CARD)
          ),
        }
    : { top: "50%", transform: "translateY(-50%)" };

  return (
    <OnboardingCard
      title={step.title}
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      isLast={isLast}
      onNext={onNext}
      onSkip={onSkip}
      spotlight={rect}
      panelStyle={panelStyle}
    >
      <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
    </OnboardingCard>
  );
}