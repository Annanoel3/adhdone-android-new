import { useEffect, useRef } from 'react';
import { initAdMob, showInterstitialAd, resetAdLaunchState, adWaitingForScreen } from '@/lib/admob';

const AD_OPEN_KEY = 'admgr_open_count';
const LAST_LAUNCH_KEY = 'admgr_last_launch_at';
// Coming back after this long away counts as a fresh launch. Android keeps
// frequently-used apps alive in memory, so cold starts alone were rare enough
// that qualifying launches almost never came around.
const NEW_LAUNCH_GAP_MS = 30 * 60 * 1000;

function isCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

function isUserBusy() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return true;
  if (el.isContentEditable || el.contentEditable === 'true') return true;
  if (window.__microphoneActive) return true;
  // Recording notes (Notes page): an ad would interrupt it, and its sound would
  // end up in the recording.
  if (window.__notesRecording) return true;
  if (document.querySelector('[data-mic-active="true"]')) return true;
  return false;
}

function shouldShowAd(count) {
  if (count === 2) return true;
  if (count > 2 && (count - 2) % 3 === 0) return true;
  return false;
}

// No ads for a brand-new account: the first 3 days after signing up or the
// first 5 opens, whichever ends first. The 2nd open used to get an
// interstitial 15 seconds in — for one new user that was 8 hours after she
// signed up, right after a crash, and she never came back.
const GRACE_DAYS = 3;
const GRACE_OPENS = 5;
function inGrace(signedUpAt, count) {
  if (count > GRACE_OPENS) return false;
  // Not known yet (the profile hasn't loaded): treat as new rather than risk
  // an ad on someone's first day.
  if (signedUpAt === null) return true;
  const t = Date.parse(signedUpAt || '');
  if (!Number.isFinite(t)) return false; // an old account with no sign-up date
  return Date.now() - t < GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export default function AdManager({ user }) {
  const delayRef = useRef(null);
  const countRef = useRef(null);
  // When this account signed up (null until the profile is here) and this
  // launch's open count, read again at show time: the grace is judged then,
  // because the profile usually arrives after the launch was counted.
  const signedUpRef = useRef(null);
  const launchCountRef = useRef(0);
  useEffect(() => {
    signedUpRef.current = user ? (user.signed_up_at || user.created_date || '') : null;
  }, [user?.signed_up_at, user?.created_date, !!user]);
  // This launch is due an ad that hasn't shown yet. Switching to another app
  // cancels the countdown (an ad must never pop up over another app); coming
  // back picks it up again.
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!isCapacitor()) return;
    initAdMob().catch(() => {});

    function clearTimers() {
      if (delayRef.current) clearTimeout(delayRef.current);
      if (countRef.current) clearInterval(countRef.current);
      delayRef.current = null;
      countRef.current = null;
    }

    function tryShowAd() {
      delayRef.current = null;
      if (document.visibilityState === 'hidden') return; // picked up again on return
      if (inGrace(signedUpRef.current, launchCountRef.current)) {
        pendingRef.current = false;
        return;
      }
      if (isUserBusy()) {
        delayRef.current = setTimeout(tryShowAd, 5000);
        return;
      }
      // Five quiet seconds first: if they start typing or recording in that
      // window, the ad waits. Nothing is shown during the wait — the old
      // "Ad in 5…" badge counting down in the corner was its own annoyance.
      let c = 5;
      countRef.current = setInterval(() => {
        // Cancel if the user became busy (e.g. started recording) mid-wait
        if (isUserBusy()) {
          clearInterval(countRef.current);
          countRef.current = null;
          delayRef.current = setTimeout(tryShowAd, 30000);
          return;
        }
        c -= 1;
        if (c <= 0) {
          clearInterval(countRef.current);
          countRef.current = null;
          showInterstitialAd()
            .then(() => { pendingRef.current = adWaitingForScreen(); })
            .catch(() => { pendingRef.current = false; });
        }
      }, 1000);
    }

    // Counts a launch at most once per gap window, so route changes (which
    // remount this component) never inflate the count.
    // Returns true when this counted as a new launch.
    function registerLaunch() {
      const lastRaw = localStorage.getItem(LAST_LAUNCH_KEY);
      const lastMs = lastRaw ? parseInt(lastRaw, 10) : 0;
      if (Date.now() - lastMs < NEW_LAUNCH_GAP_MS) return false;

      localStorage.setItem(LAST_LAUNCH_KEY, String(Date.now()));
      const count = parseInt(localStorage.getItem(AD_OPEN_KEY) || '0', 10) + 1;
      localStorage.setItem(AD_OPEN_KEY, String(count));
      launchCountRef.current = count;

      resetAdLaunchState();
      clearTimers();
      pendingRef.current = shouldShowAd(count);
      if (pendingRef.current) delayRef.current = setTimeout(tryShowAd, 15000);
      return true;
    }

    registerLaunch();

    let handle = null;
    (async () => {
      try {
        const { App } = window.Capacitor.Plugins;
        handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            // Left the app: no ad may land on top of whatever they switched to.
            clearTimers();
            return;
          }
          if (!registerLaunch() && pendingRef.current) {
            // Back within the same launch, still owed its ad: the same wait again.
            clearTimers();
            delayRef.current = setTimeout(tryShowAd, 15000);
          }
        });
      } catch (e) {}
    })();

    return () => {
      clearTimers();
      handle?.remove?.();
    };
  }, []);

  return null;
}