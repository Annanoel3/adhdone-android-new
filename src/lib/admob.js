import { Capacitor, registerPlugin } from '@capacitor/core';

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
        console.warn('[AdMob] consent step skipped:', e);
        setStatus(`consent unavailable (continuing): ${e?.message || e}`);
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

export async function showInterstitialAd() {
  if (shownThisLaunch || adInFlight) {
    setStatus(shownThisLaunch ? 'skipped: already shown this launch' : 'skipped: another attempt in flight');
    return false;
  }
  const ready = await initAdMob();                   // never request before init+consent
  if (!ready || !AdMob) {
    setStatus('skipped: AdMob not initialized');
    return false;
  }

  adInFlight = true;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ID, isTesting: false });
    shownThisLaunch = true;              // set before show so a retry can't double-show
    await AdMob.showInterstitial();
    setStatus('shown');
    return true;
  } catch (e) {
    // No-fill / load failure / consent refusal all land here: just don't show.
    console.warn('[AdMob] interstitial skipped:', e);
    setStatus(`ad request failed: ${e?.message || e}`);
    return false;
  } finally {
    adInFlight = false;
  }
}