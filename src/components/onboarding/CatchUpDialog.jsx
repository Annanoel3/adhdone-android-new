import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';
import CATCH_UP_SCRIPT from './catchUpScript';

// Shown to accounts that finished onboarding BEFORE the name + about-me
// questions existed. It asks only those two questions — never the page tours,
// which these users already sat through.
export default function CatchUpDialog({ user }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Only for existing accounts (welcome already done), only when the profile
    // is actually missing the context, and only once.
    if (!isStepDone(ONBOARDING_STEPS.welcome)) return;
    if (isStepDone(ONBOARDING_STEPS.catchUp)) return;
    if (user.about_me) return;
    setOpen(true);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    markStepDone(ONBOARDING_STEPS.catchUp);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0 bg-card text-card-foreground border-border">
        <div className="pt-2">
          <WelcomeChat onDone={handleClose} script={CATCH_UP_SCRIPT} />
        </div>
      </DialogContent>
    </Dialog>
  );
}