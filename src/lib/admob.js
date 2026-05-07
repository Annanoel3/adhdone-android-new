import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/4453371625';
const SHOW_EVERY_N_OPENS = 3; // Show ad every 3rd app open

let AdMob = null;

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    AdMob = registerPlugin('AdMob');
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

/**
 * Call once on app launch. Shows an ad every Nth open automatically.
 * Returns true if an ad was shown.
 */
export async function maybeShowAdOnOpen() {
  const count = parseInt(localStorage.getItem('appOpenCount') || '0') + 1;
  localStorage.setItem('appOpenCount', String(count));

  if (count % SHOW_EVERY_N_OPENS === 0) {
    const shown = await showInterstitialAd();
    if (!shown) return false;
    return true;
  }
  return false;
}