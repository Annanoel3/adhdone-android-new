import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone, waitForStep } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface, waitForCalm } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';
import { base44 } from '@/api/base44Client';
import WELCOME_SCRIPT from './welcomeScript';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT, FIRST_DONE_SCRIPT, FIRST_DONE_ABOUT_ONLY_SCRIPT, NAME_ONLY_SCRIPT } from './catchUpScript';

// The name alone, asked once more for someone who closed the welcome chat
// before giving one (Anna, Oct 1 2026 — "for people like Rycher"). On a later
// open, once the screen is calm; closed again, they're left alone (Settings
// has the field).
const NAME_RETRY_STEP = 'onboarding_name_retry_done';
const NAME_RETRY_HOLD = 'onboarding_name_retry_hold';

// The full welcome again, for someone who skipped it entirely, with its first
// line swapped for a "you missed this" one.
const REWELCOME_SCRIPT = [
  { text: () => "Hey, I think you missed this the first time! No worries, it takes about a minute and it's how ADHDone gets set up to actually remind you." },
  ...WELCOME_SCRIPT.slice(1),
];

// The name + about-me questions, for anyone whose profile is missing them:
// accounts that finished onboarding before those questions existed, and (since
// the first sitting was cut down to one task and one time) every new account.
// Either way it waits for the first checked-off task — the app has done
// something for them before it asks about them. Never the page tours.
export default function CatchUpDialog({ user }) {
  const [open, setOpen] = useState(false);
  // 'catchup' = name (if missing) + about-you after the first checked-off
  // task; 'name' = the name alone (see NAME_RETRY_STEP).
  const [kind, setKind] = useState('catchup');
  const openRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);
  const nameChecked = useRef(false);
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
        // Its turn: nothing else on screen (the name re-ask below, a tour, a
        // question), and the user not mid-tap.
        return waitForCalm().then(() => {
          if (!mounted.current || openRef.current) return;
          if (isStepDone(ONBOARDING_STEPS.catchUp)) return;
          // Asked ONCE: the flag is written the moment it appears, not when it is
          // closed, so a sign-out before the flag reached the account (or a dialog
          // closed early) can't bring it back on the next sign-in. What the profile
          // already holds is never asked for again — see the script choice below.
          markStepDone(ONBOARDING_STEPS.catchUp);
          setKind('catchup');
          setOpen(true);
        });
      })
      .catch(() => {});
  }, [user]);

  // The name alone, for an account that got past the welcome without one.
  useEffect(() => {
    if (!user || nameChecked.current) return;
    if (!isStepDone(ONBOARDING_STEPS.welcome)) return;
    // Already asked again, or the catch-up (which asks the name itself when
    // it's missing) has been: leave them alone.
    if (isStepDone(NAME_RETRY_STEP) || isStepDone(ONBOARDING_STEPS.catchUp)) return;
    if ((user.preferred_name || user.display_name || '').trim()) return;
    // The welcome was closed in THIS sitting: not now, a later open.
    try { if (sessionStorage.getItem(NAME_RETRY_HOLD) === '1') return; } catch (e) {}
    nameChecked.current = true;
    let cancelled = false;
    waitForStep(ONBOARDING_STEPS.homeTour)
      .then(waitForCalm)
      // No name AND not a single task: they skipped the whole welcome, so it
      // comes back in full, opening with "you missed this". With tasks, only
      // the name is asked.
      .then(() => base44.entities.Task.list('-created_date', 1).catch(() => [1]))
      .then((rows) => {
        if (cancelled || !mounted.current || openRef.current) return;
        if (isStepDone(NAME_RETRY_STEP) || isStepDone(ONBOARDING_STEPS.catchUp)) return;
        markStepDone(NAME_RETRY_STEP);
        setKind(rows?.length ? 'name' : 'rewelcome');
        setOpen(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  // An account from after the first sitting was cut down (no name asked yet)
  // gets the "first one done" version; an older one gets the welcome-back.
  const NEW_FLOW_SINCE = Date.parse('2026-09-29T00:00:00Z');
  const newFlow = Date.parse(user?.created_date || '') >= NEW_FLOW_SINCE;
  const script = kind === 'rewelcome'
    ? REWELCOME_SCRIPT
    : kind === 'name'
    ? NAME_ONLY_SCRIPT
    : newFlow
      ? (knownName ? FIRST_DONE_ABOUT_ONLY_SCRIPT : FIRST_DONE_SCRIPT)
      : (knownName ? CATCH_UP_ABOUT_ONLY_SCRIPT : CATCH_UP_SCRIPT);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    // The name re-ask doesn't stand in for the catch-up: the about-you
    // question still comes after their first checked-off task.
    markStepDone(kind === 'name' ? NAME_RETRY_STEP : ONBOARDING_STEPS.catchUp);
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