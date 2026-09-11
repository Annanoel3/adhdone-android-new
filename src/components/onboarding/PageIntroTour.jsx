import React, { useEffect, useState } from "react";
import { PAGE_TOURS } from "./pageIntros";
import TourStepCard from "./TourStepCard";
import OtherWaysStepCard from "./OtherWaysStepCard";
import { ONBOARDING_STEPS, markStepDone, waitForStep } from "./onboardingGate";
import { setTourActive } from "./tourActive";

// Bumping this replays every page tour once for everyone (existing users
// included), then it goes back to being one-time per page.
const TOUR_VERSION = "v4";
const seenKey = (page) => `tour_seen_${TOUR_VERSION}_${page}`;

// Shows a one-time intro tour the first time the user lands on a page.
export default function PageIntroTour({ currentPageName }) {
  const [steps, setSteps] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setSteps(null);
    const tour = PAGE_TOURS[currentPageName];
    if (!tour) return;
    if (localStorage.getItem(seenKey(currentPageName))) return;
    // Tours come AFTER the welcome note, and before any permission prompts.
    let cancelled = false;
    let t = null;
    waitForStep(ONBOARDING_STEPS.welcome).then(() => {
      if (cancelled) return;
      t = setTimeout(() => {
        setIndex(0);
        setSteps(tour);
      }, 1000);
    });
    return () => { cancelled = true; if (t) clearTimeout(t); };
  }, [currentPageName]);

  // Nothing else may pop up while a tour card is on screen.
  useEffect(() => {
    setTourActive(!!steps);
    return () => setTourActive(false);
  }, [steps]);

  const finish = () => {
    localStorage.setItem(seenKey(currentPageName), "1");
    setSteps(null);
    // Finishing the Home tour releases the notification-permission prompt.
    if (currentPageName === "Home") markStepDone(ONBOARDING_STEPS.homeTour);
  };

  if (!steps || !steps[index]) return null;
  const isLast = index === steps.length - 1;
  const step = steps[index];
  const next = () => (isLast ? finish() : setIndex((i) => i + 1));

  if (step.variant === "otherWays") {
    return (
      <OtherWaysStepCard
        isLast={isLast}
        stepNumber={index + 1}
        totalSteps={steps.length}
        onNext={next}
        onSkip={finish}
      />
    );
  }

  return (
    <TourStepCard
      step={step}
      isLast={isLast}
      stepNumber={index + 1}
      totalSteps={steps.length}
      onNext={() => (isLast ? finish() : setIndex((i) => i + 1))}
      onSkip={finish}
    />
  );
}