import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import { wasReplayedThisSession } from './onboardingReplay';
import WelcomeChat from './WelcomeChat';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT } from './catchUpScript';

// The very first thing a new user sees — a short back-and-forth that collects a
// name and a sentence about the user's life. Nothing else in the
// first-run sequence starts until it's finished.
//
// Whether it has been done belongs to the ACCOUNT, not the phone: the flag is
// copied down from the profile before this mounts, and an account that already
// answered (it has a name or an about-me) counts as done even if the flag was
// lost — so a reinstall or a new phone never asks twice.
//
// An account with history is never "new" either, whatever this phone
// remembers. The done-flag only started living on the account partway
// through, and a page-tour version bump erases the older on-phone evidence, so
// people who had used the app for weeks were greeted as brand new ("welcome to
// ADHDone… let's get you a first win"). They get the short "welcome back"
// catch-up instead. A replay requested for the account (testing a first run)
// still gets the real first run.
const EXISTING_ACCOUNT_DAYS = 3;

async function accountHasHistory(user) {
  const created = Date.parse(user?.created_date || '');
  if (!isNaN(created) && Date.now() - created > EXISTING_ACCOUNT_DAYS * 24 * 60 * 60 * 1000) return true;
  try {
    const rows = await base44.entities.Task.list('-created_date', 1);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

export default function WelcomeDialog({ user }) {
  // 'welcome' = the first-run conversation, 'catchup' = the returning-user one.
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    if (isStepDone(ONBOARDING_STEPS.welcome)) return undefined;
    if (user.preferred_name || user.about_me) {
      markStepDone(ONBOARDING_STEPS.welcome);
      return undefined;
    }
    let cancelled = false;
    (wasReplayedThisSession() ? Promise.resolve(false) : accountHasHistory(user)).then((existing) => {
      if (cancelled || isStepDone(ONBOARDING_STEPS.welcome)) return;
      if (!existing) {
        setMode('welcome');
        return;
      }
      // Not a new account. What a returning person gets is the "welcome back"
      // chat (only the questions their profile is missing) and, after it, the
      // alarm question — not the first-run walkthrough, so the
      // notifications/shortcut card is marked done up front.
      markStepDone(ONBOARDING_STEPS.permissions);
      // Both flags are set in the same tick, before the catch-up appears, so
      // the separate catch-up dialog can never show a second copy.
      const askCatchUp = !isStepDone(ONBOARDING_STEPS.catchUp);
      markStepDone(ONBOARDING_STEPS.welcome);
      if (!askCatchUp) {
        markStepDone(ONBOARDING_STEPS.homeTour);
        return;
      }
      markStepDone(ONBOARDING_STEPS.catchUp);
      setMode('catchup');
    });
    return () => { cancelled = true; };
  }, [user]);

  // While it's up, no other onboarding surface may appear behind it.
  useEffect(() => {
    if (!mode) return undefined;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [mode]);

  const handleClose = () => {
    setMode(null);
    markStepDone(ONBOARDING_STEPS.welcome);
    // There is no Home tour any more; its step is what releases what comes
    // after the welcome (the notifications card for a new account, the alarm
    // question). It's released here, when the chat closes — releasing it any
    // earlier let the next popup land on top of the chat.
    markStepDone(ONBOARDING_STEPS.homeTour);
  };

  // Same choice the catch-up dialog makes: never ask for a name we already have.
  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  const catchUpScript = knownName ? CATCH_UP_ABOUT_ONLY_SCRIPT : CATCH_UP_SCRIPT;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0 bg-card text-card-foreground border-border">
        <div className="pt-2">
          {mode === 'catchup' ? (
            <WelcomeChat onDone={handleClose} script={catchUpScript} initialName={knownName} />
          ) : (
            <WelcomeChat onDone={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
