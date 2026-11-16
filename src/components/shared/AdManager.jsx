import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAdMob, showInterstitialAd, resetAdLaunchState, preloadInterstitialAd } from '@/lib/admob';
import { anyPopupOpen } from '@/components/onboarding/onboardingSurface';
import { currentCaptures, subscribeCaptures } from '@/lib/pendingCaptures';

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
//   - they added a task — right then, while the task is set up underneath
//     (see AFTER_TASK_ADDED_MS for why it no longer waits for the save).
// If neither happens, the owed ad falls back to the next page switch, but
// only once they've been in the app a while (so the task pauses get their
// chance first), and only onto a page where an ad makes sense. An open that
// ends with no pause at all carries its ad to the next open (AD_OWED_KEY).
// Nothing here waits on a timer and retries: a pause that isn't quiet when
// it comes is simply let go, and the next one is waited for.
const AFTER_TASK_DONE_MS = 4000;
// Added a task: the pause is the Add itself (Anna, Nov 16 2026: "The ad
// should pop up when the task starts saving, not when it finishes. Because
// sometimes, it takes a while for a task to finish saving and so it kind of
// seems like that pops out of nowhere at bad timing."). Until then it waited
// for the capture to be finished, 10 to 20 seconds after the Add, by which
// time they were on to something else. Half a second, so the page the Add
// takes them to is drawn first (the task's card, still setting up) and that
// is what they come back to. The ad is loaded ahead (admob.js
// preloadInterstitialAd; Anna, Oct 24 2026: "It should be way more
// immediate"). The task goes on being made under the ad: on Android the ad
// covers the app the way leaving does, and TaskCaptureProcessor keeps the
// task with the app for that one moment (src/lib/adCover.js).
const AFTER_TASK_ADDED_MS = 500;
// Only a capture this new is "just added": one picked up from an earlier
// open, or simply still on the list when this component remounts, is not.
const JUST_ADDED_MS = 3000;
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
let pendingSource = null; // which pause the timer above is for
let addedAt = 0; // when the task whose ad is waiting (or last showed) was added
const seenCaptures = new Set(); // captures already looked at, by id

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

// ignoreTapsThrough: the tap that added a task is the pause itself, so for
// that ad only a tap AFTER it means they've moved on to something.
function isUserBusy(ignoreTapsThrough = 0) {
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
  if (lastTapAt <= ignoreTapsThrough) return false;
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
// AND the first 3 days, whichever ends LAST (Anna, Nov 1 2026: "I still don't
// want them to be hit with an ad on day 2. Here's what it really should have
// been... First 3 days or 3 opens, whatever comes last."). Opens alone let a
// 4th open land on day one or two, since any return 30+ minutes after the
// last counts as an open. 3 days = 72 hours from signing up, which always
// reaches past their third calendar day.
const GRACE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
let joinedAt = NaN; // when this account signed up (set from the user, below)
const toMs = (v) => {
  const s = String(v || '');
  if (!s) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};
// true = still in their first 3 days; null = not known yet (account loading).
function inFirstDays() {
  if (!Number.isFinite(joinedAt)) return null;
  return Date.now() - joinedAt < GRACE_DAYS_MS;
}
function inGrace(count) {
  return count <= GRACE_OPENS || inFirstDays() === true;
}

// A task they just added is still being set up (sorted, split, parsed, saved).
// An ad on top of it puts the app behind the ad half-way through (Oct 13 2026:
// "call propane ... today" had just been sorted when a page-switch ad showed
// 70 ms later; the task was never made, and that person never opened the app
// again). Anna's rule: an ad never interrupts someone mid-task. The one ad
// that does show over a task being set up is that task's own, right after
// the Add (task_added, Nov 16 2026).
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
  pendingSource = null;
}

// Load the owed ad now, so it can show the instant a pause comes.
function warmAd() {
  if (owedThisOpen && inFirstDays() !== true) preloadInterstitialAd().catch(() => {});
}

// A task was just added (typed, spoken or shared in): that is the pause. Run
// on every change to the capture list; each capture is looked at once, so
// one that splits into several tasks, or is still there when this component
// remounts on the next page, never asks twice.
function noticeNewCaptures(list) {
  const now = Date.now();
  const here = new Set();
  let newest = 0;
  for (const c of list || []) {
    here.add(c.id);
    if (seenCaptures.has(c.id)) continue;
    seenCaptures.add(c.id);
    if (c.resumed || c.held) continue; // left over from an earlier open
    const at = c.createdAt || 0;
    if (now - at <= JUST_ADDED_MS) newest = Math.max(newest, at);
  }
  for (const id of [...seenCaptures]) if (!here.has(id)) seenCaptures.delete(id);
  if (!newest || !owedThisOpen) return;
  addedAt = newest;
  // A task added inside the open's first moments waits for MIN_OPEN_AGE_MS
  // rather than losing the pause as "too soon". A tap after the Add still
  // lets it go (they're doing something).
  atPause('task_added', Math.max(AFTER_TASK_ADDED_MS, openStartedAt + MIN_OPEN_AGE_MS - now + 50));
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
  addedAt = 0;
  note(`open #${count}: ${owedThisOpen ? (carried && !shouldShowAd(count) ? 'an ad carried over from an earlier open, waiting for a pause' : 'an ad is due this open, waiting for a pause') : 'no ad due this open'}`);
  return true;
}

// The pause has arrived: show the owed ad if the screen really is quiet,
// otherwise let this pause go and wait for the next one.
async function attempt(source) {
  pendingTimer = null;
  pendingSource = null;
  if (!owedThisOpen) return;
  if (document.visibilityState === 'hidden') { note(`${source}: app not on screen`); return; }
  // Only the ad for the Add itself shows over a task being set up.
  const afterAdd = source === 'task_added';
  if (!afterAdd && taskBeingSetUp()) { note(`${source}: a task is still being set up`); return; }
  if (inGrace(launchCount)) {
    owedThisOpen = false;
    writeOwed(false);
    note(`${source}: ${launchCount <= GRACE_OPENS ? `one of the first ${GRACE_OPENS} opens` : 'their first 3 days'}, no ads yet`);
    return;
  }
  // Their sign-up time isn't loaded yet: wait for the next pause rather than
  // risk an ad in someone's first 3 days.
  if (inFirstDays() === null) { note(`${source}: account not loaded yet`); return; }
  if (Date.now() - openStartedAt < MIN_OPEN_AGE_MS) { note(`${source}: too soon after opening`); return; }
  if (NO_AD_PAGE.test(window.location.pathname)) { note(`${source}: no ads on ${window.location.pathname}`); return; }
  if (anyPopupOpen()) { note(`${source}: a popup is open`); return; }
  if (isUserBusy(afterAdd ? addedAt : 0)) { note(`${source}: typing, recording or just tapped`); return; }
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
  pendingSource = source;
  pendingTimer = setTimeout(() => attempt(source), delayMs);
}

export default function AdManager({ user }) {
  const location = useLocation();

  // Before the launch is counted below, so the first-3-days rule can apply to it.
  const joinedRaw = user?.signed_up_at || user?.created_date || '';
  useEffect(() => {
    const ms = toMs(joinedRaw);
    if (Number.isFinite(ms)) joinedAt = ms;
  }, [joinedRaw]);

  useEffect(() => {
    if (!isCapacitor()) return;
    initAdMob().catch(() => {});
    registerLaunch();
    warmAd();

    const onTaskDone = () => atPause('task_done', AFTER_TASK_DONE_MS);
    const stopWatchingCaptures = subscribeCaptures(noticeNewCaptures);
    const onTap = () => { lastTapAt = Date.now(); };
    window.addEventListener('task-done', onTaskDone);
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
          warmAd();
        });
      } catch (e) {}
    })();

    return () => {
      window.removeEventListener('task-done', onTaskDone);
      window.removeEventListener('pointerdown', onTap, true);
      window.removeEventListener('keydown', onTap, true);
      stopWatchingCaptures();
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
    // The Add itself took them to this page, and its ad is already on its way.
    if (pendingSource === 'task_added') return;
    atPause('page_switch', AFTER_PAGE_SWITCH_MS);
  }, [location.pathname]);

  return null;
}
