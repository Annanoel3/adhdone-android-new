// Our own full-screen ad going up over the app.
//
// On Android the ad is its own screen: the moment it shows, the app's page
// goes "hidden" exactly as if the person had left. TaskCaptureProcessor hands
// every unfinished task to the server when the page goes hidden (the person
// is gone and Android may stop the app). Under our own ad nobody has left and
// the app keeps running, so that one "hidden" must not be taken for leaving.
// It matters since Nov 16 2026: the ad after adding a task now shows while
// the task is still being set up (AdManager), and a hand-off there would have
// the server make the task instead of the app (no step checklist from the
// typed words, no day or priority question).
//
// admob.js marks the moment it asks the ad onto the screen. The processor
// asks once, when the page goes hidden. The mark answers ONE "hidden", and
// only for a few seconds, so anything later is a real leave again: the person
// leaving after the ad closed, or an ad that never came up.
//
// Android only: on the iPhone the ad is drawn over the page and the page
// stays visible, so a page going hidden there is always the person leaving.

const COVERS_WITHIN_MS = 10 * 1000;
let goingUpAt = 0;

export function markAdGoingUp() {
  goingUpAt = Date.now();
}

// The ad was asked for and did not show.
export function markAdNotShown() {
  goingUpAt = 0;
}

const onAndroid = () => {
  try { return window.Capacitor?.getPlatform?.() === 'android'; } catch (e) { return false; }
};

// Asked when the page goes hidden: was that our own ad covering it?
export function hiddenByOwnAd() {
  const fresh = goingUpAt > 0 && Date.now() - goingUpAt < COVERS_WITHIN_MS;
  goingUpAt = 0;
  return fresh && onAndroid();
}
