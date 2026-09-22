import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT } from './catchUpScript';

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
    // Asked ONCE: the flag is written the moment it appears, not when it is
    // closed, so a sign-out before the flag reached the account (or a dialog
    // closed early) can't bring it back on the next sign-in. What the profile
    // already holds is never asked for again — see the script choice below.
    markStepDone(ONBOARDING_STEPS.catchUp);
    setOpen(true);
  }, [user]);

  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  const script = knownName ? CATCH_UP_ABOUT_ONLY_SCRIPT : CATCH_UP_SCRIPT;

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
          <WelcomeChat onDone={handleClose} script={script} initialName={knownName} />
        </div>
      </DialogContent>
    </Dialog>
  );
}