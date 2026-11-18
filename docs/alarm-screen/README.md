# The phone's alarm screen, drawn from the real code

- `alarm-screen-build49.jpg`: the alarm screen from Android build 49 on, in 23 situations: dark and light theme, a text task with its third button, small phones, a large font, an event, two and three tasks ringing together, the eased plan's alarm, a timer's end, the task timer's end with its three choices, "Are your reminders helping?", the earlier screen that the off switch brings back, Android 15 and up with the phone's own bars drawn as red bands (three-button and swipe), and a phone on its side. A task's alarm has two choices, Done and Later, and no Snooze.
- `on-its-side.jpg`: the same alarm on a phone lying on its side, full size.
- `store-slide-1-screen.jpg`, `store-slide-4-screen-plain.jpg`: the two screens used in the Play Store pictures 1 and 4.
- `harness/`: how the pictures are made, and how the app is built to check a change to the phone code. From the app root in the Base44 sandbox: `python3 docs/alarm-screen/harness/setup.py` (unpacks a JDK and the Android SDK pieces under `/tmp/ab` and makes a build COPY of `android/` there; never build inside `/app`), then `/tmp/ab/build.sh :app:assembleDebug :app:lintVitalRelease :app:minifyReleaseWithR8 :app:testDebugUnitTest --tests '*AlarmShotTest*'`. Pictures land in `/tmp/ab/shots`. Change the phone code in the copy, build, look at the picture, and only then copy the changed files into `android/`.

- Slips (Nov 18 2026): `AlarmBehaviorTest` also covers a tap the instant the alarm takes over a phone in use (not counted for 0.8 seconds; the Later hold and the banner's Done do not wait) and the reminder showing itself as a silent banner after Home. 31 tests.

Look at the picture before describing the screen to anyone.
