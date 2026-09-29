import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';
import { base44 } from '@/api/base44Client';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT, FIRST_DONE_SCRIPT } from './catchUpScript';

// The name + about-me questions, for anyone whose profile is missing them:
// accounts that finished onboarding before those questions existed, and (since
// the first sitting was cut down to one task and one time) every new account.
// Either way it waits for the first checked-off task — the app has done
// something for them before it asks about them. Never the page tours.
export default function CatchUpDialog({ user }) {
  const [open, setOpen] = useState(false);
  // Looked up once per app open, not every time the account record refreshes
  // (that happens often, and must not throw away a look-up in flight).
  const checked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!user || checked.current) return;
    // Only once the welcome is behind them, only when the profile is actually
    // missing the context, and only once.
    if (!isStepDone(ONBOARDING_STEPS.welcome)) return;
    if (isStepDone(ONBOARDING_STEPS.catchUp)) return;
    if (user.about_me) return;
    checked.current = true;
    base44.entities.Task.filter({ status: 'completed' }, '-updated_date', 1)
      .then((rows) => {
        if (!mounted.current || !rows?.length) return;
        if (isStepDone(ONBOARDING_STEPS.catchUp)) return;
        // Asked ONCE: the flag is written the moment it appears, not when it is
        // closed, so a sign-out before the flag reached the account (or a dialog
        // closed early) can't bring it back on the next sign-in. What the profile
        // already holds is never asked for again — see the script choice below.
        markStepDone(ONBOARDING_STEPS.catchUp);
        setOpen(true);
      })
      .catch(() => {});
  }, [user]);

  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  // An account from after the first sitting was cut down (no name asked yet)
  // gets the "first one done" version; an older one gets the welcome-back.
  const NEW_FLOW_SINCE = Date.parse('2026-09-29T00:00:00Z');
  const newFlow = Date.parse(user?.created_date || '') >= NEW_FLOW_SINCE;
  const script = knownName ? CATCH_UP_ABOUT_ONLY_SCRIPT : (newFlow ? FIRST_DONE_SCRIPT : CATCH_UP_SCRIPT);

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