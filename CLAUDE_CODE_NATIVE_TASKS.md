# ADHDone — Native Android tasks for Claude Code

This brief covers three native Android features for the ADHDone app. The web app side
(React, hosted at https://adhdone.space) is already built and waiting for the native
pieces described here. Do not modify anything under `src/` or `base44/` — those are
owned by the Base44 builder and deploy separately. Everything you touch lives under
`android/`.

## Project facts you need

- Capacitor 8 Android project. `capacitor.config.ts` points the WebView at the remote
  URL `https://adhdone.space` (no bundled web assets). `webDir` is `dist` but is not used
  at runtime.
- Package / applicationId: `co.median.android.odxqpdy`
  (`android/app/src/main/java/co/median/android/odxqpdy/`).
- `MainActivity extends BridgeActivity`, `launchMode="singleTask"`. It registers a custom
  Capacitor plugin `NotifyBridge` **before** `super.onCreate()`. Follow that exact pattern
  for any new plugin.
- `NotifyBridge.java` is the reference for how we write Capacitor plugins here
  (`@CapacitorPlugin`, `@PluginMethod`, `notifyListeners(...)`, plus a static field that
  holds data for cold-start retrieval). Copy its style.
- OneSignal 5.x is the push provider (`com.onesignal:OneSignal:[5.0.0, 5.99.99]`). Do not
  touch its init or the click listener in `NotifyBridge`.
- `MainActivity.setupInAppNavigation()` rewrites the WebView user agent and forces
  navigation to stay in-app. Leave it alone; add code around it, not inside it.
- Manifest already declares `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`,
  `READ_CONTACTS`.
- `@capacitor-community/contacts` v8 is already in `package.json`.

## The one contract everything hangs on: `ShareBridge`

Create a Capacitor plugin named **`ShareBridge`** (`ShareBridge.java`). The web app already
calls it as `window.Capacitor.Plugins.ShareBridge`. Both the share sheet and the
notification inline reply funnel captured text into this plugin; the web app takes it
from there (parsing, dates, reminders — all handled web-side).

```java
@CapacitorPlugin(name = "ShareBridge")
public class ShareBridge extends Plugin {
    // Text captured while the web app was NOT ready (cold start). Cleared on read.
    private static String pendingSharedText = null;
    private static ShareBridge instance;

    @Override public void load() { instance = this; }

    /** Called by MainActivity for both onCreate (via getIntent) and onNewIntent. */
    public static void deliver(String text) {
        if (text == null || text.trim().isEmpty()) return;
        pendingSharedText = text.trim();
        if (instance != null) {
            JSObject payload = new JSObject();
            payload.put("text", pendingSharedText);
            instance.notifyListeners("sharedText", payload); // warm start
        }
    }

    @PluginMethod
    public void getPendingSharedText(PluginCall call) {   // cold start
        JSObject result = new JSObject();
        result.put("text", pendingSharedText == null ? "" : pendingSharedText);
        pendingSharedText = null;
        call.resolve(result);
    }

    @PluginMethod public void setQuickCaptureEnabled(PluginCall call) { /* see Feature 2 */ }
    @PluginMethod public void isQuickCaptureEnabled(PluginCall call)  { /* see Feature 2 */ }
}
```

Web-side behaviour (already implemented, for your understanding):
- On app start the web app calls `ShareBridge.getPendingSharedText()`; if `text` is
  non-empty it navigates to the Add Task screen and auto-submits it.
- While running it listens to `ShareBridge.addListener('sharedText', ...)` and does the
  same.
- So: **you never need to build URLs or deep links.** Just call
  `ShareBridge.deliver(text)` from `MainActivity` and bring the activity to the front.

Register it in `MainActivity.onCreate()` next to `NotifyBridge`:
```java
registerPlugin(NotifyBridge.class);
registerPlugin(ShareBridge.class);
super.onCreate(savedInstanceState);
handleIncomingIntent(getIntent());
```
and override `onNewIntent(Intent intent)` → `super.onNewIntent(intent); setIntent(intent);
handleIncomingIntent(intent);`

`handleIncomingIntent` must handle both sources:
1. `Intent.ACTION_SEND` with `text/plain` → `intent.getStringExtra(Intent.EXTRA_TEXT)`
   (if `EXTRA_SUBJECT` exists and the text is a bare URL, prefix the subject:
   `"<subject> <url>"`).
2. Our own launch from the notification reply → `intent.getStringExtra("adhdone_captured_text")`.

Guard against double delivery on rotation: after handling, call
`intent.removeExtra(Intent.EXTRA_TEXT)` / `removeExtra("adhdone_captured_text")`.

---

## Feature 1 — Share-to-ADHDone (Android share sheet target)

Marketing framing: "Share anything to ADHDone and it becomes a reminder — like texting
your assistant."

Manifest: add a second intent filter to the existing `MainActivity` (do not add a new
activity — `singleTask` + `onNewIntent` is what we want):
```xml
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
```
Only `text/plain` for now. No images, no `SEND_MULTIPLE`.

Acceptance:
- From Messages / Chrome / Gmail, long-press → Share → "ADHDone" appears.
- App cold (killed): opens, shows Add Task with the text already being processed.
- App warm (in background): comes to front and does the same, without reloading the
  WebView.
- Sharing twice in a row creates two separate tasks (no stale text re-delivered).

---

## Feature 2 — Persistent quick-capture notification with inline reply

A pinned, silent, ongoing notification in the tray: title "Add to ADHDone", body "Type a
reminder…", one action "Add" with a `RemoteInput` (the same inline reply UI SMS apps use).
Tapping the notification body itself (not the action) just opens the app.

Implementation notes:
- Notification channel id `adhdone_quick_capture`, `IMPORTANCE_LOW` (no sound, no
  heads-up), name "Quick capture".
- `setOngoing(true)`, `setSilent(true)`, `setShowWhen(false)`, small icon: reuse the
  launcher foreground or add a simple white glyph drawable — OneSignal's default icon is
  fine to reuse if it exists in res.
- The "Add" action uses `RemoteInput.Builder("adhdone_reply").setLabel("Reminder…")` and a
  `PendingIntent.getBroadcast` to `QuickCaptureReceiver` with `FLAG_MUTABLE` (required for
  RemoteInput on API 31+).
- `QuickCaptureReceiver extends BroadcastReceiver`:
  1. `RemoteInput.getResultsFromIntent(intent).getCharSequence("adhdone_reply")`.
  2. Start `MainActivity` with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_SINGLE_TOP` and extra
     `adhdone_captured_text = <text>`. (Android 10+ restricts background activity starts,
     but a notification-action-originated start is allowed.)
  3. Re-post the pinned notification immediately so the reply UI resets (Android shows a
     spinner on the action until the notification is updated).
- Fixed notification id (e.g. `4411`) so re-posting replaces instead of stacking.
- Persist the on/off state in `SharedPreferences` (`adhdone_prefs` / `quick_capture_enabled`,
  default **false**). `ShareBridge.setQuickCaptureEnabled({enabled})` writes the pref and
  posts/cancels the notification; `isQuickCaptureEnabled()` returns `{enabled}`. The web
  app will expose a Settings toggle that calls these.
- `BootReceiver` on `BOOT_COMPLETED` re-posts the notification if the pref is true
  (permission already in manifest; register the receiver with `android:exported="true"`
  and the boot intent filter).
- Check `POST_NOTIFICATIONS` is granted before posting on API 33+; if not, resolve
  `setQuickCaptureEnabled` with `{enabled:false, reason:"permission"}` so the web toggle
  can show a hint. Do not request the permission here — the web app already does via
  `NotifyBridge.requestPermission`.

Honest limitation to preserve: the reply opens the app (foreground) rather than creating
the task silently in the background. That is intentional for v1 — task parsing may need a
follow-up question (pick a date, pick a priority) that only the web UI can ask. Do not try
to POST to the backend from native code.

Acceptance:
- Toggle on → pinned notification appears and survives app kill and reboot.
- Type "call dentist tomorrow 2pm" in the inline reply → app opens on Add Task, task is
  created with the right date/time, notification resets to its idle state.
- Toggle off → notification disappears and does not come back after reboot.
- Notification is not dismissible by swipe.

---

## Feature 3 — Contact picker (finish native wiring)

The web app already uses `Contacts.pickContact()` from `@capacitor-community/contacts`
(`src/components/birthdays/ContactPickerButton.jsx`) and the manifest already has
`READ_CONTACTS`. The remaining work is making sure the plugin is actually compiled in
and the permission prompt fires.

Steps:
1. `npm install` then `npx cap sync android`. Confirm the plugin appears in
   `android/app/capacitor.build.gradle` (`implementation project(':capacitor-community-contacts')`)
   and in `android/app/src/main/assets/capacitor.plugins.json`.
2. Confirm `android/capacitor.settings.gradle` includes the
   `:capacitor-community-contacts` project.
3. Build and run. On the Birthdays dialog, tap "Pick from Contacts": the system contacts
   permission dialog must appear, then the native picker, then name + phone land in the
   form.
4. If the plugin class fails to auto-register (Capacitor 8 auto-registers from
   `capacitor.plugins.json`; only fall back to manual `registerPlugin(...)` if the JS side
   logs "ContactsPlugin not implemented").
5. Play Console: `READ_CONTACTS` needs a data-safety declaration ("Contacts — app
   functionality, not shared"). Note it in your summary so the store listing gets updated.

---

## Build / verify checklist

- `cd android && ./gradlew assembleDebug` succeeds with no new lint errors.
- Bump `versionCode` and `versionName` in `android/app/build.gradle` (currently 4 /
  1.2.1 → 5 / 1.3.0).
- Test on a physical device on Android 13+ (the notification permission and
  RemoteInput mutability rules only bite there).
- Cold-start test for each feature: force-stop the app first.
- Log tag for everything new: `"ADHDone"` (matches MainActivity).

## Things NOT to do

- Do not change `capacitor.config.ts` `server.url` or `allowNavigation`.
- Do not modify `NotifyBridge.java` beyond what's needed to compile.
- Do not add a home-screen widget (tabled).
- Do not add network calls from native code; the WebView owns auth and data.
- Do not touch `src/`, `base44/`, or anything outside `android/` except the version bump
  note above.

## Build 39 — alarm reliability (found Oct 10 2026, from the alarm code + one day of real use)

Every item below was seen on Anna's phone on build 38 or is a direct consequence of how
`AlarmService` / `AlarmScheduler` / `PushFilter` work today. Fix all of them in one build.
Read `AlarmService.java` (the `waiting` queue, `snooze()`, the hand-off after an answer),
`AlarmScheduler.java` (`schedule()`, `sync()`), `PushFilter.java` (`ringOnArrival`) and
`RingLog.java` first. Keep the rule above: no network calls from native code.

1. **Two different tasks ringing back to back.** When an alarm comes due while another is
   ringing, it goes into `waiting` and starts ringing the instant the first is answered
   (Oct 10: a pills snooze came back at 12:09 and the planner's "Mom's watch" nudge landed
   in the same minute; both rang, one straight after the other). Fix: when the answered
   alarm hands off to the next one for a DIFFERENT task, delay that ring by 10 minutes
   (reschedule its entry, `at = now + 10 min`) instead of starting it immediately — the
   same spacing the server already keeps between pushes (`base44/shared/sendLedger.ts`:
   9 minutes same task, 20 minutes before a nudge stacks on anything). Do not invent a
   different number here. Same-task folding stays as it is. An entry whose heading starts with the bell (an "at the time"
   reminder the user set themselves) is the exception: it rings at its minute, and the
   OTHER one is what waits.
2. **Alarms booked for the same minute.** `AlarmScheduler.schedule()` books every entry at
   its exact `at`; two server alarms for different tasks at the same minute (two "at 10:00"
   tasks, or a fixed reminder and a nudge) produce the collision in item 1. In `sync()` and
   `replaceTask()`, when a NEW entry for a different task lands within 2 minutes of one
   already booked, push the new one to 10 minutes after it (same spacing as above). Log it.
3. **The server can't see a snooze.** A snooze is local: the server only learns a count
   when the app next opens (`drainActivity`), never WHEN it comes back, so the Smart
   Reminders planner can't plan around it. In the activity drain, report for each task
   the `snoozed_until` moment (the entry's `at` after `snooze()`), and the web side
   (`widgetBridge.js`, `syncAlarmActivity`) writes it to the task as `snoozed_until`. (Server
   side, separately: the planner's task line will show "snoozed on the phone until X"
   and the planner is told not to land within 5 minutes of it.)
4. **Duplicate tray entries while an alarm is up.** `PushFilter.ringOnArrival` keeps the
   push itself in the tray as a silent record AND the alarm posts its own notification
   with the same words (Oct 10, 10:39 AM: two "Call Brodie Animal Hospital" rows, one with
   Snooze/Done/Stop, one with Done/Later). Fix: while the alarm's notification is up,
   cancel the silent tray copy, and re-post it (silently) only if the alarm rings out
   with no answer, so the reminder is still findable in the tray afterwards. Dismissing or
   finishing from the alarm clears both, as now.
5. **A server-side cancel the phone never hears about.** The phone rings from its own copy
   of a task's alarms; when the server cancels a booked push (a plan change, an eviction,
   the owner's cancel tool), the phone still rings it unless a silent `set_alarms_task`
   push arrives first (Oct 10: the cancelled 11:00 "One hour left" rang anyway). The server
   paths now send that push (sendLedger evict, debugNotifications cancel). Native side:
   handle `set_alarms_task` with an EMPTY list as "this task has no alarms now" (today an
   unreadable/empty list is ignored to be safe — distinguish `[]` from unreadable), and
   when a `drop_alarms_task` / `set_alarms_task` arrives for the alarm that is ringing
   right now, stop the ring.
6. **"What rang" should show what the server sent too.** `RingLog` only records alarms and
   sounding reminders; a push shown silently (a quiet notification, a tray copy) is
   invisible there, which is why the owner thought pushes were missing. Record silent
   showings as their own kind (`quiet`) with the same title/body, and the web list shows
   them with a muted icon.
7. **Collisions and snoozes in the log.** Add to each `RingLog` row: `queuedBehind` (the id
   it waited for, when it came out of `waiting`) and `fromSnooze` with the minutes, so the
   next time something rings twice the log says why without reading logcat.

Build / verify for 39: force-stop, book two alarms 1 minute apart for different tasks and
confirm the second rings 10 minutes after the first is answered; snooze one for 1 minute
and confirm the server task shows `snoozed_until`; cancel a booked push from the owner
tool and confirm the phone does not ring it; check the tray during a ring shows one row.
