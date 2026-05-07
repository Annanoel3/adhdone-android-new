const AD_UNIT_ID = 'ca-app-pub-7979856440890193/4453371625';
const SHOW_EVERY_N_OPENS = 3;

let AdMob = null;

export async function initAdMob() {
  try {
    // Only runs in native Capacitor builds where window.Capacitor is injected
    if (!window.Capacitor?.isNativePlatform()) return;
    AdMob = window.Capacitor.Plugins.AdMob;
    if (!AdMob) return;
    await AdMob.initialize({ initializeForTesting: false });
    console.log('[AdMob] initialized');
  } catch (e) {
    console.warn('[AdMob] init failed:', e);
    AdMob = null;
  }
}

export async function showInterstitialAd() {
  if (!AdMob) return false;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ID, isTesting: false });
    await AdMob.showInterstitial();
    return true;
  } catch (e) {
    console.warn('[AdMob] interstitial failed:', e);
    return false;
  }
}

export async function maybeShowAdOnOpen() {
  const count = parseInt(localStorage.getItem('appOpenCount') || '0') + 1;
  localStorage.setItem('appOpenCount', String(count));

  if (count % SHOW_EVERY_N_OPENS === 0) {
    return await showInterstitialAd();
  }
  return false;
}