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
  // (The spoken alarm and the home-screen widget moved to IPHONE_BUILD_HAS on
  // Nov 4 2026: the iPhone build that has them says so itself.)
  // "Read it to me" for REGULAR notifications: iPhone's notification extension
  // can't speak and can't write a sound file the app's notifications could
  // play, so the choice isn't offered there (alarms can: spokenAlarm above).
  spokenNotify: true,
  // OGG alarm-sound uploads: iPhone can't play or decode OGG (Haris, Oct 23
  // 2026), so the picker there offers MP3, WAV and M4A only.
  oggUploads: true,
};

// On iPhone only from the build that has them. The iPhone app says so itself
// (ADHDoneViewController sets window.ADHDoneIPhone), so someone still on an
// older iPhone build doesn't get told about something their app can't do.
//   shareToApp: "ADHDone" in the share sheet (the share extension, Oct 31 2026).
//   spokenAlarm: "Read it to me" as the alarm sound — the reminder rendered to a
//                sound file when the alarm is booked (AlarmEngine, Nov 4 2026).
//   homeWidget:  the Home Screen / Lock Screen widget (ADHDoneWidget, Nov 4 2026).
//   alarms:      full-screen alarms (AlarmKit on iOS 26+, notifications before).
//   reminderButtons, silence, notifySound, backgroundCalendar: Nov 4 2026 too.
const IPHONE_BUILD_HAS = {
  shareToApp: 'shareExtension',
  spokenAlarm: 'spokenAlarm',
  homeWidget: 'homeWidget',
  alarms: 'alarms',
  reminderButtons: 'reminderButtons',
  silence: 'silence',
  notifySound: 'notifySound',
  backgroundCalendar: 'backgroundCalendar',
};

export function onThisPhone(feature) {
  if (!isIPhoneApp()) return true;
  if (IPHONE_BUILD_HAS[feature]) {
    try {
      return window.ADHDoneIPhone?.[IPHONE_BUILD_HAS[feature]] === true;
    } catch (e) {
      return false;
    }
  }
  return !NOT_ON_IPHONE[feature];
}

// Waiting on Haris: does the iPhone app space close alarms 10 minutes apart the
// way Android does (AlarmService's waiting queue, set times never moved)? Until
// it says so, the website merges alarms within 10 minutes of each other into
// one before sending the list (widgetBridge foldClusters), the same as it does
// for Android builds older than 39. A time the person set is never merged.
export const IPHONE_SPACES_ALARMS = false;
