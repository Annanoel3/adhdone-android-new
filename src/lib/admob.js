import { Capacitor, registerPlugin } from '@capacitor/core';
import { trackFire } from '@/lib/appTrack';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/4453371625';

let AdMob = null;
let initPromise = null;      // the actual init promise, so callers can await it
let adInFlight = false;      // single-flight: one prepare/show at a time
let shownThisLaunch = false; // at most one interstitial per app launch

// Every ad failure used to be swallowed, so "I'm getting no ads" was
// undiagnosable. Each attempt now records WHY it ended the way it did.
export function getLastAdStatus() {
  return localStorage.getItem('admob_last_status') || 'no attempt yet';
}
function setStatus(msg) {
  localStorage.setItem('admob_last_status', `${new Date().toLocaleTimeString()} — ${msg}`);
}

export function initAdMob() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const plugin = registerPlugin('AdMob');
      await plugin.initialize({ initializeForTesting: false });

      // UMP consent BEFORE any ad request.
      try {
        const info = await plugin.requestConsentInfo();
        if (info?.isConsentFormAvailable && info.status === 'REQUIRED') {
          await plugin.showConsentForm();
        }
      } catch (e) {
        // A missing/misconfigured UMP form is NOT a reason to stop serving ads —
        // consent is only required for EEA/UK users, and the form lives in the
        // AdMob console, not here. Note it and carry on with the ad request.
        // Kept OUT of the ad-attempt status: this note was being read as "the
        // last ad failed", when in fact no ad had even been requested yet.
        console.warn('[AdMob] consent step skipped:', e);
        localStorage.setItem('admob_consent_note', `${new Date().toLocaleTimeString()} — ${e?.message || e}`);
      }

      // The plugin dispatches MobileAds.initialize() without awaiting it,
      // so give the SDK a moment to finish its first-run config fetch.
      await new Promise(r => setTimeout(r, 3000));

      AdMob = plugin;
      console.log('[AdMob] ready');
      return true;
    } catch (e) {
      console.warn('[AdMob] init failed:', e);
      setStatus(`init failed: ${e?.message || e}`);
      AdMob = null;
      return false;
    }
  })();
  return initPromise;
}

// A "launch" is no longer only a cold start — returning after a long time away
// counts too, so the once-per-launch guard has to be clearable.
export function resetAdLaunchState() {
  shownThisLaunch = false;
}

// `source` says WHO asked for the ad — the pause it showed at ('task_done',
// 'task_added', or the 'page_switch' fallback; see AdManager) or 'manual' for
// the diagnostics test button — so they can be told apart in the per-user
// numbers. Until Oct 8 2026 it was 'auto': a clock, ~15 s into the open.
// Never while the phone is recording notes: an ad would interrupt, and its sound
// would be recorded. The Notes page sets window.__notesRecording, but a recording
// keeps going when the page isn't open, so the phone is asked directly too.
// Only while ADHDone is the app on screen. Timers keep running for a while after
// someone switches to another app, and an interstitial shown then pulls ADHDone
// back up over whatever they're doing (AdMob's rules also forbid ads that show
// while the app isn't in use).
const NOT_ON_SCREEN = 'skipped: app not on screen';
export function adWaitingForScreen() {
  return getLastAdStatus().endsWith(NOT_ON_SCREEN);
}
async function appOnScreen() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  try {
    const App = window.Capacitor?.Plugins?.App;
    if (App?.getState) {
      const st = await App.getState();
      if (st && st.isActive === false) return false;
    }
  } catch (e) { /* go by the page's own answer */ }
  return true;
}

async function isRecordingNotes() {
  if (window.__notesRecording) return true;
  try {
    const R = window.Capacitor?.Plugins?.RecorderBridge;
    if (!R) return false;
    const st = await R.status();
    return !!st?.recording;
  } catch (e) {
    return false;
  }
}

// The ad unit above belongs to the Android app in AdMob. AdMob ad units are
// made per app and per platform, so the iPhone app needs its own (an iPhone
// app added in AdMob, its ad unit pasted here). Until then the iPhone app
// shows no ads rather than Android's (Anna, Oct 22 2026).
const IOS_AD_UNIT_ID = '';
const adUnitId = () => (Capacitor.getPlatform() === 'ios' ? IOS_AD_UNIT_ID : AD_UNIT_ID);

// The owed ad is loaded AHEAD of the pause it shows at, so it can show the
// moment the pause comes (Anna, Oct 24 2026: "Seems like theres an
// intentional pause between adding a task and an ad. It should be way more
// immediate." — the ad only started loading once the pause had come, a few
// more seconds on top of the wait). AdManager calls this as soon as an open
// is owed an ad. A loaded interstitial goes stale after an hour, so one older
// than PRELOAD_FRESH_MS is loaded again at show time instead of used.
const PRELOAD_FRESH_MS = 50 * 60 * 1000;
let preloadedAt = 0;   // when the ad waiting to be shown finished loading (0 = none)
let preloading = null; // the load on its way, so it's never requested twice

function takePreloaded() {
  const fresh = preloadedAt > 0 && Date.now() - preloadedAt < PRELOAD_FRESH_MS;
  preloadedAt = 0;
  return fresh;
}

export function preloadInterstitialAd() {
  if (Capacitor.getPlatform() === 'ios' && !IOS_AD_UNIT_ID) return Promise.resolve(false);
  if (preloadedAt > 0 && Date.now() - preloadedAt < PRELOAD_FRESH_MS) return Promise.resolve(true);
  if (preloading) return preloading;
  if (adInFlight || shownThisLaunch) return Promise.resolve(false);
  preloading = (async () => {
    try {
      const ready = await initAdMob();               // never request before init+consent
      if (!ready || !AdMob) return false;
      await AdMob.prepareInterstitial({ adId: adUnitId(), isTesting: false });
      preloadedAt = Date.now();
      return true;
    } catch (e) {
      // No fill right now: the pause loads one itself, as it always did.
      console.warn('[AdMob] preload failed:', e);
      preloadedAt = 0;
      return false;
    } finally {
      preloading = null;
    }
  })();
  return preloading;
}

export async function showInterstitialAd(source = 'auto') {
  if (Capacitor.getPlatform() === 'ios' && !IOS_AD_UNIT_ID) {
    setStatus('skipped: no iPhone ad unit yet');
    return false;
  }
  if (!(await appOnScreen())) {
    setStatus(NOT_ON_SCREEN);
    trackFire('ad_skipped', { props: { source, reason: 'app not on screen' } });
    return false;
  }
  if (await isRecordingNotes()) {
    setStatus('skipped: recording notes');
    trackFire('ad_skipped', { props: { source, reason: 'recording notes' } });
    return false;
  }
  if (shownThisLaunch || adInFlight) {
    const reason = shownThisLaunch ? 'already shown this launch' : 'another attempt in flight';
    setStatus(`skipped: ${reason}`);
    trackFire('ad_skipped', { props: { source, reason } });
    return false;
  }
  const ready = await initAdMob();                   // never request before init+consent
  if (!ready || !AdMob) {
    setStatus('skipped: AdMob not initialized');
    trackFire('ad_skipped', { props: { source, reason: 'not initialized' } });
    return false;
  }

  adInFlight = true;
  try {
    // A preload still on its way is waited for rather than requested twice.
    if (preloading) await preloading;
    const usePreloaded = takePreloaded();
    // Only without one loaded ahead does it load now (a few seconds).
    if (!usePreloaded) await AdMob.prepareInterstitial({ adId: adUnitId(), isTesting: false });
    // Loading takes a few seconds; recording may have started meanwhile, or
    // they may have switched to another app.
    if (await isRecordingNotes()) {
      setStatus('skipped: recording notes');
      trackFire('ad_skipped', { props: { source, reason: 'recording notes' } });
      return false;
    }
    if (!(await appOnScreen())) {
      setStatus(NOT_ON_SCREEN);
      trackFire('ad_skipped', { props: { source, reason: 'app not on screen' } });
      return false;
    }
    shownThisLaunch = true;              // set before show so a retry can't double-show
    try {
      await AdMob.showInterstitial();
    } catch (e) {
      // The ad loaded ahead may have gone stale: one fresh load before giving up.
      if (!usePreloaded) throw e;
      await AdMob.prepareInterstitial({ adId: adUnitId(), isTesting: false });
      if (await isRecordingNotes() || !(await appOnScreen())) {
        shownThisLaunch = false;
        setStatus('skipped: recording notes or app not on screen (after reloading a stale ad)');
        trackFire('ad_skipped', { props: { source, reason: 'busy after stale reload' } });
        return false;
      }
      await AdMob.showInterstitial();
    }
    setStatus(usePreloaded ? 'shown (loaded ahead)' : 'shown');
    trackFire('ad_shown', {
      props: {
        source,
        open_count: parseInt(localStorage.getItem('admgr_open_count') || '0', 10),
      },
    });
    return true;
  } catch (e) {
    // No-fill / load failure / consent refusal all land here: just don't show.
    console.warn('[AdMob] interstitial skipped:', e);
    setStatus(`ad request failed: ${e?.message || e}`);
    trackFire('ad_failed', { props: { source, error: String(e?.message || e).slice(0, 200) } });
    return false;
  } finally {
    adInFlight = false;
  }
}