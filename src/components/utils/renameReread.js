// A renamed task is read again (Anna, Nov 12 2026: "any change to a task
// whether it be date, time, name etc should initiate a relook").
//
// saveTaskTitle (multiReminderScheduler.jsx) calls these two for a rename the
// person made by hand on a card or the details sheet:
//   readRename         asks the server what the new name adds (parseTask,
//                      { renamed }). Nothing is saved. Nobody is asked when the
//                      rename only took words out or moved them around.
//   applyRenameReading saves what it adds — a day, a time, a repeat — through
//                      the same steps a hand edit on the card takes, so the
//                      reminders are rebuilt the usual way: moveRemindersToDate
//                      for a new day or time (the date pills use it), and the
//                      repeat pill's steps for a repeat (one reminder at the
//                      task's own time, bookAtTimeReminder).
// What gets changed is decided in renameRereadPlan.js. The name itself is
// always kept exactly as they typed it.
//
// RULES.md §9: the name is saved before any of this, so closing the app
// halfway loses nothing; the words are read the moment they were typed; a
// moment already gone by is not applied; a time the parser picked from
// "tonight" stays out of quiet hours (time_stated false); and the fields are
// the ones every date edit writes, so older builds read them the same.

import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { trackFire } from '@/lib/appTrack';
import { stripGuessedRecurrence } from './taskSchedule';
import { addsNothing, skipsReread, planRenameChanges, renameSummary } from './renameRereadPlan';

const realId = (id) => id && !String(id).startsWith('planned_');

export async function readRename(taskBefore, newTitle) {
  const from = String(taskBefore?.title || '').trim();
  const to = String(newTitle || '').trim();
  if (!from || !to || skipsReread(taskBefore) || addsNothing(from, to)) return null;
  const res = await base44.functions.invoke('parseTask', { renamed: { from, to } });
  const reread = res?.data?.reread;
  if (!reread?.added || !reread?.parsed) return null;
  return reread;
}

// Returns { task, summary } when the task changed, or null.
export async function applyRenameReading(taskId, newTitle, reading) {
  if (!taskId || !reading?.added || !reading?.parsed) return null;
  // As saved now: the rename's own re-booking has just finished, and the
  // person may have finished, deleted or renamed it again in the meantime.
  const T = await base44.entities.Task.get(taskId).catch(() => null);
  if (!T || skipsReread(T) || String(T.title || '').trim() !== String(newTitle || '').trim()) return null;

  // Same guard a new task's parse goes through (a rhythm with no words behind
  // it is dropped; a day with no time is all-day).
  const parsed = stripGuessedRecurrence({ ...reading.parsed }, newTitle);
  const plan = planRenameChanges(T, reading.added, parsed, new Date());
  if (!plan.repeat && !plan.when) return null;

  const fields = { ...(plan.when?.fields || {}), ...(plan.repeat || {}) };
  const after = { ...T, ...fields };
  const repeats = !!after.recurrence_pattern && after.recurrence_pattern !== 'none';
  const email = (await base44.auth.me().catch(() => null))?.email || T.notification_recipient_email || null;

  if (plan.when) {
    const { moveRemindersToDate } = await import('./multiReminderScheduler');
    // A repeating task gets one reminder each time, at its own time, and
    // nothing is booked for a task parked on the Back Burner: for those the
    // old pushes are cancelled and the new day saved, with no plan booked.
    const bookPlan = !repeats && !T.silenced;
    await moveRemindersToDate(after, bookPlan ? plan.when.bookAt : null, fields);
  } else {
    // A repeat only: the repeat pill's own steps (TaskDetailsModal
    // handleSetRepeat). The lead-time plan goes; a rhythm keeps its pings.
    const planIds = (T.reminder_schedule || []).map((r) => r?.notification_id).filter(realId);
    const isRhythm = !!T.reminder_interval && T.reminder_interval !== 'once';
    const oldIds = Array.from(new Set(isRhythm ? planIds : [...(T.onesignal_notification_ids || []), ...planIds])).filter(realId);
    fields.reminder_schedule = [];
    fields.onesignal_notification_ids = isRhythm
      ? (T.onesignal_notification_ids || []).filter((id) => !oldIds.includes(id))
      : [];
    if (oldIds.length > 0) {
      const { cancelScheduledReminder } = await import('./reminderScheduler');
      await cancelScheduledReminder(oldIds).catch((e) => console.error('[renameReread] could not cancel the old plan:', e));
    }
    await base44.entities.Task.update(T.id, fields);
  }

  if (repeats && email) {
    const { atTimeReminderFor, bookAtTimeReminder } = await import('./taskRecurrence');
    const repeating = { ...after, reminder_schedule: [], onesignal_notification_ids: fields.onesignal_notification_ids || [] };
    if (atTimeReminderFor(repeating)) await bookAtTimeReminder(repeating, email);
  }

  const fresh = (await base44.entities.Task.get(T.id).catch(() => null)) || after;
  import('./widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});
  // Moved onto something else? The same double-booking check as when an
  // event is added or its time is changed on the card.
  if (plan.when && fresh.classification === 'event') {
    import('./eventConflicts').then((m) => m.announceEventConflict(fresh)).catch(() => {});
  }
  const summary = renameSummary(plan);
  if (summary) toast({ title: `${summary} ✓`, description: 'Read from the new name.' });
  trackFire('task_rename_reread', {
    props: {
      day: !!plan.when && reading.added.day === true,
      time: !!plan.when && reading.added.time === true,
      repeat: !!plan.repeat,
      became_event: plan.when?.becameEvent === true,
    },
  });
  try { window.dispatchEvent(new CustomEvent('tasks-changed')); } catch (e) { /* the list reloads on its own */ }
  return { task: fresh, summary };
}
