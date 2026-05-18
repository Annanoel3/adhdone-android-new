import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/4453371625';
const SHOW_EVERY_N_OPENS = 3;  // Show ad every 3rd app open
const AD_DELAY_MS = 15000;     // Wait 15 seconds before showing

let AdMob = null;
let hasShownAdThisLaunch = false;
let hasInitializedAdMob = false;

/**
 * Check if an input field is currently focused (user is typing)
 * or if the microphone is active (user is speaking)
 */
function isUserBusy() {
  const activeElement = document.activeElement;
  const isTyping = activeElement && (
    activeElement.tagName === 'INPUT' || 
    activeElement.tagName === 'TEXTAREA' || 
    activeElement.contentEditable === 'true'
  );
  const isMicActive = !!document.querySelector('[data-mic-active="true"]') ||
                      !!window.__microphoneActive;
  return isTyping || isMicActive;
}

export async function initAdMob() {
  if (hasInitializedAdMob) return;
  hasInitializedAdMob = true;

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

export async function maybeShowAdOnOpen() {
  if (hasShownAdThisLaunch) return;
  hasShownAdThisLaunch = true;

  // Use the same key as App.jsx
  const count = parseInt(localStorage.getItem('app_open_count') || '0');

  if (count % SHOW_EVERY_N_OPENS === 0) {
    // Wait 15 seconds before attempting to show the ad
    await new Promise(resolve => setTimeout(resolve, AD_DELAY_MS));
    
    // Wait until user is not typing or speaking
    await new Promise(resolve => {
      const check = () => {
        if (!isUserBusy()) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
    
    await showInterstitialAd();
  }
}