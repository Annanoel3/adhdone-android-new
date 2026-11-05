import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface } from './onboardingSurface';
import { wasReplayedThisSession } from './onboardingReplay';
import WelcomeChat from './WelcomeChat';
import { resumeScript } from './welcomeScript';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT } from './catchUpScript';

// The very first thing a new user sees — a short back-and-forth that collects a
// name, a first task and its time, and asks for notifications. Nothing else in
// the first-run sequence starts until it's finished. (The about-you question
// is the second open's, CatchUpDialog; Anna, Nov 4 2026.)
//
// Whether it has been done belongs to the ACCOUNT, not the phone: the flag is
// copied down from the profile before this mounts, and an account that has an
// about-me (answered in the chat back when it asked, in the catch-up, or in
// Settings) counts as done even if the flag was lost — so a reinstall or a new
// phone never asks twice. A name alone is NOT done: it is the first answer, and someone who closed the app right after it
// (Anna, Nov 4 2026, on the iPhone, closing it for an update halfway through:
// "if somebody doesn't complete the whole thing, it needs to come back") gets
// the chat back on the next open at the beat they left (resumeScript).
// Having a name used to count as finished, so the chat never returned.
//
// An account with history is never "new" either, whatever this phone
// remembers. The done-flag only started living on the account partway
// through, and a page-tour version bump erases the older on-phone evidence, so
// people who had used the app for weeks were greeted as brand new ("welcome to
// ADHDone… let's get you a first win"). They get the short "welcome back"
// catch-up instead. A replay requested for the account (testing a first run)
// still gets the real first run.
const EXISTING_ACCOUNT_DAYS = 3;

const accountIsOld = (user) => {
  const created = Date.parse(user?.created_date || '');
  return !isNaN(created) && Date.now() - created > EXISTING_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
};

async function accountHasTasks() {
  try {
    const rows = await base44.entities.Task.list('-created_date', 1);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

async function accountHasHistory(user) {
  if (accountIsOld(user)) return true;
  return accountHasTasks();
}

export default function WelcomeDialog({ user }) {
  // 'welcome' = the first-run conversation, 'resume' = the same one picked
  // back up after the name, 'catchup' = the returning-user one.
  const [mode, setMode] = useState(null);
  // Which beats the picked-up chat may skip: a task already on the list, the
  // notifications question already answered on this account.
  const [resumeOpts, setResumeOpts] = useState({ hasTask: false, notifyAnswered: false });

  useEffect(() => {
    if (!user) return undefined;
    if (isStepDone(ONBOARDING_STEPS.welcome)) return undefined;
    // An about-me means they got past the chat (it asked that question until
    // Nov 4 2026, and the catch-up asks it only once the chat is done). An
    // account older than a few days with a name is done too, as before.
    if (user.about_me || (user.preferred_name && accountIsOld(user))) {
      markStepDone(ONBOARDING_STEPS.welcome);
      return undefined;
    }
    let cancelled = false;
    // A new account with a name and no finished chat: pick it back up.
    if (user.preferred_name && !wasReplayedThisSession()) {
      accountHasTasks().then((hasTask) => {
        if (cancelled || isStepDone(ONBOARDING_STEPS.welcome)) return;
        const notifyAnswered = isStepDone(ONBOARDING_STEPS.permissions);
        // Everything the chat asks is already answered (they closed it on its
        // closing line, or on the about-you beat it had until Nov 4 2026):
        // nothing to pick up, so it counts as finished without reopening —
        // a chat that only says "welcome back" and "you're set" is noise.
        if (hasTask && notifyAnswered) { finishQuietly(); return; }
        setResumeOpts({ hasTask, notifyAnswered });
        setMode('resume');
      });
      return () => { cancelled = true; };
    }
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

  // Done without a chat on screen: the same flags "Let's go" sets, minus the
  // hold that keeps the name re-ask off this sitting (nothing was shown).
  const finishQuietly = () => {
    markStepDone(ONBOARDING_STEPS.welcome);
    if (!isStepDone(ONBOARDING_STEPS.guideSeen)) markStepDone(ONBOARDING_STEPS.guideNudge);
    markStepDone(ONBOARDING_STEPS.homeTour);
  };

  const handleClose = () => {
    setMode(null);
    markStepDone(ONBOARDING_STEPS.welcome);
    // The chat is over: point them at the App Guide next (a red dot on the
    // menu and on the guide's row, gone once they open it). Either chat —
    // the first-run one or the welcome-back one — counts as "done with
    // onboarding"; someone who already opened the guide gets no dot.
    if (!isStepDone(ONBOARDING_STEPS.guideSeen)) markStepDone(ONBOARDING_STEPS.guideNudge);
    // Finished without a name (the catch-up chat can be)? CatchUpDialog asks
    // for it once more — on a LATER open, not the moment this closes.
    // (sessionStorage: gone when the app is next launched.)
    try { sessionStorage.setItem('onboarding_name_retry_hold', '1'); } catch (e) {}
    // There is no Home tour any more; its step is what releases what comes
    // after the welcome (the notifications card for a new account, the alarm
    // question). It's released here, when the chat closes — releasing it any
    // earlier let the next popup land on top of the chat.
    markStepDone(ONBOARDING_STEPS.homeTour);
  };

  // Swiped away, tapped outside, or the phone's back button mid-chat: that is
  // a pause, not an answer. Nothing is marked done, so the chat comes back on
  // the next open at the beat they left (the same rule as closing the app).
  // Only "Let's go" at the end (onDone) finishes it. The catch-up chat is
  // the one exception: it was already marked done before it opened.
  const handleDismiss = () => {
    if (mode === 'catchup') { handleClose(); return; }
    setMode(null);
  };

  // Same choice the catch-up dialog makes: never ask for a name we already have.
  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  const catchUpScript = knownName ? CATCH_UP_ABOUT_ONLY_SCRIPT : CATCH_UP_SCRIPT;
  // One script object for the whole chat: WelcomeChat steps through it by index.
  const pickedUpScript = useMemo(() => resumeScript(resumeOpts), [resumeOpts]);

  return (
    <Dialog open={!!mode} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0 bg-card text-card-foreground border-border">
        <div className="pt-2">
          {mode === 'catchup' ? (
            <WelcomeChat onDone={handleClose} script={catchUpScript} initialName={knownName} />
          ) : mode === 'resume' ? (
            <WelcomeChat onDone={handleClose} script={pickedUpScript} initialName={knownName} />
          ) : (
            <WelcomeChat onDone={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
