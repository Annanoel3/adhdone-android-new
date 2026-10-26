// Which phone app is running this website (Anna, Oct 22 2026: "show certain
// things to android users only and then show only the things that work to
// iphone users. Like the wakeup thing. That cant be in the settings for iphone
// users and that popup cant happen either").
//
// The iPhone app (built by Haris) loads this same site, and some features only
// exist on Android because Apple doesn't let an iPhone app do them. Every one
// of those is listed in NOT_ON_IPHONE below, so the iPhone app never shows a
// setting, popup, tip or line of text for something it can't do. On Android and
// on the plain website nothing here changes anything: every check passes there.
//
// Apple also turns down iPhone apps that name other phone platforms on screen
// (App Review Guideline 2.3.10), so text that says "Android" uses phoneOs()
// instead, which says "your iPhone" there.
//
// Don't rely on "the plugin doesn't have that method" to hide an Android-only
// feature on iPhone: the iPhone plugins may grow a method of the same name.
// Check onThisPhone() as well.

export function phonePlatform() {
  try {
    const p = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : '';
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch (e) {
    return 'web';
  }
}

export const isIPhoneApp = () => phonePlatform() === 'ios';
export const isAndroidApp = () => phonePlatform() === 'android';

// "Android" on Android (and the website, which never shows these lines), "your
// iPhone" on iPhone. capital: for the start of a sentence ("Your iPhone").
export function phoneOs({ capital = false } = {}) {
  if (!isIPhoneApp()) return 'Android';
  return capital ? 'Your iPhone' : 'your iPhone';
}

// Hidden in the iPhone app; everywhere else these show exactly as before.
const NOT_ON_IPHONE = {
  // "Notice when I wake up": Apple says an iPhone app can't see unlocks unless
  // it is already running (Settings toggle and WakeOfferPrompt).
  wakeWatch: true,
  // The pinned quick-capture notification (typing box + Silence buttons):
  // iPhone can't keep a notification on screen. The widget and Control Center
  // button cover adding a task there.
  pinnedCapture: true,
  // "Only vibrate when my phone is on silent or Do Not Disturb": iPhone apps
  // can't read the silent switch, and AlarmKit alarms ring through silent mode
  // and Focus anyway.
  vibrateWhenQuiet: true,
  // Google Play's in-app update and the "there's a new version" popup, which
  // counts Android build numbers and sends people to the Play Store.
  playUpdate: true,
  // Android's own alarm switches: exact alarms, full-screen notifications,
  // display over other apps, battery unrestricted, Usage access.
  androidSwitches: true,
  // The how-to clips in the App Guide are Android screen recordings, and Apple
  // turns down apps that show another phone platform. Hidden until iPhone
  // ones are recorded.
  androidClips: true,
  // Waiting on Haris: the spoken alarm ("Read it to me"). Hidden until he
  // confirms AlarmKit can ring a spoken sound file the app makes ahead of time.
  spokenAlarm: true,
  // Waiting on Haris: sharing text or a screenshot into ADHDone (a share
  // extension) and the home-screen widget. The App Guide only offers them once
  // the iPhone app has them; set to false then.
  shareToApp: true,
  homeWidget: true,
  // OGG alarm-sound uploads: iPhone can't play or decode OGG (Haris, Oct 23
  // 2026), so the picker there offers MP3, WAV and M4A only.
  oggUploads: true,
};

export function onThisPhone(feature) {
  return !(isIPhoneApp() && NOT_ON_IPHONE[feature]);
}

// Waiting on Haris: does the iPhone app space close alarms 10 minutes apart the
// way Android does (AlarmService's waiting queue, set times never moved)? Until
// it says so, the website merges alarms within 10 minutes of each other into
// one before sending the list (widgetBridge foldClusters), the same as it does
// for Android builds older than 39. A time the person set is never merged.
export const IPHONE_SPACES_ALARMS = false;
