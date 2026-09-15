import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import OnboardingBrandMark from './OnboardingBrandMark';

// The very first thing a new user sees — a note from Anna. Nothing else in the
// first-run sequence starts until this is dismissed.
export default function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isStepDone(ONBOARDING_STEPS.welcome)) setOpen(true);
  }, []);

  // While it's up, no other onboarding surface may appear behind it.
  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    markStepDone(ONBOARDING_STEPS.welcome);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border">
        <div className="space-y-4 pt-2">
          <OnboardingBrandMark />
          <h2 className="text-2xl font-bold text-foreground">Hey, welcome to ADHDone! 👋</h2>
          <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              I'm Anna. I built this app because I wanted a productivity app that did more than
              give me another checklist to ignore.
            </p>
            <p>
              I'm a solo developer, so if something bugs you or you think of something cool, I want
              to hear it. The feedback form is in Settings.
            </p>
            <p>
              This app has helped me a lot, and I hope it helps you too.
            </p>
            <p>
              Also, there may be a few Easter eggs hiding around. 😉
            </p>
          </div>
          <Button onClick={handleClose} className="w-full">
            Okay
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}