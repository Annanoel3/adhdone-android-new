// Focus Mode: while a user is focused on one recurring task, that task's
// reminders switch to a tight hourly check-in cadence regardless of its
// original interval. The original interval is saved on the task and restored
// when the user exits Focus Mode.

export const FOCUS_MODE_INTERVAL = '1hour';
export const FOCUS_MODE_INTERVAL_MS = 60 * 60 * 1000;

// The body names the task too: it is the line the notification list shows and
// the line the spoken alarm reads out, and "Still working on it?" on its own
// doesn't say what "it" is.
export function getFocusModeContent(title: string): { title: string; body: string } {
  const name = (title || '').trim() || 'your task';
  return {
    title: `How's "${name}" going?`,
    body: `Still working on "${name}"? You've got this — keep at it!`,
  };
}