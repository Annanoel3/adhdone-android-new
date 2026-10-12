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

// Their own evening and morning, from their quiet hours (Settings, kept on
// this device), not the clock: for someone who sleeps 8 AM to 4 PM, 6 AM is
// bedtime and 5 PM is morning (Oct 12 2026). Defaults 10 PM to 8 AM.
function quietWindow() {
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const toMin = (s, d) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : d;
  };
  return { start: toMin(read('quiet_hours_start', '22:00'), 22 * 60), end: toMin(read('quiet_hours_end', '08:00'), 8 * 60) };
}
const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const inWindow = (m, from, to) => (from === to ? false : from > to ? (m >= from || m < to) : (m >= from && m < to));

// Evening: the last 3 hours before their quiet hours start, and the quiet
// hours themselves (7 PM to 8 AM for the usual 10 PM to 8 AM).
function isTheirEvening(d) {
  const { start, end } = quietWindow();
  return inWindow(minOfDay(d), (start - 180 + 24 * 60) % (24 * 60), end);
}

// Their evening, for the daily tip's wind-down: the clock shifted so their
// quiet hours start where the usual 10 PM is. For 10 PM to 8 AM that's 5 PM to
// midnight, as it always was; for someone who sleeps 8 AM to 4 PM, 3 AM to
// 10 AM. With no quiet hours set, 5 PM on the clock.
export function isTheirTipEvening(now = new Date()) {
  const { start, end } = quietWindow();
  if (start === end) return now.getHours() >= 17;
  const shifted = (minOfDay(now) - start + 22 * 60 + 24 * 60) % (24 * 60);
  return shifted >= 17 * 60;
}

// What the tip card calls its evening tip: "Tonight's" only when it is night
// on the clock too; at 6 AM after a night shift it's a wind-down, not tonight.
export function tipEveningLabel(now = new Date()) {
  const h = now.getHours();
  return h >= 17 || h < 4 ? "Tonight's Tip" : "Wind-down Tip";
}

// A hello that fits both the clock and their day (Anna, Oct 12 2026). The
// first three hours after their quiet hours end are their morning, but "Good
// morning" at 4 PM to someone who sleeps days is odd: there it's "Rise and
// shine". Otherwise the clock decides, and after midnight it's a plain hello
// rather than "Good morning" to someone halfway through a night shift.
export function timeGreeting(now = new Date()) {
  const { start, end } = quietWindow();
  const m = minOfDay(now);
  const h = now.getHours();
  if (start !== end && inWindow(m, end, (end + 180) % (24 * 60))) {
    return h >= 4 && h < 12 ? 'Good morning' : 'Rise and shine';
  }
  if (h < 4) return 'Hey there';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Their next morning after `from`: once their next quiet hours are over, at
// 9 AM or an hour after quiet hours end, whichever is later (the same slot
// the server uses for a day's first reminder, quietHours.ts anchorToDaytime).
// At 1 AM that's this morning, not tomorrow's.
export function nextMorning(from = new Date()) {
  const { start, end } = quietWindow();
  if (start === end) {
    const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 9, 0, 0, 0);
    return t;
  }
  const m = minOfDay(from);
  const toEnd = inWindow(m, start, end)
    ? (end - m + 24 * 60) % (24 * 60)
    : ((start - m + 24 * 60) % (24 * 60)) + ((end - start + 24 * 60) % (24 * 60));
  const after = Math.max(9 * 60, end + 60) - end;
  const out = new Date(from.getTime() + (toEnd + after) * 60000);
  out.setSeconds(0, 0);
  return out;
}

// Nobody's doing an oil change at 7:30 PM. When a snooze would land in their
// evening (or night) and the task isn't due until a later day, slide the
// follow-up to their next morning instead of pinging again tonight.
export function smartSnoozeTime(task, snoozeUntil) {
  const t = snoozeUntil instanceof Date ? snoozeUntil : new Date(snoozeUntil);
  if (!isTheirEvening(t)) return t;
  if (!task?.due_date) return t;
  const due = new Date(task.due_date);
  if (startOfDay(due) <= startOfDay(t)) return t;
  return nextMorning(t);
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
  const evening = isTheirEvening(send);
  const due = task?.due_date ? new Date(task.due_date) : null;
  // A rhythm the person asked for ("keep reminding me until I do it").
  const askedRhythm = !!task?.reminder_interval && task.reminder_interval !== 'once';
  // A task set for a clock time ("litter box every day at 9 PM", "call them
  // at 3") is not a loose, undated task: it has a moment, and when that
  // moment comes it is time to do it. The soft words below ("no need to
  // tackle it tonight", "no pressure") are for a task with no time at all.
  // Anna, Oct 8 2026, on the 9 PM litter box alarm saying no need to tackle
  // it tonight: "it can't just say I don't need to do something that's
  // daily". A "by 5 PM" deadline's next_reminder is the deadline itself, not
  // a moment to start, so it keeps the deadline words.
  const pinned = !task?.day_only_task && task?.deadline_style !== 'by'
    && (!!task?.anchor_time || !!task?.event_time
      || (!!task?.recurrence_pattern && task.recurrence_pattern !== 'none'));
  const nextMs = task?.next_reminder ? new Date(task.next_reminder).getTime() : NaN;
  const atItsMoment = pinned && Number.isFinite(nextMs) && Math.abs(nextMs - send.getTime()) < 60 * 1000;

  // At the time the task is set for: the words every at-the-time reminder
  // uses (taskRecurrence's atTimeReminderFor, onTaskUpdate's un-check).
  if (atItsMoment) {
    const t = title.length > 40 ? `${title.slice(0, 37)}...` : title;
    return { title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` };
  }

  if (!due || Number.isNaN(due.getTime())) {
    return {
      title: `📌 ${title}`,
      // They asked to be reminded, or set a time, so no "no pressure" and no
      // "not tonight".
      body: askedRhythm || pinned
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