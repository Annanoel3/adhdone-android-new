import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";
import { PAGE_TOURS, ADD_PATHS } from "./pageIntros";
import OnboardingBrandMark from "./OnboardingBrandMark";
import { enterOnboardingSurface, exitOnboardingSurface } from "./onboardingSurface";
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
    // The Tasks page's intro is the video walkthrough below, not a card.
    const tour = currentPageName === "Tasks" ? ADD_PATHS_TOUR : PAGE_TOURS[currentPageName];
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
        // Mark the page's tour seen the MOMENT it appears, not when the last
        // step is tapped. A user who opened Home, saw step 1 and left got the
        // whole thing again on every single app open.
        localStorage.setItem(seenKey(currentPageName), "1");
        persistOnboardingFlag(seenKey(currentPageName));
        setIndex(0);
        setSteps(tour);
      });
    return () => { cancelled = true; };
  }, [currentPageName]);

  const finish = () => {
    setSteps(null);
    // Finishing the Home tour releases the notification-permission prompt.
    if (currentPageName === "Home") markStepDone(ONBOARDING_STEPS.homeTour);
  };

  if (steps === ADD_PATHS_TOUR) return <AddPathsIntro onDone={finish} />;
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
const ADD_PATHS_TOUR = "add-paths";

// First visit to Tasks: one scrolling card. The top says adding is easy; the
// arrow scrolls down to the first how-to video, then the next, and so on. Skip
// before scrolling gets a "no worries" note pointing at the App Guide; the
// bottom of the walkthrough points there too.
const arrowClass =
  "mx-auto flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity";

function AddPathsIntro({ onDone }) {
  const [noWorries, setNoWorries] = useState(false);
  const scrolledRef = useRef(false);
  const sectionRefs = useRef([]);
  const videoRefs = useRef([]);

  useEffect(() => {
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, []);

  const close = () => {
    if (scrolledRef.current || noWorries) onDone();
    else setNoWorries(true);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noWorries]);

  const goTo = (i) => {
    scrolledRef.current = true;
    sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Starts the clip they just scrolled to; if the WebView refuses, the
    // controls are right there.
    const p = videoRefs.current[i]?.play?.();
    if (p && p.catch) p.catch(() => {});
  };

  if (noWorries) {
    return (
      <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" data-state="open">
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 mx-auto max-w-md bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-5">
          <OnboardingBrandMark />
          <h3 className="mt-3 text-lg font-bold text-foreground">No worries!</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Visit the app guide in the menu anytime to get the most from ADHDone!
          </p>
          <Button onClick={onDone} className="w-full mt-5">Got it</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" data-state="open">
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 mx-auto max-w-md bg-card text-card-foreground border border-border rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Fills the first screen on its own, so the videos start below the fold. */}
        <div className="min-h-[85vh] p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-3">
            <OnboardingBrandMark />
            <button
              type="button"
              onClick={close}
              className="-mt-1 -mr-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Skip
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h3 className="text-2xl font-bold text-foreground">Adding tasks is easy!</h3>
            <p className="mt-3 text-base text-muted-foreground leading-relaxed">
              Add them in the app or add them without even opening the app!
            </p>
          </div>
          <button type="button" onClick={() => goTo(0)} aria-label="Show me how" className={`${arrowClass} h-14 w-14 mt-6 animate-bounce`}>
            <ChevronDown className="w-7 h-7" />
          </button>
        </div>

        {ADD_PATHS.map((path, i) => (
          <div key={path.key} ref={(el) => { sectionRefs.current[i] = el; }} className="p-5 border-t border-border">
            <h4 className="font-semibold text-foreground">{path.title}</h4>
            <video
              ref={(el) => { videoRefs.current[i] = el; }}
              src={path.video}
              controls
              playsInline
              preload="metadata"
              className="mt-3 w-full max-h-[55vh] rounded-xl bg-black object-contain"
            />
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{path.text}</p>
            {i < ADD_PATHS.length - 1 ? (
              <button type="button" onClick={() => goTo(i + 1)} aria-label="Next" className={`${arrowClass} h-12 w-12 mt-4`}>
                <ChevronDown className="w-6 h-6" />
              </button>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-muted-foreground text-center">Visit the app guide anytime for a refresher!</p>
                <Button onClick={onDone} className="w-full">OK! Sounds good</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
