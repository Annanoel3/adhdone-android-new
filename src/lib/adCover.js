// Our own full-screen ad over the app: what the rest of the app needs to know
// about it. Since Nov 16 2026 the ad after adding a task shows while the task
// is still being set up (AdManager), so two things that used to be over by
// the time an ad came now happen underneath one.
//
// 1. THE TASK MUST STAY WITH THE APP (hiddenByOwnAd). On Android the ad is its
//    own screen: the moment it shows, the app's page goes "hidden" exactly as
//    if the person had left, and TaskCaptureProcessor hands every unfinished
//    task to the server when the page goes hidden (the person is gone and
//    Android may stop the app). Under our own ad nobody has left and the app
//    keeps running, so that one "hidden" must not be taken for leaving, or
//    the server makes the task instead of the app (no step checklist from the
//    typed words, no day or priority question). admob.js marks the moment it
//    asks the ad onto the screen; the processor asks once, when the page goes
//    hidden. The mark answers ONE "hidden", and only for a few seconds, so
//    anything later is a real leave again: the person leaving after the ad
//    closed, or an ad that never came up. Android only: on the iPhone the ad
//    is drawn over the page and the page stays visible, so a page going
//    hidden there is always the person leaving.
//
// 2. WHAT THE APP HAS TO SAY WAITS FOR THE AD TO CLOSE (whenAdGone, adUp).
//    Something typed in can turn out to be an idea, a birthday or a note for
//    ADHDone itself, and the only sign of where it went is a message that
//    shows for a few seconds. Shown under the ad it is gone before they are
//    back, and the thing they typed looks lost (Nov 1 2026: an idea that
//    "vanished" is why IdeaSavedNotice exists). So those messages are held
//    until the ad is gone. "Gone" is whichever comes first: the ad plugin
//    saying so (admob.js: interstitialAdDismissed / FailedToShow), the page
//    being back on screen after the ad hid it (Android), a tap or key landing
//    on the page (it can't while a full-screen ad covers it), or two minutes.

const COVERS_WITHIN_MS = 10 * 1000;
const MAX_UP_MS = 2 * 60 * 1000;
// A tap this soon after asking may have landed before the ad was drawn.
const TAP_PROVES_GONE_AFTER_MS = 2000;

let goingUpAt = 0;      // asked onto the screen; answers one "hidden" (Android)
let upSince = 0;        // on screen, as far as the app knows
let wentHidden = false; // the page went hidden under it (Android)
let waiting = [];
let maxTimer = null;
let listening = false;

const onAndroid = () => {
  try { return window.Capacitor?.getPlatform?.() === 'android'; } catch (e) { return false; }
};

function gone() {
  goingUpAt = 0;
  upSince = 0;
  wentHidden = false;
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  const run = waiting;
  waiting = [];
  run.forEach((fn) => { try { fn(); } catch (e) { console.error('[adCover] a held message failed:', e); } });
}

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (!upSince) return;
    if (document.visibilityState === 'hidden') wentHidden = true;
    else if (wentHidden) gone();
  });
  const touched = () => {
    if (upSince && Date.now() - upSince > TAP_PROVES_GONE_AFTER_MS) gone();
  };
  window.addEventListener('pointerdown', touched, true);
  window.addEventListener('keydown', touched, true);
}

// admob.js, just before it asks the ad onto the screen.
export function markAdGoingUp() {
  listen();
  goingUpAt = Date.now();
  upSince = goingUpAt;
  wentHidden = false;
  if (maxTimer) clearTimeout(maxTimer);
  maxTimer = setTimeout(gone, MAX_UP_MS);
}

// The ad was asked for and did not show.
export function markAdNotShown() {
  gone();
}

// The ad plugin says the ad is off the screen. On Android it can say so a
// moment before the page is back on screen: what is held then waits for the
// page (the listener above), because a message shown to a hidden page is the
// same as not shown.
export function markAdGone() {
  if (wentHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  gone();
}

// Is our ad on screen right now, as far as the app knows?
export function adUp() {
  return upSince > 0 && Date.now() - upSince < MAX_UP_MS;
}

// Runs fn now, or the moment the ad is gone if one is up.
export function whenAdGone(fn) {
  if (!adUp()) { fn(); return; }
  waiting.push(fn);
}

// Asked when the page goes hidden: was that our own ad covering it?
export function hiddenByOwnAd() {
  const fresh = goingUpAt > 0 && Date.now() - goingUpAt < COVERS_WITHIN_MS;
  goingUpAt = 0;
  return fresh && onAndroid();
}
