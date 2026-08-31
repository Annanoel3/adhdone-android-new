// LLM-powered multi-reminder scheduler.
// Calls the generateReminderSchedule backend function (which uses InvokeLLM
// with ADHD-focused prompt) to determine the optimal reminder schedule for
// any task. Results are cached by title in localStorage (24h TTL) since the
// minutes_before values are title-dependent, not date-dependent.

import { scheduleReminder } from './reminderScheduler';
import { base44 } from '@/api/base44Client';

// ── localStorage cache (24h TTL) ─────────────────────────────────────────────
function getCachedSchedule(title, urgency) {
  try {
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}_${urgency || 'medium'}`;
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

function setCachedSchedule(title, urgency, data) {
  try {
    // Only cache purely-relative schedules. Absolute clock-time reminders
    // (days_before/hour/minute) are tied to the original event time and must
    // be regenerated fresh for each new task so they don't fire late.
    const hasAbsolute = Array.isArray(data) && data.some(
      (r) => r.days_before != null || r.hour != null || r.minute != null
    );
    if (hasAbsolute) return;
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}_${urgency || 'medium'}`;
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

// ── Core: get reminder times (minutes_before + label) from LLM or cache ──────
async function fetchReminderSchedule(title, scheduledDateISO, urgency, dayOnly, classification) {
  // Day-only schedules have absolute clock times — never use the cache.
  let reminders = dayOnly ? null : getCachedSchedule(title, urgency);

  if (!reminders) {
    console.log(`[multiReminderScheduler] No cache hit for "${title}" (priority: ${urgency || 'medium'}) — calling LLM`);
    const response = await base44.functions.invoke('generateReminderSchedule', {
      title,
      scheduledDateISO,
      urgency,
      dayOnly,
      classification,
    });

    const data = response.data || response;
    reminders = data.reminders || [];

    if (reminders.length > 0) {
      setCachedSchedule(title, urgency, reminders);
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
function resolveReminderTimes(reminders, scheduledDateISO, title = '', classification) {
  const scheduled = new Date(scheduledDateISO);
  const bufferMs = Date.now() + 2 * 60 * 1000;
  // For EVENTS (meetings, concerts, appointments, parties), a reminder that
  // fires AFTER the event start time is useless — the event is already over or
  // in progress. Filter those out so the user never gets a "coming up in an
  // hour" notification 4 hours after the event already happened.
  const isEvent = classification === 'event';

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
      return {
        sendAtISO: reminderTime.toISOString(),
        // The reminder AT the user's chosen time is sacred — it is never
        // shifted for quiet hours and never deduped away by another reminder.
        exact: r.relative_minutes_before === 0,
        label: r.label,
        notification_title: r.notification_title || '📅 Upcoming',
        notification_body: r.notification_body || title,
      };
    })
    .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
    .filter(r => {
      // For events, never schedule a reminder after the event start time.
      if (isEvent && new Date(r.sendAtISO).getTime() > scheduled.getTime()) {
        console.log(`[multiReminderScheduler] Dropping post-event reminder "${r.label}" at ${r.sendAtISO} (event at ${scheduledDateISO})`);
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
      if (r.exact) return true; // never drop the at-the-chosen-time reminder
      const prevMin = Math.floor(new Date(arr[i - 1].sendAtISO).getTime() / 60000);
      const thisMin = Math.floor(new Date(r.sendAtISO).getTime() / 60000);
      return thisMin !== prevMin;
    });
}

/**
 * Schedules multiple LLM-determined reminders for a one-time task.
 * Returns an array of OneSignal notification IDs (may be empty).
 * Returns null if no reminders could be generated, so the caller
 * can fall back to a single reminder at the scheduled time.
 */
export async function scheduleMultiReminders({
  email,
  title,
  scheduledDateISO,
  taskId,
  urgency,
  dayOnly,
  classification,
}) {
  try {
    const reminders = await fetchReminderSchedule(title, scheduledDateISO, urgency, dayOnly, classification);
    if (!reminders || reminders.length === 0) return null;

    // Safety net: a task set for a specific clock time ALWAYS gets a reminder at
    // that exact time. Cached or LLM schedules sometimes omit it.
    if (!dayOnly && new Date(scheduledDateISO).getTime() > Date.now()
        && !reminders.some(r => r.relative_minutes_before === 0)) {
      const t = title.length > 40 ? `${title.slice(0, 37)}...` : title;
      reminders.push({
        days_before: null, hour: null, minute: null, relative_minutes_before: 0,
        label: 'right now',
        notification_title: `🔔 ${t}`,
        notification_body: `It's time — "${t}". You've got this! 💪`,
      });
    }

    const reminderTimes = resolveReminderTimes(reminders, scheduledDateISO, title, classification);
    if (reminderTimes.length === 0) return null;

    console.log(`[multiReminderScheduler] Scheduling ${reminderTimes.length} LLM-determined reminders for "${title}"`);

    const notificationIds = [];
    for (const reminder of reminderTimes) {
      try {
        const id = await scheduleReminder({
          email,
          title: reminder.notification_title,
          body: reminder.notification_body,
          sendAtISO: reminder.sendAtISO,
          taskId,
          exact: reminder.exact,
          data: {
            screen: '/TaskNotification',
            taskId,
            urgency: urgency || 'medium',
            type: 'task_reminder',
          },
        });
        if (id) notificationIds.push(id);
      } catch (e) {
        console.error(`[multiReminderScheduler] Failed to schedule "${reminder.label}":`, e);
      }
    }

    console.log(`[multiReminderScheduler] Scheduled ${notificationIds.length}/${reminderTimes.length} reminders`);

    // Persist the structured schedule so the task detail popover can let the
    // user individually cancel or add reminders.
    if (notificationIds.length > 0) {
      const structured = reminderTimes
        .slice(0, notificationIds.length)
        .map((r, i) => ({
          notification_id: notificationIds[i],
          send_at: r.sendAtISO,
          label: r.label,
          notification_title: r.notification_title,
          notification_body: r.notification_body,
        }));
      base44.entities.Task.update(taskId, { reminder_schedule: structured }).catch(() => {});
    }

    return notificationIds.length > 0 ? notificationIds : null;
  } catch (error) {
    console.error('[multiReminderScheduler] Error:', error);
    return null;
  }
}