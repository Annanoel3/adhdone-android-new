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

export function getReminderCopy(task, sendAt = new Date()) {
  const send = sendAt instanceof Date ? sendAt : new Date(sendAt);
  const title = task?.title || 'your task';
  const hour = send.getHours();
  const evening = hour >= 19 || hour < 6;
  const due = task?.due_date ? new Date(task.due_date) : null;

  if (!due || Number.isNaN(due.getTime())) {
    return {
      title: `📌 ${title}`,
      body: evening
        ? "Just keeping this on your radar — no need to tackle it tonight."
        : "Whenever you've got a minute — no pressure, just a friendly nudge.",
    };
  }

  const days = Math.round((startOfDay(due) - startOfDay(send)) / DAY_MS);
  const label = dayLabel(due, days);

  if (days < 0) {
    return { title: `⚠️ ${title}`, body: `This one slipped past ${label}. No shame — just pick it back up when you can.` };
  }
  if (days === 0) {
    return {
      title: `📅 ${title}`,
      body: evening
        ? "Today's the day — still time to squeeze it in tonight if you've got it in you."
        : "Due today — you've got this. Tap when it's done.",
    };
  }
  if (days === 1) {
    return {
      title: `Heads up: ${title}`,
      body: evening
        ? "Tomorrow's the day. Nothing to do tonight — maybe just line up what you'll need."
        : "Tomorrow's the day — plenty of time to plan for it.",
    };
  }
  return {
    title: `Don't forget: ${title}`,
    body: evening
      ? `Nothing to do tonight — just keeping it in mind. Plenty of time before ${label}.`
      : `Plenty of time before ${label} to get it done.`,
  };
}