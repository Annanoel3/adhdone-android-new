import React, { useEffect, useState } from "react";
import { PAGE_TOURS } from "./pageIntros";
import TourStepCard from "./TourStepCard";
import { ONBOARDING_STEPS, isStepDone, markStepDone, waitForStep } from "./onboardingGate";
import { persistOnboardingFlag } from "./onboardingSync";
import { waitForCalm } from "./onboardingSurface";
import { seenKey } from "./tourVersion";

// Shows a one-time intro tour the first time the user lands on a page.
export default function PageIntroTour({ currentPageName }) {
  const [steps, setSteps] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setSteps(null);
    const tour = PAGE_TOURS[currentPageName];
    if (!tour) return;
    if (localStorage.getItem(seenKey(currentPageName))) return;

    // Two ways in:
    //  - Welcome note is up right now → the tour is CHAINED to its dismissal:
    //    the instant it closes, a ~250ms beat for the dialog fade, then the
    //    card. No calm-polling here — the "Okay" tap itself counts as user
    //    activity and would push the card out by seconds.
    //  - Welcome already done (any later first visit to a page) → wait for a
    //    genuinely clear screen so we never stack on another surface.
    let cancelled = false;
    const chainedToWelcome = !isStepDone(ONBOARDING_STEPS.welcome);
    waitForStep(ONBOARDING_STEPS.welcome)
      .then(() =>
        chainedToWelcome
          ? new Promise((r) => setTimeout(r, 250))
          : waitForCalm()
      )
      .then(() => {
        if (cancelled) return;
        setIndex(0);
        setSteps(tour);
      });
    return () => { cancelled = true; };
  }, [currentPageName]);

  const finish = () => {
    localStorage.setItem(seenKey(currentPageName), "1");
    persistOnboardingFlag(seenKey(currentPageName));
    setSteps(null);
    // Finishing the Home tour releases the notification-permission prompt.
    if (currentPageName === "Home") markStepDone(ONBOARDING_STEPS.homeTour);
  };

  if (!steps || !steps[index]) return null;
  const isLast = index === steps.length - 1;
  const step = steps[index];
  const next = () => (isLast ? finish() : setIndex((i) => i + 1));

  return (
    <TourStepCard
      step={step}
      isLast={isLast}
      stepNumber={index + 1}
      totalSteps={steps.length}
      onNext={next}
      onSkip={finish}
    />
  );
}