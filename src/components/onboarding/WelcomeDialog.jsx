import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';

// The very first thing a new user sees — a short back-and-forth with Anna that
// collects a name and a sentence about the user's life. Nothing else in the
// first-run sequence starts until it's finished.
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
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0 bg-card text-card-foreground border-border">
        <div className="pt-2">
          <WelcomeChat onDone={handleClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}