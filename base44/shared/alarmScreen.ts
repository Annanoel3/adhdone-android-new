// The off switch for the phone's new alarm screen (Anna, Nov 16 2026).
//
// From Android build 49 the full-screen alarm is a big round Done to tap and a
// wide Later bar that has to be held (android: AlarmActivity,
// activity_alarm_v2.xml, AlarmLook). The screen every build before it had is
// still in the app, and the phone shows whichever one the server names here.
// So if the new screen ever misbehaves on someone's phone, it is switched off
// without a new build and a store review.
//
// How the word reaches a phone: cancelTaskNotifications answers the phone's
// own reports with "alarm_screen" (every choice made on an alarm, and the
// 12-hour check-in that runs with the app closed). "classic" = the earlier
// screen from that phone's next alarm on; anything else = the new one.
//
// Two ways to switch it off:
//  - one person, at once: set User.alarm_screen to "classic" on their record
//    (empty again = back to the new screen). No Publish needed.
//  - everyone: set ALARM_SCREEN_CLASSIC_FOR_EVERYONE below to true and re-save
//    cancelTaskNotifications. Phones call the published copy of a function, so
//    this one reaches them with the next Publish.

export const ALARM_SCREEN_CLASSIC_FOR_EVERYONE = false;

export function alarmScreenFor(user: any): 'new' | 'classic' {
  if (ALARM_SCREEN_CLASSIC_FOR_EVERYONE) return 'classic';
  return String(user?.alarm_screen || '').trim().toLowerCase() === 'classic' ? 'classic' : 'new';
}
