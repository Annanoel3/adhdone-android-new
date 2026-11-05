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

**Nothing is phased.** Every feature goes in the build (Anna, Nov 4 2026: "always BUILD ALL
OF IT. Why would you let me submit something to apple unfinished.. thats not cool"). The
phases that stood here from Oct 30 to Nov 4 2026 were the assistant's own idea, never put to
Anna, and the first App Review build went out without reminder buttons, alarms, the widget,
silence and more. If something truly can't go in (a store rule, an Apple approval that is
missing), it is said in one line BEFORE the build and Anna decides. RULES.md §0.

| Android (files) | iPhone | Status |
|---|---|---|
| Push notifications: NotifyBridge, MainApplication (OneSignal) | NotifyBridge.swift (OneSignal, same app id), started in AppDelegate so a tap that cold-starts the app isn't lost | in |
| Record Notes: RecorderBridge, RecorderService, RecorderStore | RecorderBridge.swift (AVAudioRecorder, `audio` background mode: keeps going with the screen off, 10-minute parts) | in |
| Phone calendars: CalendarBridge | CalendarBridge.swift (EventKit, read) | in |
| Add to phone calendar on a task or event: CalendarBridge.addEvent (Android build 46) | CalendarBridge.addEvent (EventKitUI's New Event sheet, filled in; the person picks the calendar and taps Add; no permission needed on iOS 17+) | in (Nov 2 2026) |
| Notification sound for regular pushes: NotifySound, PushFilter.withOwnSound (Android build 46) | ADHDoneNotify (the Notification Service Extension, `ios/App/ADHDoneNotify`) names the sound on each push; the app downloads the chosen preset or upload once and turns it into a 29-second CAF in Library/Sounds (`SoundFiles.swift`: iOS plays only PCM aiff/wav/caf under 30 s from the app's own folder). Read-aloud for regular pushes: NOT on iPhone — an extension can't speak and can't write a sound file the app's notifications could play — so the picker leaves "Read it to me" out there (`spokenNotify` in phonePlatform.js) and a saved "speak:" means the phone's usual sound | in (Nov 4 2026) |
| Recording-minute packs: BillingBridge (RevenueCat) | BillingBridge.swift (RevenueCat iOS, consumables notes_1h / notes_5h) | in (code); products in App Store Connect + RevenueCat still to make |
| Contact picker: ContactPickerBridge | ContactPickerBridge.swift (Apple's picker, no Contacts permission) | in |
| Task photos: @capacitor/camera | same plugin, iOS side | in |
| Play in-app update: InAppUpdate, NotifyBridge.startAppUpdate | none on iPhone; the update card opens the App Store page (`openPlayStore`) | in |
| Ads: @capacitor-community/admob | same plugin; the tracking prompt (ATT) since Nov 3 2026, kept on the first open (Anna, Nov 4 2026: "Keep both iphone things on the first open"); AdMob iOS app 3513826797 and unit `IOS_AD_UNIT_ID` in src/lib/admob.js | in |
| Buttons on reminders (Done, Snooze 10, Later, Write questions): TaskActions, TaskActionReceiver | The extension names a category on each push by what it is about (`PushData.category`); the app registers the categories (`ReminderActions.swift`). Done and Write questions open the app and the web layer finishes them (OneSignalInit.jsx reads data.actionId). Snooze (a notification of the phone's own 10 minutes on, same buttons, quiet while silenced) and Later (counted; the web app collects it through AlarmBridge.drainActivity) are answered on the phone without opening the app (NotifyBridge.actionHandler) | in (Nov 4 2026) |
| Reminders for finished tasks dropped, one row per reminder: PushFilter, TaskPushes | ADHDoneNotify: a reminder for a task finished, parked or deleted lately (the app writes the ids down at every alarm sync and on the server's "drop" message) goes out empty and silent — iOS shows nothing for an empty notification — and its id is left for the app to take down from Notification Center on its next open; reminders of one task group in one thread. The web app's own tidy on open (iphoneNotificationTidy.js) stays | in (Nov 4 2026) |
| Alarms: AlarmScheduler, AlarmService, AlarmActivity, AlarmReceiver, AlarmStore, AlarmSound, AlarmTheme, AlarmBoost, BootReceiver, RingLog, ChoiceReports, ChoiceSyncWorker, LaterBreak, PairDecisions | `AlarmBridge.swift` + `AlarmEngine.swift` (app target). iOS 26+: AlarmKit — rings full screen over the lock screen, at alarm volume, through silent mode and Focus; a task gets Stop + Snooze 10 min (AlarmKit's own countdown, shown by the widget extension's Live Activity), an event Got it only, an event with something to do ("Add prep notes", "Send a text") Got it + that button, a timer its own button; every choice recorded (`AlarmIntents.swift`) and collected by the web app (drainActivity, ringLog). iOS 17–25, or AlarmKit refused: a notification of the phone's own at the same moment with the alarm sound and the buttons (Done / Snooze / Later; Got it). The list the phone holds lives in the keychain group (SharedStore). The server sends iPhone alarms too since Nov 4 2026, once the phone lists AlarmBridge (`phoneCanRing`, reminderTitle.ts), and its silent set_alarms_task / drop_alarms_task pushes reach the app (AppDelegate.didReceiveRemoteNotification). The permission: `getStatus` reports `alarms`, `requestAlarmAccess` asks (the web's alarm set-up already handles both). `NSAlarmKitUsageDescription` in Info.plist | in (Nov 4 2026) |
| Spoken alarm: AlarmSpeech | "Read it to me" renders the reminder (heading, then body) to a CAF with the phone's voice when the alarm is booked (`SpeechFiles` in SoundFiles.swift; the nearest 24 alarms, one file per sentence) and AlarmKit plays that file; the notification fallback plays the chosen tone. `spokenAlarm` is on for builds that say so (IPHONE_BUILD_HAS) | in (Nov 4 2026) |
| Silence ADHDone 1/2/3 h, vibrate-only during calendar events: ReminderPause, ReminderPauseReceiver, QuietShortcutActivity, AlarmQuiet | `quietFor` / `quietOff` / `quietStatus` and `setEventQuiet` / `setEventWindows` on AlarmBridge: alarms due inside the span become quiet notifications and go back to alarms when it ends (AlarmEngine.replan); the extension silences pushes inside it. Control Center (iOS 18+): "Silence ADHDone" (an hour; `SilenceControl` in ADHDoneWidget/Controls.swift) and "Add to ADHDone" | in (Nov 4 2026) |
| Timer and Focus Mode check-ins spoken aloud | The web app's speak.js uses the browser's own voice (window.speechSynthesis), which WKWebView has, so the check-ins talk on iPhone while the app is open the same as on Android; `AlarmBridge.previewSpeech` / `stopSpeech` (AVSpeechSynthesizer) back the sound picker's Play | in |
| Quick capture that never opens the app: QuickCapture (pinned notification), AddTaskTileService, shortcuts.xml, CaptureActivity, CaptureQueue, CaptureSyncWorker, Base44Api, Base44Session, SessionSnapshotter | iPhone has no pinned notifications; the widget's "+" and the Control Center "Add to ADHDone" button open the app ready for a task | in (Nov 4 2026) |
| Share to ADHDone (text and screenshots): ShareBridge, SharedImageReader | Share Extension (`ios/App/ADHDoneShare`) sends straight to captureText / readImageCapture, never opening the app | in (Oct 31 2026) |
| Today widget with tasks and "+": TodayWidgetProvider, WidgetData, WidgetBridge, WidgetRefreshWorker, WidgetCaptureActivity | `WidgetBridge.swift` (app) + `ios/App/ADHDoneWidget` (WidgetKit): Home Screen small and medium, Lock Screen rectangle, circle and inline line; the list is the one the web app hands over (SharedStore, keychain group); a tap opens Tasks, "+" opens Add Task (adhdone://open?path=…, AppDelegate → WidgetBridge.deliverPath, delivered exactly once like Android). `homeWidget` is on for builds that say so | in (Nov 4 2026) |
| Calendar changes picked up with the app closed: CalendarSyncWorker | `BackgroundCalendarSync.swift`: iOS background app refresh (BGAppRefreshTask `com.mediocreatbest.adhdone.calendar`, about every 4 hours when iOS allows; `fetch` background mode) plus EventKit's "the store changed" notice while the app runs; reads the ticked calendars (CalendarBridge.setSyncCalendars remembers them) and hands changed rows to syncGoogleCalendar (source device, from phone_background), the same rules as Android (empty reads held 6 h, same rows not resent within a day). Best effort: iOS decides when it runs | in (Nov 4 2026) |
| Wake-up detection: WakeWatch, WakeWatchWorker (usage access) | Android only. Hidden on iPhone (Anna, Oct 22 2026) | — |
| Battery optimisation, display over other apps, exact-alarm and full-screen settings, vibrate-only on silent | Android only. Hidden on iPhone; AlarmBridge answers `{ supported: false }` | — |

### How the pieces share data (no App Group)

The app, the share extension, the notification extension and the widget all link the
`ADHDoneShared` Swift package (`ios/App/ADHDoneShared`): `SharedSession` (the sign-in and
the server calls), `SharedStore` (alarms, widget tasks, sounds, silence, choices, "what
rang"), `PushData` (a push's data and its buttons), `AlarmMetadata` (AlarmKit's metadata
type). Everything lives in the keychain group `C6T8GPVSJ3.com.mediocreatbest.adhdone.shared`
— an App Group would need the identifier changed in Apple's developer portal and the
profiles made again; keychain groups come with every profile.

### Targets and bundle ids

| Target | Bundle id | Profile |
|---|---|---|
| App | com.mediocreatbest.adhdone | ADHDone App Store (`adhdone_app_store`) |
| ADHDoneShare (share sheet) | com.mediocreatbest.adhdone.share | ADHDone Share App Store (`adhdone_share_app_store`) |
| ADHDoneNotify (notification extension) | com.mediocreatbest.adhdone.notify | made by Codemagic's automatic signing on the first build (`ios_signing` fetches, and creates, profiles for every bundle id under the app's) — if it can't, Anna makes the App ID + App Store profile |
| ADHDoneWidget (widget, controls, alarm Live Activity) | com.mediocreatbest.adhdone.widget | same |

All four carry the same MARKETING_VERSION (Apple wants them equal).

## Web app checks for iPhone

- Every Android-only setting, popup and App Guide line must not show on iPhone
  (`Capacitor.getPlatform()` checks; Anna, Oct 22 2026).
- Sign in with Apple must sit next to Google sign-in (App Store guideline 4.8),
  through Base44's built-in Apple sign-in, like GenCare. Done Oct 30 2026:
  `src/components/AppleSignIn.jsx` on Login and Register, iPhone app only. Needs
  Apple switched on in Base44's authentication settings (switched on Oct 30 2026,
  Anna's yes).
- Alarms are in since Nov 4 2026 (AlarmBridge on iPhone); the Alarms card and the alarm
  popups show on the builds that have it. Before that, reminders were ordinary pushes.
- Links to other apps: NotifyBridge.openExternal (Apple Maps, Messages with the
  birthday text filled in), the same name the web already calls.
- Ads: iOS ad unit ids once AdMob has the iOS app (the tracking prompt is already in).

## Before the first App Review submission (Nov 3 2026, Anna: "I want the next build to
## actually be put into review to be on the app store")

Submitted Nov 3 2026, 12:22 PM CST: iOS App 1.3.20, Codemagic build #4 (build number 4,
commit 30dd6de), status "Waiting for Review". Codemagic's post-processing step shows
"failed" on every build because it also tries to submit to TestFlight *external* beta
review, which needs the TestFlight test information (feedback email, reviewer name/phone)
that was never filled in; the IPA still uploads and App Store Connect still processes it,
so that failure can be ignored (or the test info filled in once at
appstoreconnect.apple.com/apps/6828975743/testflight/test-info). To replace the build on a
version: remove the old one (the Delete control on its row) → Add Build → pick → Done →
Save → Add for Review → Submit for Review.

Rejected Nov 3 2026, 4:59 PM CST: Guideline 2.1 "Information Needed" (not a bug report). Apple wants, in
the App Review Notes field: a screen recording from a physical device on the latest iOS that starts at
launch and shows registration, login and account deletion; purpose and audience; setup steps; external
services; regional differences; regulated material. Then resubmit. Web changes reach build 4 with a
Publish, so no new build is needed unless native code changes. Done Nov 4 2026: TestFlight internal group
"Internal" (Anna invited, builds 1, 3, 4); iPhone-only wording on DeleteAccount, Terms, TermsAndConditions
and PrivacyPolicy (no Google Play or Android, no social features, app is free); App Store screenshot 2
removed and the description's "launch into a task" line changed, because Launch and Google Calendar sync
no longer exist on iPhone. Open: guideline 5.1.2(i) needs a popup naming OpenAI and asking permission
before personal data goes there; today OpenAI is named only in the Privacy Policy.

- App Store privacy answers: filled in by Anna Nov 3 2026 (Identifiers used for
  tracking = Yes; everything collected is linked to the user).
- Tracking prompt in the build: done (above).
- Ads on iPhone: done Nov 3 2026. AdMob iOS app 3513826797 "ADHDone: Done, Despite
  ADHD" (app id ca-app-pub-7979856440890193~3513826797, in Info.plist) and the
  "iPhone interstitial" unit (ca-app-pub-7979856440890193/1949463689, IOS_AD_UNIT_ID
  in src/lib/admob.js). The AdMob account is annabairdballew@gmail.com: open AdMob
  as https://apps.admob.com/v2/apps/list?authuser=annabairdballew@gmail.com (Chrome's
  default Google account has no AdMob account and shows the sign-up page). Still to
  do once the app is on the App Store: AdMob → the iOS app → Add store (the App
  Store listing), which lifts "Requires review" / the ad-serving limit.
- Store name: already "ADHDone: Done, Despite ADHD" in App Store Connect (app 6828975743).
- Price: Free ($0.00, 175 countries), set Nov 3 2026. Content Rights: Anna picks the
  answer herself (ads are third-party content: "Yes … and I have the necessary
  rights"). App Review sign-in: an email+password account made on the Register page,
  typed into the Sign-In Information fields by Anna.
- Minute packs: no products exist in either store (Nov 3 2026: Google Play has no
  one-time products, App Store Connect no in-app purchases), so `IOS_PACKS_LIVE`
  (src/lib/minutePacks.js) keeps buying hidden on iPhone and the Notes page says a
  paid version is coming. Set up later: the two consumables in App Store Connect
  (submitted with an app version), the Paid Apps agreement, RevenueCat's App Store
  app + offering; then flip the flag.
- Account deletion in the app: done (DeleteAccount.jsx asks and files the request
  in-app; the email steps stay for people who can't sign in).
- Privacy policy page updated Nov 3 2026 (ads, contacts, photos, recordings, phone
  calendars) so it matches the answers above.

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
   Notifications on. (No App Groups needed: the extensions share through the keychain
   group. If Codemagic's automatic signing can't make the App IDs and profiles for
   `com.mediocreatbest.adhdone.notify` and `.widget` on the Nov 4 2026 build, Anna
   registers those two identifiers and makes an App Store profile for each.)
2. App Store Connect: create the app (name, bundle id above, SKU anything).
3. OneSignal (ADHDone app): add the Apple iOS platform with the same .p8 push key
   GenCare uses.
4. Codemagic: add this repo as an application, and the "adhdone" variable group.
5. RevenueCat (ADHDone project): add the App Store app; its appl_ key goes in
   RC_APPLE_KEY. App Store Connect: the two consumables, notes_1h and notes_5h.
6. A borrowed iPhone with TestFlight for testing.
