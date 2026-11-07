import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HomeBaseFields from '@/components/settings/HomeBaseFields';
import { base44 } from '@/api/base44Client';
import { usePopupTurn } from '@/components/onboarding/onboardingSurface';
import { ONBOARDING_STEPS, isStepDone } from '@/components/onboarding/onboardingGate';
import { trackFire } from '@/lib/appTrack';

// v2: the prompt moved from "on launch" to "first errand", so everyone who
// hasn't actually saved a home base yet gets one more chance to see it.
const SEEN_KEY = 'home_zip_prompt_seen_v2';
// When their first errand went in (this phone). Starts with "onboarding_" so a
// different account signing in on this phone starts fresh (onboardingSync).
const ERRAND_AT_KEY = 'onboarding_home_errand_at';
const LATER_MS = 4 * 60 * 60 * 1000;

// One-time, skippable ask for a home base. Only asked the first time the user
// creates something that actually leaves the house (an errand / a task with a
// location) — that's the moment it's useful, so the ask makes sense instead of
// arriving out of nowhere on launch.
export default function HomeZipPrompt({ user, theme }) {
  const [open, setOpen] = useState(false);
  // Takes its turn with other popups (never stacks on one) and waits for a
  // calm moment: nothing else up, and not while they're typing or tapping.
  const shown = usePopupTurn(open);
  // Second step, only after home base is saved: commuters get far more out of
  // this than anyone else, but asking about work up front would bury the ask
  // that actually matters.
  const [step, setStep] = useState('home');
  const navigate = useNavigate();

  // Counted (AppEvent `home_prompt`, props.action shown / home_saved /
  // not_now / add_work, props.step) since Nov 2 2026: until then only an
  // answer left a mark (home_zip_prompt_seen_v2), so nobody could say how
  // many people it had been shown to (Anna: "How many people have gotten
  // the places popup?").
  useEffect(() => {
    if (shown) trackFire('home_prompt', { props: { action: 'shown', step } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    if (!user) return;
    // Saved on the profile too, so a new device / cleared browser storage
    // doesn't start asking all over again.
    if (localStorage.getItem(SEEN_KEY) === 'true' || user.home_zip_prompt_seen_v2) return;
    if (user.home_lat != null && user.home_lng != null) {
      localStorage.setItem(SEEN_KEY, 'true');
      return;
    }
    // Timing (Anna, Nov 6 2026: "it happens like 5 seconds after onboarding
    // ends. horrible timing" while she was typing her next task). It opened
    // the moment the first errand went in, and the welcome chat's own first
    // task is often an errand, so it landed right as the chat closed. That
    // trigger came from Base44's builder on Sep 10 2026 ("first errand"
    // instead of on launch), and Sep 24 made it show the instant the screen
    // was free. Now the first errand is only noted, and the question waits
    // for a later visit: at least 4 hours after that errand, with the welcome
    // chat and the Home tour done, a few seconds into the visit, when nothing
    // else is up and they aren't typing.
    let cancelled = false;
    const tryAsk = () => {
      if (cancelled) return;
      let at = 0;
      try { at = Number(localStorage.getItem(ERRAND_AT_KEY)) || 0; } catch (e) { at = 0; }
      if (!at || Date.now() - at < LATER_MS) return;
      if (!isStepDone(ONBOARDING_STEPS.welcome) || !isStepDone(ONBOARDING_STEPS.homeTour)) return;
      setOpen(true);
    };
    const onErrand = () => {
      try {
        if (!localStorage.getItem(ERRAND_AT_KEY)) localStorage.setItem(ERRAND_AT_KEY, String(Date.now()));
      } catch (e) { /* asked after a later errand, then */ }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTimeout(tryAsk, 8000);
    };
    window.addEventListener('errand-task-created', onErrand);
    document.addEventListener('visibilitychange', onVisible);
    const first = setTimeout(tryAsk, 8000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      window.removeEventListener('errand-task-created', onErrand);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const dismiss = () => {
    trackFire('home_prompt', { props: { action: 'not_now', step } });
    localStorage.setItem(SEEN_KEY, 'true');
    setOpen(false);
    base44.auth.updateMe({ home_zip_prompt_seen_v2: true }).catch(() => {});
  };

  const goToPlaces = () => {
    trackFire('home_prompt', { props: { action: 'add_work', step } });
    localStorage.setItem(SEEN_KEY, 'true');
    setOpen(false);
    base44.auth.updateMe({ home_zip_prompt_seen_v2: true }).catch(() => {});
    // Places is a Settings section since Nov 2 2026.
    navigate('/settings?section=places');
  };

  if (step === 'work') {
    return (
      <Dialog open={shown} onOpenChange={(o) => { if (!o) dismiss(); }}>
        <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Briefcase className="w-5 h-5" />
              Got it. Do you commute to a job?
            </DialogTitle>
            <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
              Add your work address and start time, and I'll watch the traffic and tell you when
              to head out. Changing schedules are fine; enter them a week at a time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={dismiss}>No / not now</Button>
            <Button onClick={goToPlaces} className="bg-green-600 hover:bg-green-700 text-white">
              Add work &amp; schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
            <MapPin className="w-5 h-5" />
            Where's home base?
          </DialogTitle>
          <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
            Drop a circle over your general area and I can tell you when to leave for things,
            with real traffic, and group nearby errands into one trip. No exact address, no
            tracking.
          </DialogDescription>
        </DialogHeader>

        <HomeBaseFields user={user} theme={theme} onSaved={() => { trackFire('home_prompt', { props: { action: 'home_saved', step: 'home' } }); setStep('work'); }} compact />

        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Totally optional — you can add or change it any time in <strong>Settings → Places</strong>.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>Not now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}