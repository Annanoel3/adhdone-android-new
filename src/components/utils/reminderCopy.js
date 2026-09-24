// Warm, deadline-aware wording for task reminder pushes.
// Reads the task's due date and the local time the push will land so an
// evening nudge for a Sunday errand says "plenty of time before Sunday" instead
// of a flat "Task Reminder — tap to mark as complete!".
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function dayLabel(due, daysAway) {
  if (Math.abs(daysAway) < 7) return WEEKDAYS[due.getDay()];
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Nobody's doing an oil change at 7:30 PM. When a snooze would land in the
// evening and the task isn't due until a later day, slide the follow-up to
// tomorrow morning instead of pinging again tonight.
export function smartSnoozeTime(task, snoozeUntil) {
  const t = snoozeUntil instanceof Date ? snoozeUntil : new Date(snoozeUntil);
  const hour = t.getHours();
  if (hour < 19 && hour >= 7) return t;
  if (!task?.due_date) return t;
  const due = new Date(task.due_date);
  if (startOfDay(due) <= startOfDay(t)) return t;
  const morning = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9, 0, 0, 0);
  if (hour >= 19) morning.setDate(morning.getDate() + 1);
  return morning;
}

// Every body names the task. The body is the line people read in the
// notification, and it is what the spoken alarm reads out loud, so a body
// like "no pressure, just a friendly nudge" on its own says nothing about
// what the reminder is for. Kept in step with base44/shared/reminderTitle.ts.
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function getReminderCopy(task, sendAt = new Date()) {
  const send = sendAt instanceof Date ? sendAt : new Date(sendAt);
  const title = (task?.title || '').trim() || 'your task';
  const quoted = `"${title}"`;
  const hour = send.getHours();
  const evening = hour >= 19 || hour < 6;
  const due = task?.due_date ? new Date(task.due_date) : null;
  // A rhythm the person asked for ("keep reminding me until I do it").
  const askedRhythm = !!task?.reminder_interval && task.reminder_interval !== 'once';

  if (!due || Number.isNaN(due.getTime())) {
    return {
      title: `📌 ${title}`,
      // They asked to be reminded, so no "no pressure" and no "not tonight".
      body: askedRhythm
        ? `Reminder: ${sentence(title)}`
        : evening
          ? `Just keeping ${quoted} on your radar — no need to tackle it tonight.`
          : `${quoted} — whenever you've got a minute. No pressure.`,
    };
  }

  const days = Math.round((startOfDay(due) - startOfDay(send)) / DAY_MS);
  const label = dayLabel(due, days);

  if (days < 0) {
    return { title: `⚠️ ${title}`, body: `${quoted} slipped past ${label}. No shame — just pick it back up when you can.` };
  }
  if (days === 0) {
    return {
      title: `📅 ${title}`,
      body: evening
        ? `Today's the day for ${quoted} — still time to squeeze it in tonight if you've got it in you.`
        : `${quoted} is due today — you've got this. Tap when it's done.`,
    };
  }
  if (days === 1) {
    return {
      title: `Heads up: ${title}`,
      body: evening
        ? `${quoted} is due tomorrow. Nothing to do tonight — maybe just line up what you'll need.`
        : `${quoted} is due tomorrow — plenty of time to plan for it.`,
    };
  }
  return {
    title: `Don't forget: ${title}`,
    body: evening
      ? `${quoted} isn't due until ${label} — nothing to do tonight.`
      : `${quoted} is due ${label} — plenty of time to get it done.`,
  };
}