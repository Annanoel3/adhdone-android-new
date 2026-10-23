import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAdMob, showInterstitialAd, resetAdLaunchState } from '@/lib/admob';
import { anyPopupOpen } from '@/components/onboarding/onboardingSurface';
import { currentCaptures } from '@/lib/pendingCaptures';

const AD_OPEN_KEY = 'admgr_open_count';
const LAST_LAUNCH_KEY = 'admgr_last_launch_at';
// An owed ad that found no pause carries over to the next open (Anna, Oct 13
// 2026: owed opens that were short, or spent on Notes, forfeited their ad, and
// she went 3½ days with none). One flag, so two owed opens in a row still
// owe one ad, not two.
const AD_OWED_KEY = 'admgr_ad_owed';
const readOwed = () => { try { return localStorage.getItem(AD_OWED_KEY) === '1'; } catch (e) { return false; } };
const writeOwed = (owed) => { try { if (owed) localStorage.setItem(AD_OWED_KEY, '1'); else localStorage.removeItem(AD_OWED_KEY); } catch (e) { /* storage off */ } };
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
// ends with no pause at all carries its ad to the next open (AD_OWED_KEY).
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
let lastTapAt = 0;
let lastPathname = null;
let pendingTimer = null;

function isCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

// What this open did about its ad, for the owner's Ad Diagnostics card
// (Anna, Oct 13 2026: "I haven't gotten an ad in quite a while" — every pause
// that was let go was let go silently, so there was nothing to read). The
// phone keeps the last few lines; nothing is sent anywhere.
const NOTE_KEY = 'admgr_notes';
function note(msg) {
  try {
    const lines = JSON.parse(localStorage.getItem(NOTE_KEY) || '[]');
    lines.push(`${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${msg}`);
    localStorage.setItem(NOTE_KEY, JSON.stringify(lines.slice(-12)));
  } catch (e) { /* storage off */ }
}
export function getAdManagerNotes() {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '[]'); } catch (e) { return []; }
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

// Which opens get an ad: none of the first 3 (GRACE_OPENS, below), then the
// 4th and every 3rd open after it (7th, 10th, …): one ad every third open
// (Anna, Oct 8 2026). It used to be the 2nd, 5th, 8th, …, so once the first 3
// opens went ad-free the first ad fell on the 5th open, or on the 4th when the
// 2nd open's ad found no pause and carried over (Anna, Oct 18 2026: "Uh.
// What?").
function shouldShowAd(count) {
  return count >= 4 && (count - 4) % 3 === 0;
}

// No ads for the first 3 opens, however many days they're spread over (Anna,
// Oct 18 2026: "No ads for the first 3 opens"). It used to be the first 3
// days or the first 5 opens, whichever ended first, so someone coming back
// for the 2nd time after day 3 got an ad on that 2nd open — and every person
// whose 2nd open showed an ad stopped using the app (Ciara, Renee and Jess
// never opened it again after that ad). Before that, the 2nd open got an
// interstitial 15 seconds in — for one new user that was 8 hours after she
// signed up, right after a crash, and she never came back.
const GRACE_OPENS = 3;
function inGrace(count) {
  return count <= GRACE_OPENS;
}

// A task they just added is still being set up (sorted, split, parsed, saved).
// An ad on top of it puts the app behind the ad half-way through (Oct 13 2026:
// "call propane ... today" had just been sorted when a page-switch ad showed
// 70 ms later; the task was never made, and that person never opened the app
// again). Anna's rule: an ad never interrupts someone mid-task.
function taskBeingSetUp() {
  try {
    const now = Date.now();
    return currentCaptures().some((c) => !c.held && !c.handedOff
      && (c.started || now - (c.createdAt || 0) < 2 * 60 * 1000));
  } catch (e) {
    return false;
  }
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
  const carried = readOwed();
  // Nothing is owed during the first 3 opens, carried over or not.
  owedThisOpen = !inGrace(count) && (shouldShowAd(count) || carried);
  writeOwed(owedThisOpen);
  lastPathname = window.location.pathname;
  resetAdLaunchState();
  cancelPending();
  note(`open #${count}: ${owedThisOpen ? (carried && !shouldShowAd(count) ? 'an ad carried over from an earlier open, waiting for a pause' : 'an ad is due this open, waiting for a pause') : 'no ad due this open'}`);
  return true;
}

// The pause has arrived: show the owed ad if the screen really is quiet,
// otherwise let this pause go and wait for the next one.
async function attempt(source) {
  pendingTimer = null;
  if (!owedThisOpen) return;
  if (document.visibilityState === 'hidden') { note(`${source}: app not on screen`); return; }
  // Waits for the pause after the task is made (task_added) instead.
  if (taskBeingSetUp()) { note(`${source}: a task is still being set up`); return; }
  if (inGrace(launchCount)) {
    owedThisOpen = false;
    writeOwed(false);
    note(`${source}: one of the first ${GRACE_OPENS} opens, no ads yet`);
    return;
  }
  if (Date.now() - openStartedAt < MIN_OPEN_AGE_MS) { note(`${source}: too soon after opening`); return; }
  if (NO_AD_PAGE.test(window.location.pathname)) { note(`${source}: no ads on ${window.location.pathname}`); return; }
  if (anyPopupOpen()) { note(`${source}: a popup is open`); return; }
  if (isUserBusy()) { note(`${source}: typing, recording or just tapped`); return; }
  try {
    const shown = await showInterstitialAd(source);
    note(`${source}: ${shown ? 'ad shown' : 'no ad (see last attempt above)'}`);
    if (shown) {
      owedThisOpen = false;
      writeOwed(false);
    }
  } catch (e) {
    note(`${source}: ad request failed`);
  }
}

function atPause(source, delayMs) {
  if (!owedThisOpen) return;
  cancelPending();
  pendingTimer = setTimeout(() => attempt(source), delayMs);
}

export default function AdManager() {
  const location = useLocation();

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
