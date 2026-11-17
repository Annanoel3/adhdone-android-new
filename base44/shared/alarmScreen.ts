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

// The new screen shows its third button only when the task has something to
// do in the app, which the phone knows by the alarm carrying its own words for
// that button (openLabel: a birthday's "Send a text", an event's "Record
// notes"). A task that IS sending someone a text (Task.texts_someone) has the
// box to type it and the Send button on its page, so its alarms carry words
// too. Empty for every other task. The app's own alarm list says the same
// (alarmSetFor in src/components/utils/widgetBridge.js).
export function textTaskOpenLabel(task: any): string {
  if (!task || task.texts_someone !== true || task.birthday_person || task.classification === 'event') return '';
  return String(task.text_message || '').trim() ? 'Send the text' : 'Write the text';
}

export function alarmScreenFor(user: any): 'new' | 'classic' {
  if (ALARM_SCREEN_CLASSIC_FOR_EVERYONE) return 'classic';
  return String(user?.alarm_screen || '').trim().toLowerCase() === 'classic' ? 'classic' : 'new';
}
