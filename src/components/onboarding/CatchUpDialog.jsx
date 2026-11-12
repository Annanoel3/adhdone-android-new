import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone, waitForStep } from './onboardingGate';
import { enterOnboardingSurface, exitOnboardingSurface, waitForCalm, popupsShownThisLaunch } from './onboardingSurface';
import WelcomeChat from './WelcomeChat';
import { base44 } from '@/api/base44Client';
import WELCOME_SCRIPT from './welcomeScript';
import CATCH_UP_SCRIPT, { CATCH_UP_ABOUT_ONLY_SCRIPT, FIRST_DONE_SCRIPT, FIRST_DONE_ABOUT_ONLY_SCRIPT, ABOUT_NOW_SCRIPT, ABOUT_NOW_ABOUT_ONLY_SCRIPT, NAME_ONLY_SCRIPT } from './catchUpScript';

// The name alone, asked once more for someone who closed the welcome chat
// before giving one (Anna, Oct 1 2026 — "for people like Rycher"). On a later
// open, once the screen is calm; closed again, they're left alone (Settings
// has the field).
const NAME_RETRY_STEP = 'onboarding_name_retry_done';
const NAME_RETRY_HOLD = 'onboarding_name_retry_hold';

// The full welcome again, for someone who skipped it entirely, with its first
// line swapped for a "you missed this" one.
const REWELCOME_SCRIPT = [
  { text: () => "Looks like you missed this the first time. It takes a minute and it's how ADHDone gets set up to remind you." },
  ...WELCOME_SCRIPT.slice(1),
];

// The name + about-me questions, for anyone whose profile is missing them and
// who was never asked: accounts that finished onboarding before those
// questions existed, new accounts that finished the welcome while it didn't
// ask (Sep 29 – Nov 1 2026) or closed it before its last question, and —
// since Nov 4 2026 — every new account, because the welcome chat no longer
// asks about-you at all: it is the SECOND open's question (Anna, Nov 4 2026:
// "Make about me on second open"). On a later app open, once the screen is
// calm. Until Nov 1 2026 it also waited for the first checked-off task, and
// almost nobody got it (3 of 16 new accounts); now a checked-off task only
// changes its opening line. Never the page tours.
//
// Asked once on its own. Skipped, or never shown because they never came
// back, the server sends one push about it two days on (cronDailyTips,
// sendAboutMeNudges); the tap opens Home with ?askAbout=1, and that opens
// the about-you question here once more, flag or no flag, as long as the
// profile still has no about-me.
const ASK_ABOUT_PARAM = 'askAbout';

export default function CatchUpDialog({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // 'catchup' = name (if missing) + about-you, on a later open; 'name' = the
  // name alone (see NAME_RETRY_STEP).
  const [kind, setKind] = useState('catchup');
  // Whether they've checked anything off: "First one done" opens it only then.
  const [doneOne, setDoneOne] = useState(false);
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
    // The welcome was closed in THIS sitting (before its about-you question):
    // not now, a later open.
    try { if (sessionStorage.getItem(NAME_RETRY_HOLD) === '1') return; } catch (e) {}
    checked.current = true;
    base44.entities.Task.filter({ status: 'completed' }, '-updated_date', 1)
      .catch(() => [])
      .then((rows) => {
        if (!mounted.current) return;
        const finishedOne = !!rows?.length;
        // Its turn: nothing else on screen (the name re-ask below, a tour, a
        // question), and the user not mid-tap.
        return waitForCalm().then(() => {
          if (!mounted.current || openRef.current) return;
          if (isStepDone(ONBOARDING_STEPS.catchUp)) return;
          // Another popup already had this open (a missed reminder, "What's
          // next?", the update card): this question waits for a later open,
          // so they never get two asks back to back.
          if (popupsShownThisLaunch() > 0) return;
          // Asked ONCE: the flag is written the moment it appears, not when it is
          // closed, so a sign-out before the flag reached the account (or a dialog
          // closed early) can't bring it back on the next sign-in. What the profile
          // already holds is never asked for again — see the script choice below.
          markStepDone(ONBOARDING_STEPS.catchUp);
          setDoneOne(finishedOne);
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
    // They tapped Skip on the name question: that was their answer.
    if (isStepDone(ONBOARDING_STEPS.nameSkipped)) return;
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

  // From the about-you push (?askAbout=1): the question again, even though it
  // was shown and skipped before. Nothing to ask once they have an about-me.
  const askedFromPush = new URLSearchParams(location.search).get(ASK_ABOUT_PARAM) === '1';
  useEffect(() => {
    if (!askedFromPush || !user || openRef.current) return undefined;
    if (String(user.about_me || '').trim()) return undefined;
    let cancelled = false;
    waitForCalm().then(() => {
      if (cancelled || !mounted.current || openRef.current) return;
      markStepDone(ONBOARDING_STEPS.catchUp);
      setDoneOne(false);
      setKind('catchup');
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, [askedFromPush, location.key, user?.id]);

  // askAbout=1 comes off the address when the question closes, not while it
  // is up (a navigation while open could remount the page around it).
  const dropAskParam = () => {
    const params = new URLSearchParams(location.search);
    if (params.get(ASK_ABOUT_PARAM) !== '1') return;
    params.delete(ASK_ABOUT_PARAM);
    const rest = params.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ''}`, { replace: true, state: location.state });
  };

  const knownName = (user?.preferred_name || user?.display_name || '').trim();
  // An account from after the first sitting was cut down gets the "first one
  // done" version when it has checked something off, the plain one when it
  // hasn't; an older one gets the welcome-back.
  const NEW_FLOW_SINCE = Date.parse('2026-09-29T00:00:00Z');
  const newFlow = Date.parse(user?.created_date || '') >= NEW_FLOW_SINCE;
  // A name they have, or a name question they skipped: either way it isn't
  // asked with the about-you question.
  const nameSettled = !!knownName || isStepDone(ONBOARDING_STEPS.nameSkipped);
  const script = kind === 'rewelcome'
    ? REWELCOME_SCRIPT
    : kind === 'name'
    ? NAME_ONLY_SCRIPT
    : newFlow
      ? (doneOne
        ? (nameSettled ? FIRST_DONE_ABOUT_ONLY_SCRIPT : FIRST_DONE_SCRIPT)
        : (nameSettled ? ABOUT_NOW_ABOUT_ONLY_SCRIPT : ABOUT_NOW_SCRIPT))
      : (nameSettled ? CATCH_UP_ABOUT_ONLY_SCRIPT : CATCH_UP_SCRIPT);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    dropAskParam();
    // The name re-ask doesn't stand in for the catch-up: the about-you
    // question still comes, on a later open.
    markStepDone(kind === 'name' ? NAME_RETRY_STEP : ONBOARDING_STEPS.catchUp);
    // Done with an onboarding chat: the App Guide's red dot (see
    // WelcomeDialog), unless they've opened the guide already.
    if (!isStepDone(ONBOARDING_STEPS.guideSeen)) markStepDone(ONBOARDING_STEPS.guideNudge);
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