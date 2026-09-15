import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/4453371625';

let AdMob = null;
let initPromise = null;      // the actual init promise, so callers can await it
let adInFlight = false;      // single-flight: one prepare/show at a time
let shownThisLaunch = false; // at most one interstitial per app launch

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
        console.warn('[AdMob] consent step failed, skipping ads:', e);
        return false;
      }

      // The plugin dispatches MobileAds.initialize() without awaiting it,
      // so give the SDK a moment to finish its first-run config fetch.
      await new Promise(r => setTimeout(r, 3000));

      AdMob = plugin;
      console.log('[AdMob] ready');
      return true;
    } catch (e) {
      console.warn('[AdMob] init failed:', e);
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
  if (shownThisLaunch || adInFlight) return false;   // once per launch, single-flight
  const ready = await initAdMob();                   // never request before init+consent
  if (!ready || !AdMob) return false;

  adInFlight = true;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ID, isTesting: false });
    shownThisLaunch = true;              // set before show so a retry can't double-show
    await AdMob.showInterstitial();
    return true;
  } catch (e) {
    // No-fill / load failure / consent refusal all land here: just don't show.
    console.warn('[AdMob] interstitial skipped:', e);
    return false;
  } finally {
    adInFlight = false;
  }
}