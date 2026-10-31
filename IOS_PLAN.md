# ADHDone on iPhone — the plan (ios/ in this repo)

Started Oct 30 2026 (Anna: "Wanna start coding on codemagic for the iphone build? Dont
forget all of our features."). Same pattern as GenCare's iPhone app, which reached
TestFlight through Codemagic on Oct 29 2026.

## How it's built

- `ios/` is a Capacitor 8 project (Swift Package Manager, no CocoaPods). The WebView
  loads adhdone.space, exactly like Android, so web changes ship with a Base44 publish.
- ADHDone's own native code is one Swift package, `ios/App/ADHDoneNative`, with the
  SAME plugin names and methods as the Android project, so the web app doesn't care
  which phone it's on. Registered in `ios/App/App/ADHDoneViewController.swift`.
- Bundle id `com.mediocreatbest.adhdone` (Android keeps `co.median.android.odxqpdy`).
  iOS 17 or newer. AlarmKit features need iOS 26 and fall back below that.
- Base44 pushes this repo to GitHub (Annanoel3/adhdone-android-new). Every change
  under `ios/` runs `.github/workflows/ios-compile-check.yml` on GitHub's free Mac
  runners and posts BUILD SUCCEEDED / the errors as a comment on the commit.
- `codemagic.yaml` builds, signs and uploads to TestFlight. Started by hand
  ("Start new build") or a tag `ios-*`. Base44's pushes never start a build.

## Every native feature, and what it becomes on iPhone

Phase 1 = in the first TestFlight build. Later phases follow in order.

| Android (files) | iPhone | Phase |
|---|---|---|
| Push notifications: NotifyBridge, MainApplication (OneSignal) | NotifyBridge.swift (OneSignal, same app id), started in AppDelegate so a tap that cold-starts the app isn't lost | 1 |
| Record Notes: RecorderBridge, RecorderService, RecorderStore | RecorderBridge.swift (AVAudioRecorder, `audio` background mode: keeps going with the screen off, 10-minute parts) | 1 |
| Phone calendars: CalendarBridge | CalendarBridge.swift (EventKit, read) | 1 |
| Recording-minute packs: BillingBridge (RevenueCat) | BillingBridge.swift (RevenueCat iOS, consumables notes_1h / notes_5h) | 1 (code) — products in App Store Connect + RevenueCat |
| Contact picker: ContactPickerBridge | ContactPickerBridge.swift (Apple's picker, no Contacts permission) | 1 |
| Task photos: @capacitor/camera | same plugin, iOS side | 1 |
| Play in-app update: InAppUpdate, NotifyBridge.startAppUpdate | none on iPhone; the update card opens the App Store page (`openPlayStore`) | 1 |
| Ads: @capacitor-community/admob | same plugin; needs ADHDone's own iOS app + ad units in AdMob and Apple's tracking prompt (ATT). Phase 1 ships Google's sample app id (test ads) | 2 |
| Buttons on reminders (Done, Snooze 15/60, Later): TaskActions, TaskActionReceiver | notification categories with actions, answered without opening the app | 2 |
| Reminders for finished tasks dropped, one row per reminder: PushFilter, TaskPushes | Notification Service Extension (sees every push before it shows) | 2 |
| Alarms: AlarmScheduler, AlarmService, AlarmActivity, AlarmReceiver, AlarmStore, AlarmSound, AlarmTheme, AlarmBoost, BootReceiver, RingLog, ChoiceReports, ChoiceSyncWorker, LaterBreak, PairDecisions | iOS 26+: AlarmKit (real alarms that break through silent mode and Focus) with Stop + Later (Anna's decision); events get Stop only. iOS 17–25: time-sensitive notifications with the alarm sound. Every choice reported to the server like Android | 3 |
| Spoken alarm: AlarmSpeech | the reminder read aloud is rendered to a sound file when the alarm is booked (AlarmKit plays files) | 3 |
| Silence ADHDone 1/2/3 h, vibrate-only during calendar events: ReminderPause, ReminderPauseReceiver, QuietShortcutActivity, AlarmQuiet | in-app switch + Control Center control (iOS 18); during events alarms go out as notifications | 3 |
| Timer and Focus Mode check-ins spoken aloud | AVSpeechSynthesizer while the app is open (Android also needs the app open) | 3 |
| Quick capture that never opens the app: QuickCapture (pinned notification), AddTaskTileService (quick settings tile), shortcuts.xml, CaptureActivity, CaptureQueue, CaptureSyncWorker, Base44Api, Base44Session, SessionSnapshotter | an "Add to ADHDone" App Intent (Siri, Shortcuts, Action button, Control Center, long-press on the icon) that asks for the words and sends them with the saved session; queued when offline. iPhone has no pinned notifications | 4 |
| Share to ADHDone (text and screenshots): ShareBridge, SharedImageReader | Share Extension that sends straight to captureText / readImageCapture, never opening the app | 4 |
| Today widget with tasks and "+": TodayWidgetProvider, WidgetData, WidgetBridge, WidgetRefreshWorker, WidgetCaptureActivity | WidgetKit widget (Home Screen + Lock Screen), "+" runs the App Intent | 4 |
| Calendar changes picked up with the app closed: CalendarSyncWorker | background app refresh (iOS decides when; best effort) + sync on every open | 4 |
| Wake-up detection: WakeWatch, WakeWatchWorker (usage access) | Android only. Hidden on iPhone (Anna, Oct 22 2026) | — |
| Battery optimisation, display over other apps, exact-alarm and full-screen settings | Android only. Hidden on iPhone | — |

## Web app checks for iPhone (phase 1, alongside the first build)

- Every Android-only setting, popup and App Guide line must not show on iPhone
  (`Capacitor.getPlatform()` checks; Anna, Oct 22 2026).
- Sign in with Apple must sit next to Google sign-in (App Store guideline 4.8),
  through Base44's built-in Apple sign-in, like GenCare. Done Oct 30 2026:
  `src/components/AppleSignIn.jsx` on Login and Register, iPhone app only. Needs
  Apple switched on in Base44's authentication settings (switched on Oct 30 2026,
  Anna's yes).
- Until alarms come (phase 2) reminders arrive as ordinary push notifications; the
  Alarms card and alarm popups stay hidden because they only show when the phone
  has AlarmBridge.
- Links to other apps: NotifyBridge.openExternal (Apple Maps, Messages with the
  birthday text filled in), the same name the web already calls.
- Ads: iOS ad unit ids once AdMob has the iOS app.

## Android fixes carried over before launch (Oct 30 2026)

Anna: the Android app needed many small fixes after launch; make sure the iPhone app
doesn't. Done: on-screen back arrow (iPhone has no back button; Layout.jsx), Facebook
sign-in hidden on iPhone (it finished in Safari), offline page (public/offline.html,
server.errorPath; was a blank screen), finished tasks' reminders cleared from
Notification Center (NotifyBridge.deliveredTaskIds/clearTask +
IPhoneNotificationTidy.jsx; Android does it with a silent push), no ring-on-arrival
pushes with a 10-minute life for accounts last opened on iPhone
(reminderTitle.phoneCanRing), voice files named .mp4 on iPhone, sounds work again
after a recording (RecorderBridge.releaseAudioSession), Dark theme status bar, ads
not started on iPhone, Parking Lot input no longer zooms. Still to do before App
Review: in-app account deletion (guideline 5.1.1(v); DeleteAccount.jsx is email-only).
Check on a device: keyboard covering inputs (no @capacitor/keyboard yet).

## Set up so far (Oct 30 2026)

- Apple Developer: identifier `com.mediocreatbest.adhdone` (Push Notifications on)
  and the App Store profile "ADHDone App Store" (same distribution certificate as
  GenCare). Codemagic has the profile under reference `adhdone_app_store`.
- Codemagic: application adhdone-android-new added (reads codemagic.yaml). Build 1
  (1.3.20) is in TestFlight; the version page (text, 6 screenshots from the Play
  listing minus the two share-to-app ones, review contact, notes) is filled in.
- GitHub: the compile check runs on every ios/ change; first runs BUILD SUCCEEDED.
- The App Store name "ADHDone" belongs to another developer's app (first released
  Feb 6 2024), so the store name needs a variant; the home-screen name stays ADHDone.
- Share extension (Oct 31 2026): target `ADHDoneShare` (ios/App/ADHDoneShare), bundle
  `com.mediocreatbest.adhdone.share`, its own App ID and App Store profile "ADHDone
  Share App Store" (Codemagic reference `adhdone_share_app_store`). No App Group:
  the app copies the sign-in (the same three localStorage keys Android reads) into
  the keychain group `C6T8GPVSJ3.com.mediocreatbest.adhdone.shared`, which both
  targets list under keychain-access-groups (ios/App/Shared/SharedSession.swift).
  Text or a link goes to captureText; a picture to readImageCapture, then
  captureText. A text that can't be sent (no signal, signed out) waits in the same
  keychain group and the app sends it when it opens, with the same capture_id.
  The app sets `window.ADHDoneIPhone.shareExtension`, and phonePlatform.js only
  offers sharing on iPhone builds that set it. When the version number changes,
  change MARKETING_VERSION on both targets (Apple wants them equal).

## What only Anna can do

1. Apple Developer: register the identifier `com.mediocreatbest.adhdone` with Push
   Notifications on (later also App Groups, for the widget and share extension).
2. App Store Connect: create the app (name, bundle id above, SKU anything).
3. OneSignal (ADHDone app): add the Apple iOS platform with the same .p8 push key
   GenCare uses.
4. Codemagic: add this repo as an application, and the "adhdone" variable group.
5. RevenueCat (ADHDone project): add the App Store app; its appl_ key goes in
   RC_APPLE_KEY. App Store Connect: the two consumables, notes_1h and notes_5h.
6. A borrowed iPhone with TestFlight for testing.
