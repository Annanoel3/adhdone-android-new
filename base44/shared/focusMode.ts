// Focus Mode: while a user is focused on one recurring task, that task's
// reminders switch to a tight hourly check-in cadence regardless of its
// original interval. The original interval is saved on the task and restored
// when the user exits Focus Mode.

export const FOCUS_MODE_INTERVAL = '1hour';
export const FOCUS_MODE_INTERVAL_MS = 60 * 60 * 1000;

export function getFocusModeContent(title: string): { title: string; body: string } {
  return {
    title: `How's "${title}" going?`,
    body: `Still working on it? You've got this — keep at it!`,
  };
}