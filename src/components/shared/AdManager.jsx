import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAdMob, showInterstitialAd, resetAdLaunchState } from '@/lib/admob';
import { anyPopupOpen } from '@/components/onboarding/onboardingSurface';

const AD_OPEN_KEY = 'admgr_open_count';
const LAST_LAUNCH_KEY = 'admgr_last_launch_at';
// Coming back after this long away counts as a fresh launch. Android keeps
// frequently-used apps alive in memory, so cold starts alone were rare enough
// that qualifying launches almost never came around.
const NEW_LAUNCH_GAP_MS = 30 * 60 * 1000;

// WHEN the ad shows (Anna, Oct 8 2026: "the user could have been in the middle
// of something important and it would have showed up"). Until now the open
// that was due an ad got it on a clock, about 15 seconds in, whatever the
// person was doing. Now the open's ad is OWED, and it only shows at a pause
// the person just made themselves:
//   - they checked a task off — 4 seconds on: the confetti (2.2 s) is over
//     and they've had 4 seconds for Undo (Anna, Oct 8 2026: "four seconds is
//     a long time to press undo"; the toast's last second sits under the ad),
//     and only if they haven't tapped anything since;
//   - they added a task — once the capture has settled.
// If neither happens, the owed ad falls back to the next page switch, but
// only once they've been in the app a while (so the task pauses get their
// chance first), and only onto a page where an ad makes sense. An open that
// ends with no pause at all shows no ad — it is not carried to the next open.
// Nothing here waits on a timer and retries: a pause that isn't quiet when
// it comes is simply let go, and the next one is waited for.
const AFTER_TASK_DONE_MS = 4000;
const AFTER_TASK_ADDED_MS = 3000;
// Past the tap that switched the page, so it doesn't read as mid-something.
const AFTER_PAGE_SWITCH_MS = 2500;
// No ad inside the first moments of an open, whatever happened.
const MIN_OPEN_AGE_MS = 10 * 1000;
// A page switch only counts as the fallback after this long in the app.
const PAGE_SWITCH_AFTER_MS = 45 * 1000;
// A tap or key in the last moment means they're mid-something, not pausing.
const RECENT_TAP_MS = 2000;
// Never on these pages: the alarm screen (TaskNotification), the Focus Timer,
// Record Notes, or the add-a-task page (they're about to type).
const NO_AD_PAGE = /^\/(tasknotification|focustimer|notes|addtask)(\/|$)/i;

// Module-level on purpose: Layout remounts this component on every route
// change, and this is one open's state, not one page's.
let launchCount = 0;
let openStartedAt = 0;
let owedThisOpen = false;
let signedUpAt = null;     // null until the profile is here
let lastTapAt = 0;
let lastPathname = null;
let pendingTimer = null;

function isCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

function isUserBusy() {
  const el = document.activeElement;
  if (el) {
    const tag = el.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return true;
    if (el.isContentEditable || el.contentEditable === 'true') return true;
  }
  if (window.__microphoneActive) return true;
  // Recording notes (Notes page): an ad would interrupt it, and its sound would
  // end up in the recording.
  if (window.__notesRecording) return true;
  if (document.querySelector('[data-mic-active="true"]')) return true;
  return Date.now() - lastTapAt < RECENT_TAP_MS;
}

// Which opens get an ad: the 2nd, then every 3rd after that (5th, 8th, …).
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
function inGrace(signedUp, count) {
  if (count > GRACE_OPENS) return false;
  // Not known yet (the profile hasn't loaded): treat as new rather than risk
  // an ad on someone's first day.
  if (signedUp === null) return true;
  const t = Date.parse(signedUp || '');
  if (!Number.isFinite(t)) return false; // an old account with no sign-up date
  return Date.now() - t < GRACE_DAYS * 24 * 60 * 60 * 1000;
}

function cancelPending() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
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
  launchCount = count;
  openStartedAt = Date.now();
  owedThisOpen = shouldShowAd(count);
  lastPathname = window.location.pathname;
  resetAdLaunchState();
  cancelPending();
  return true;
}

// The pause has arrived: show the owed ad if the screen really is quiet,
// otherwise let this pause go and wait for the next one.
async function attempt(source) {
  pendingTimer = null;
  if (!owedThisOpen) return;
  if (document.visibilityState === 'hidden') return;
  if (inGrace(signedUpAt, launchCount)) {
    owedThisOpen = false;
    return;
  }
  if (Date.now() - openStartedAt < MIN_OPEN_AGE_MS) return;
  if (NO_AD_PAGE.test(window.location.pathname)) return;
  if (anyPopupOpen() || isUserBusy()) return;
  try {
    if (await showInterstitialAd(source)) owedThisOpen = false;
  } catch (e) {
    /* nothing to show; the next pause gets its turn */
  }
}

function atPause(source, delayMs) {
  if (!owedThisOpen) return;
  cancelPending();
  pendingTimer = setTimeout(() => attempt(source), delayMs);
}

export default function AdManager({ user }) {
  const location = useLocation();

  // When this account signed up (null until the profile is here), read again
  // at show time: the grace is judged then, because the profile usually
  // arrives after the launch was counted.
  useEffect(() => {
    signedUpAt = user ? (user.signed_up_at || user.created_date || '') : null;
  }, [user?.signed_up_at, user?.created_date, !!user]);

  useEffect(() => {
    if (!isCapacitor()) return;
    initAdMob().catch(() => {});
    registerLaunch();

    const onTaskDone = () => atPause('task_done', AFTER_TASK_DONE_MS);
    const onTaskAdded = () => atPause('task_added', AFTER_TASK_ADDED_MS);
    const onTap = () => { lastTapAt = Date.now(); };
    window.addEventListener('task-done', onTaskDone);
    window.addEventListener('task-created', onTaskAdded);
    window.addEventListener('pointerdown', onTap, true);
    window.addEventListener('keydown', onTap, true);

    let handle = null;
    (async () => {
      try {
        const { App } = window.Capacitor.Plugins;
        handle = await App.addListener('appStateChange', ({ isActive }) => {
          // Left the app: no ad may land on top of whatever they switched to.
          if (!isActive) {
            cancelPending();
            return;
          }
          registerLaunch();
        });
      } catch (e) {}
    })();

    return () => {
      window.removeEventListener('task-done', onTaskDone);
      window.removeEventListener('task-created', onTaskAdded);
      window.removeEventListener('pointerdown', onTap, true);
      window.removeEventListener('keydown', onTap, true);
      handle?.remove?.();
    };
  }, []);

  // The fallback: a page switch, once they've been in the app a while without
  // a task pause, onto a page where an ad makes sense.
  useEffect(() => {
    if (!isCapacitor()) return;
    const path = location.pathname;
    const switched = lastPathname !== null && lastPathname !== path;
    lastPathname = path;
    if (!switched || !owedThisOpen) return;
    if (Date.now() - openStartedAt < PAGE_SWITCH_AFTER_MS) return;
    if (NO_AD_PAGE.test(path)) return;
    atPause('page_switch', AFTER_PAGE_SWITCH_MS);
  }, [location.pathname]);

  return null;
}
