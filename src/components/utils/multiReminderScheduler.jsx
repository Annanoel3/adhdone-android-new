// LLM-powered multi-reminder scheduler.
// Calls the generateReminderSchedule backend function (OpenAI, never Base44's
// LLM — RULES.md §1) with an ADHD-focused prompt to determine the optimal reminder schedule for
// any task. Results are cached by title in localStorage (24h TTL) since the
// minutes_before values are title-dependent, not date-dependent.

import { scheduleReminder, resolveSendTime, cancelScheduledReminder, isInQuietHours } from './reminderScheduler';
import { getReminderCopy } from './reminderCopy';
import { commitNotificationIds } from './notificationOwnership';
import { base44 } from '@/api/base44Client';

// ── localStorage cache (24h TTL) ─────────────────────────────────────────────
function getCachedSchedule(title, urgency, location) {
  try {
    // Location is part of the key: the lead reminder is drive-time dependent,
    // so a schedule built for one place must never be reused for another.
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}_${urgency || 'medium'}_${(location || '').toLowerCase().trim()}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;
    // Safety net: never reuse a cached schedule that contains absolute
    // clock-time reminders — those are pinned to a specific event time and
    // would fire at the wrong time for a task at a different time of day.
    const hasAbsolute = Array.isArray(data) && data.some(
      (r) => r.days_before != null || r.hour != null || r.minute != null
    );
    if (hasAbsolute) return null;
    return data;
  } catch {
    return null;
  }
}

function setCachedSchedule(title, urgency, data, location) {
  try {
    // Only cache purely-relative schedules. Absolute clock-time reminders
    // (days_before/hour/minute) are tied to the original event time and must
    // be regenerated fresh for each new task so they don't fire late.
    const hasAbsolute = Array.isArray(data) && data.some(
      (r) => r.days_before != null || r.hour != null || r.minute != null
    );
    if (hasAbsolute) return;
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}_${urgency || 'medium'}_${(location || '').toLowerCase().trim()}`;
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

// ── Core: get reminder times (minutes_before + label) from LLM or cache ──────
async function fetchReminderSchedule(title, scheduledDateISO, urgency, dayOnly, classification, deadlineStyle, location, reminderWish) {
  // Day-only schedules have absolute clock times — never use the cache. A task
  // with the user's own reminder wish never uses it either: the cache is keyed
  // on title + priority, and the wish is what makes this one different. Nor
  // does a "by" deadline: its safety net isn't the plan an "at" task with the
  // same title would get, and neither may stand in for the other.
  const noCache = dayOnly || reminderWish || deadlineStyle === 'by';
  let reminders = noCache ? null : getCachedSchedule(title, urgency, location);

  if (!reminders) {
    console.log(`[multiReminderScheduler] No cache hit for "${title}" (priority: ${urgency || 'medium'}) — calling LLM`);
    const response = await base44.functions.invoke('generateReminderSchedule', {
      title,
      scheduledDateISO,
      urgency,
      dayOnly,
      classification,
      deadlineStyle,
      location,
      reminderWish: reminderWish || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const data = response.data || response;
    reminders = data.reminders || [];

    if (reminders.length > 0 && !noCache) {
      setCachedSchedule(title, urgency, reminders, location);
    }
  } else {
    console.log(`[multiReminderScheduler] Cache hit for "${title}" (priority: ${urgency || 'medium'}) — ${reminders.length} reminders`);
  }

  return reminders;
}

// ── Convert reminder specs to ISO times, filtering past reminders ────────────
// Supports two reminder types from the LLM:
//   ABSOLUTE: { days_before, hour, minute } — a specific clock time on a day
//   RELATIVE: { relative_minutes_before } — N minutes before the event time
// `timeStated`: they set this clock time themselves (Task.time_stated). Then
// the reminder AT that time goes out at that time even inside quiet hours (a
// 5 AM flight; RULES.md §9 Q4). Every other reminder — the heads-ups the app
// adds, or the at-time one for a time the app picked — follows quiet hours: it
// moves to when they end, and is dropped below when that is past the time.
function resolveReminderTimes(reminders, scheduledDateISO, title = '', classification, dayOnly, timeStated = false) {
  const scheduled = new Date(scheduledDateISO);
  const bufferMs = Date.now() + 2 * 60 * 1000;
  // Anything tied to a specific clock time — an event OR a task the user set
  // for an exact time ("drink water at 11:30 AM") — must never be reminded
  // about AFTER that time. A "coming up in an hour" ping an hour late is worse
  // than useless. Once the time passes, the overdue system takes over.
  // Only day-only tasks (no clock time) may be nudged later in the day.
  const enforceBeforeTime = !dayOnly;

  return reminders
    .map(r => {
      let reminderTime;
      if (r.relative_minutes_before != null) {
        // RELATIVE: minutes before the event time
        reminderTime = new Date(scheduled.getTime() - r.relative_minutes_before * 60 * 1000);
      } else {
        // ABSOLUTE: specific clock time on a specific day
        reminderTime = new Date(scheduled);
        reminderTime.setDate(reminderTime.getDate() - (r.days_before || 0));
        reminderTime.setHours(r.hour || 0, r.minute || 0, 0, 0);
      }
      const atTime = r.relative_minutes_before === 0;
      // Quiet hours are applied HERE, before the "never after the time" check
      // below, so a heads-up pushed past the time by quiet hours is dropped
      // instead of arriving after it (an hour-before for a 5 AM flight used to
      // go out at 8 AM).
      if (!(atTime && timeStated) && isInQuietHours(reminderTime)) {
        reminderTime = new Date(resolveSendTime(reminderTime.toISOString(), false));
      }
      return {
        sendAtISO: reminderTime.toISOString(),
        // Already placed for quiet hours above: booked at exactly this time.
        exact: true,
        // The reminder AT the user's chosen time is never deduped away by
        // another reminder.
        atTime,
        // Clock-time reminders ("morning of", "night before") are check-ins:
        // they yield to time-critical pushes in the collision ledger.
        checkin: r.relative_minutes_before == null,
        label: r.label,
        notification_title: r.notification_title || '📅 Upcoming',
        notification_body: r.notification_body || title,
      };
    })
    .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
    .filter(r => {
      if (enforceBeforeTime && new Date(r.sendAtISO).getTime() > scheduled.getTime()) {
        console.log(`[multiReminderScheduler] Dropping post-time reminder "${r.label}" at ${r.sendAtISO} (task at ${scheduledDateISO})`);
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.sendAtISO).getTime() - new Date(b.sendAtISO).getTime())
    // Deduplicate by send time: the schedule sometimes produces two reminders
    // that resolve to the same clock time (e.g. "morning of at 9am" + "1 hour
    // before" for a 10am task both land at 9:00). Keep only the first reminder
    // for each unique time so the user gets one notification at 9am, not two.
    .filter((r, i, arr) => {
      if (i === 0) return true;
      if (r.atTime) return true; // never drop the at-the-chosen-time reminder
      const prevMin = Math.floor(new Date(arr[i - 1].sendAtISO).getTime() / 60000);
      const thisMin = Math.floor(new Date(r.sendAtISO).getTime() / 60000);
      return thisMin !== prevMin;
    });
}

/**
 * Schedules multiple LLM-determined reminders for a one-time task.
 * Returns an array of OneSignal notification IDs (may be empty).
 * Returns null if no reminders could be generated, so the caller
 * can fall back to a single reminder at the scheduled time — except for a
 * deadline with a clock time ("by 5 PM"), which returns an empty array
 * instead: it must never get a reminder AT the deadline (too late by then);
 * smart nudges own its run-up and take it over as overdue after.
 */
export async function scheduleMultiReminders({
  email,
  title,
  scheduledDateISO,
  taskId,
  urgency,
  dayOnly,
  classification,
  deadlineStyle,
  location,
  reminderWish,
  timeStated,
}) {
  try {
    // Every caller passes taskId, so the location is looked up here rather than
    // threaded through a dozen call sites — the backend needs it to turn the
    // lead reminder into a real "leave now" based on drive time.
    // The edit screens don't pass whether it's a "by" deadline — read that
    // off the task too, so an edited "by 5 PM" task keeps its deadline
    // behaviour instead of getting an "at 5 PM" plan. (Whether it's all-day is
    // NOT read: a caller that leaves dayOnly out has just given it a time.)
    // Whether they set the clock time themselves (Task.time_stated) is read
    // the same way when the caller doesn't say. A caller that has just saved
    // a time the person picked passes timeStated: true, so a save still on
    // its way can't make it read as false.
    // Whether it's an event is read the same way: the date and reminder pills
    // don't say, and an event planned as a plain task got an AI plan around a
    // start time nobody set (Anna, Oct 12 2026: Bike Night, no time, got
    // "check your bike" at 1 PM, "time to go" at 5:30 and "it's time" at 6).
    let taskLocation = location;
    let style = deadlineStyle;
    let stated = timeStated;
    if ((taskLocation === undefined || style === undefined || stated === undefined || classification === undefined) && taskId) {
      try {
        const task = await base44.entities.Task.get(taskId);
        if (taskLocation === undefined) taskLocation = task?.location || '';
        if (style === undefined) style = task?.deadline_style;
        if (stated === undefined) stated = task?.time_stated === true;
        if (classification === undefined) classification = task?.classification;
      } catch {
        if (taskLocation === undefined) taskLocation = '';
      }
    }
    stated = stated === true;
    dayOnly = !!dayOnly;
    deadlineStyle = style === 'by' ? 'by' : 'on';
    const clockDeadline = !dayOnly && deadlineStyle === 'by' && classification !== 'event';

    // Only an event gets a plan of reminders. Every other task is Smart
    // Reminders' (Anna, Oct 12 2026: "It's literally just supposed to be smart
    // reminders and events and birthdays ... and tasks that the user gave a
    // specific time to"). A task with its own time gets ONE reminder, at that
    // time; whether anything comes before it is Smart Reminders' call. An
    // all-day task or a "by" deadline gets nothing booked here: no "📅 due
    // today" push, no AI heads-ups (they were landing on top of Smart
    // Reminders, which never saw them coming).
    if (classification !== 'event') {
      if (dayOnly || deadlineStyle === 'by') return [];
      const at = new Date(scheduledDateISO);
      if (!(at.getTime() > Date.now() + 2 * 60 * 1000)) return [];
      // A time the app picked never rings inside quiet hours; moving it to
      // when they end would put it after the time it was for.
      if (!stated && isInQuietHours(at)) return [];
      const t = title.length > 40 ? `${title.slice(0, 37)}...` : title;
      const words = { title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` };
      let id = null;
      try {
        id = await scheduleReminder({
          email,
          ...words,
          sendAtISO: at.toISOString(),
          taskId,
          // Already checked against quiet hours above: booked at exactly this time.
          exact: true,
          data: { screen: '/TaskNotification', taskId, urgency: urgency || 'medium', type: 'task_reminder' },
          buttons: [
            { id: 'snooze_15', text: 'Snooze 15 min' },
            { id: 'snooze_60', text: 'Snooze 1 hour' },
            { id: 'complete', text: '✅ Done' },
          ],
        });
      } catch (e) {
        console.error('[multiReminderScheduler] Could not book the reminder at its time:', e);
      }
      // Kept as a PLANNED entry when it couldn't be booked (no push link yet):
      // the hourly refill books it.
      const entry = {
        notification_id: id || `planned_0_${Date.now().toString(36)}`,
        send_at: at.toISOString(),
        label: 'at the time',
        notification_title: words.title,
        notification_body: words.body,
      };
      base44.entities.Task.update(taskId, { reminder_schedule: [entry] }).catch(() => {});
      return id ? [id] : [];
    }
    const reminders = await fetchReminderSchedule(title, scheduledDateISO, urgency, dayOnly, classification, deadlineStyle, taskLocation, reminderWish);
    if (!reminders || reminders.length === 0) return clockDeadline ? [] : null;

    // Safety net: a task set for a specific clock time ALWAYS gets a reminder at
    // that exact time. Cached or LLM schedules sometimes omit it. (Not a "by"
    // deadline — see above.)
    if (!dayOnly && !clockDeadline && new Date(scheduledDateISO).getTime() > Date.now()
        && !reminders.some(r => r.relative_minutes_before === 0)) {
      const t = title.length > 40 ? `${title.slice(0, 37)}...` : title;
      reminders.push({
        days_before: null, hour: null, minute: null, relative_minutes_before: 0,
        label: 'right now',
        notification_title: `🔔 ${t}`,
        notification_body: `It's time — "${t}". You've got this! 💪`,
      });
    }

    const reminderTimes = resolveReminderTimes(reminders, scheduledDateISO, title, classification, dayOnly, stated);
    if (reminderTimes.length === 0) return clockDeadline ? [] : null;

    console.log(`[multiReminderScheduler] Scheduling ${reminderTimes.length} LLM-determined reminders for "${title}"`);

    // Track each reminder together with the ID it actually got, so the saved
    // schedule can never claim a reminder exists when scheduling failed.
    const scheduled = [];
    for (const reminder of reminderTimes) {
      try {
        const id = await scheduleReminder({
          email,
          title: reminder.notification_title,
          body: reminder.notification_body,
          sendAtISO: reminder.sendAtISO,
          taskId,
          exact: reminder.exact,
          // The type decides the buttons the phone puts on the push (TaskActions):
          // a task reminder gets Done and Snooze; an event's reminder only Snooze
          // (an event isn't something you finish early); and an event's night-
          // before heads-up ("anything to ask? tap to write it down") gets none —
          // the tap is the point. Events used to go out as task reminders, so a
          // meeting's heads-up carried Done and Snooze (Anna, Oct 7 2026).
          data: {
            screen: '/TaskNotification',
            taskId,
            urgency: urgency || 'medium',
            type: reminder.checkin ? 'task_checkin'
              : classification === 'event'
                ? (/night before/i.test(reminder.label || '') ? 'event_heads_up' : 'event_reminder')
                : 'task_reminder',
          },
        });
        if (id) scheduled.push({ reminder, id });
      } catch (e) {
        console.error(`[multiReminderScheduler] Failed to schedule "${reminder.label}":`, e);
      }
    }

    console.log(`[multiReminderScheduler] Scheduled ${scheduled.length}/${reminderTimes.length} reminders`);

    const notificationIds = scheduled.map((s) => s.id);

    // Persist the structured schedule so the task detail popover can let the
    // user individually cancel or add reminders. Each entry is paired with the
    // notification that was really created, at the time it will really fire.
    if (scheduled.length > 0) {
      const structured = scheduled.map(({ reminder: r, id }) => ({
        notification_id: id,
        send_at: resolveSendTime(r.sendAtISO, r.exact),
        label: r.label,
        notification_title: r.notification_title,
        notification_body: r.notification_body,
      }));
      base44.entities.Task.update(taskId, { reminder_schedule: structured }).catch(() => {});
    } else {
      // Nothing could be booked (this phone isn't subscribed for pushes yet —
      // notifications were declined, or the link isn't there). The plan is
      // kept as PLANNED entries, the same placeholder ids the refill job
      // promotes for far-off dates, so the moment pushes can reach this
      // account the reminders get booked instead of being lost for good.
      const planned = reminderTimes.map((r, i) => ({
        notification_id: `planned_${i}_${Date.now().toString(36)}`,
        send_at: resolveSendTime(r.sendAtISO, r.exact),
        label: r.label,
        notification_title: r.notification_title,
        notification_body: r.notification_body,
      }));
      base44.entities.Task.update(taskId, { reminder_schedule: planned }).catch(() => {});
    }

    return notificationIds.length > 0 ? notificationIds : (clockDeadline ? [] : null);
  } catch (error) {
    console.error('[multiReminderScheduler] Error:', error);
    return null;
  }
}

/**
 * Moves a one-time task's reminders to a new date: every push booked for the
 * old one is cancelled, `updates` (the new dates) are saved, and a fresh plan
 * is booked for `whenISO` — or, when no plan comes back, the single reminder
 * a new task would get (same fallback as task creation). Shared by the
 * details card's due-date pill and the Home card's date pill, so a date
 * changed in either place moves the reminders the same way. (The Home pill
 * used to change due_date only, and every reminder kept going off for the
 * old day.) Returns the ids now booked.
 */
export async function moveRemindersToDate(task, whenISO, updates = {}) {
  const oldIds = Array.from(new Set([
    ...(task.onesignal_notification_ids || []),
    ...((task.reminder_schedule || []).map((r) => r?.notification_id)),
  ])).filter((id) => id && !String(id).startsWith('planned_'));
  if (oldIds.length > 0) {
    await cancelScheduledReminder(oldIds);
  }
  await base44.entities.Task.update(task.id, {
    ...updates,
    onesignal_notification_ids: [],
    reminder_schedule: [],
  });
  if (!whenISO) return [];

  const currentUser = await base44.auth.me();
  const dayOnly = !!task.day_only_task;
  // A time they set themselves keeps its reminder at that time, quiet hours
  // or not (RULES.md §9 Q4); the date pills pass time_stated in `updates`.
  const stated = { ...task, ...updates }.time_stated === true;
  const multiIds = await scheduleMultiReminders({
    email: currentUser.email,
    title: task.title,
    scheduledDateISO: whenISO,
    taskId: task.id,
    urgency: task.urgency,
    classification: task.classification,
    // An all-day task keeps its all-day plan (the night before, that day) —
    // without this its 11:59 PM due time was planned as a clock time, with a
    // push at 11:59 PM.
    dayOnly,
    timeStated: stated,
  });
  if (multiIds) {
    await commitNotificationIds(task.id, multiIds);
    return multiIds;
  }
  // No plan came back. A "by 5 PM" deadline never gets a lone reminder AT
  // the deadline (smart nudges own it), and an all-day task has no clock time.
  if (dayOnly || task.deadline_style === 'by' || new Date(whenISO).getTime() <= Date.now() + 2 * 60 * 1000) {
    return [];
  }
  let notificationId = null;
  try {
    notificationId = await scheduleReminder({
      email: currentUser.email,
      ...getReminderCopy({ ...task, ...updates }, new Date(whenISO)),
      sendAtISO: whenISO,
      taskId: task.id,
      exact: stated,
      data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency, type: 'task_reminder' },
      buttons: [
        { id: 'snooze_15', text: 'Snooze 15 min' },
        { id: 'snooze_60', text: 'Snooze 1 hour' },
        { id: 'complete', text: '✅ Done' },
      ],
    });
  } catch (e) {
    console.error('[multiReminderScheduler] Could not book the reminder for the new date:', e);
  }
  const ids = notificationId ? [notificationId] : [];
  await commitNotificationIds(task.id, ids);
  return ids;
}

// ── Renaming a task ──────────────────────────────────────────────────────────
// Saves a task's new name and re-books every push still ahead under it, so a
// reminder never goes out with the old name (Oct 12 2026: two misheard voice
// tasks were renamed, "Call me like your company" to "Call the electric
// Company", and the next morning's pushes were still booked as "Call the
// Company"). The details sheet only did this for a task with a reminder plan,
// and renaming on the card did it for nothing. The title is saved first, so
// nothing below can lose it. A rhythm task ("every hour") is re-booked by
// onTaskUpdate when its title changes. `taskIn` is the task as it was before
// the rename (its old name is what gets swapped out of the reminders' words).
export async function saveTaskTitle(taskIn, newTitle) {
  const title = String(newTitle || '').trim();
  if (!taskIn?.id || !title) return;
  await base44.entities.Task.update(taskIn.id, { title });
  if (taskIn.reminder_interval && taskIn.reminder_interval !== 'once') return;
  // As saved: a card's copy can be older than what was booked since.
  const task = (await base44.entities.Task.get(taskIn.id).catch(() => null)) || taskIn;
  if (task.reminder_interval && task.reminder_interval !== 'once') return;
  const oldTitle = String(taskIn.title || '').trim();
  if (!oldTitle || oldTitle === title) return;
  const soon = Date.now() + 2 * 60 * 1000;
  let email = null;
  try { email = (await base44.auth.me())?.email || null; } catch (e) { email = null; }
  const data = { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency, type: 'task_reminder' };
  const buttons = [
    { id: 'snooze_15', text: 'Snooze 15 min' },
    { id: 'snooze_60', text: 'Snooze 1 hour' },
    { id: 'complete', text: '✅ Done' },
  ];
  const isBooked = (id) => id && !String(id).startsWith('planned_');

  if (Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0) {
    // Every reminder in the plan still ahead is re-booked at the same moment,
    // each in its own words with the task's name swapped inside them. Ones
    // already sent stay as they were: re-booking a past time is refused, and
    // that one refusal used to abort the whole loop.
    const short = (t) => (t.length > 40 ? `${t.slice(0, 37)}...` : t);
    const renameIn = (text, isBody) => {
      const src = String(text || '');
      if (oldTitle.length >= 3 && src.includes(oldTitle)) return src.split(oldTitle).join(title);
      const oldShort = short(oldTitle);
      if (oldShort !== oldTitle && src.includes(oldShort)) return src.split(oldShort).join(short(title));
      // Words that never named the task: keep them, and still say what the
      // reminder is for.
      if (isBody) return src ? `${title}: ${src}` : title;
      const lead = ((src.match(/^[^\p{L}\p{N}]+/u) || [''])[0]).trim();
      return `${lead || '📌'} ${title}`;
    };
    const newSchedule = [];
    const replacedIds = [];
    const addedIds = [];
    for (const entry of task.reminder_schedule) {
      const sendMs = entry?.send_at ? new Date(entry.send_at).getTime() : NaN;
      if (!Number.isFinite(sendMs) || sendMs <= soon) {
        newSchedule.push(entry);
        continue;
      }
      const t = renameIn(entry.notification_title, false);
      const b = renameIn(entry.notification_body, true);
      const oldId = entry.notification_id || null;
      // Not booked yet (planned far out) or parked on the Back Burner: only
      // its words change — whoever books it later books these.
      if (!isBooked(oldId) || task.silenced) {
        newSchedule.push({ ...entry, notification_title: t, notification_body: b });
        continue;
      }
      let newId = null;
      try {
        // The old push goes first: the send ledger turns away a second push
        // for the same task at the same minute.
        await cancelScheduledReminder([oldId]);
        replacedIds.push(oldId);
        newId = await scheduleReminder({
          email,
          title: t,
          body: b,
          sendAtISO: entry.send_at,
          taskId: task.id,
          // send_at is already the real send time (moved for quiet hours when
          // it was first booked) — keep it exactly.
          exact: true,
          data,
          buttons,
        });
      } catch (error) {
        console.error('Could not re-book one reminder with the new title:', error);
      }
      if (newId) addedIds.push(newId);
      // Saved even when the booking failed, with no id: the hourly refill
      // books any schedule entry that has none.
      newSchedule.push({ ...entry, notification_id: newId || null, notification_title: t, notification_body: b });
    }
    // Anything booked outside the plan (a snooze) is kept.
    const ids = [
      ...(task.onesignal_notification_ids || []).filter((id) => !replacedIds.includes(id)),
      ...addedIds,
    ];
    await base44.entities.Task.update(task.id, {
      reminder_schedule: newSchedule,
      onesignal_notification_ids: Array.from(new Set(ids)),
    });
  } else {
    // No plan, one push booked: the reminder at the task's own time (a
    // day-only task's "📅" on its day, or "🔔" at its time). Re-booked the way
    // it was first booked, in the words for the new name. More than one id
    // means pushes this can't tell apart, so they're left as they are.
    const booked = (task.onesignal_notification_ids || []).filter(isBooked);
    const at = task.next_reminder ? new Date(task.next_reminder) : null;
    if (task.silenced || booked.length !== 1 || !at || !Number.isFinite(at.getTime()) || at.getTime() <= soon) return;
    await cancelScheduledReminder(booked).catch(() => {});
    let newId = null;
    try {
      newId = await scheduleReminder({
        email,
        ...getReminderCopy(task, at),
        sendAtISO: at.toISOString(),
        taskId: task.id,
        // A time they said themselves goes out then, quiet hours or not.
        exact: task.time_stated === true,
        data,
        buttons,
      });
    } catch (error) {
      console.error('Could not re-book the reminder with the new title:', error);
    }
    await commitNotificationIds(task.id, newId ? [newId] : []);
  }
  import('./widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});
}
