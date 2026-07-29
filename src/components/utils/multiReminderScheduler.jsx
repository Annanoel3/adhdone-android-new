// LLM-powered multi-reminder scheduler.
// Calls the generateReminderSchedule backend function (which uses InvokeLLM
// with ADHD-focused prompt) to determine the optimal reminder schedule for
// any task. Results are cached by title in localStorage (24h TTL) since the
// minutes_before values are title-dependent, not date-dependent.

import { scheduleReminder } from './reminderScheduler';
import { base44 } from '@/api/base44Client';

// ── localStorage cache (24h TTL) ─────────────────────────────────────────────
function getCachedSchedule(title) {
  try {
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

function setCachedSchedule(title, data) {
  try {
    const key = `adhd_reminder_cache_${title.toLowerCase().trim()}`;
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

// ── Core: get reminder times (minutes_before + label) from LLM or cache ──────
async function fetchReminderSchedule(title, scheduledDateISO) {
  // Try cache first
  let reminders = getCachedSchedule(title);

  if (!reminders) {
    console.log(`[multiReminderScheduler] No cache hit for "${title}" — calling LLM`);
    const response = await base44.functions.invoke('generateReminderSchedule', {
      title,
      scheduledDateISO,
    });

    const data = response.data || response;
    reminders = data.reminders || [];

    if (reminders.length > 0) {
      setCachedSchedule(title, reminders);
    }
  } else {
    console.log(`[multiReminderScheduler] Cache hit for "${title}" — ${reminders.length} reminders`);
  }

  return reminders;
}

// ── Convert reminder specs to ISO times, filtering past reminders ────────────
// Supports two reminder types from the LLM:
//   ABSOLUTE: { days_before, hour, minute } — a specific clock time on a day
//   RELATIVE: { relative_minutes_before } — N minutes before the event time
function resolveReminderTimes(reminders, scheduledDateISO, title = '') {
  const scheduled = new Date(scheduledDateISO);
  const bufferMs = Date.now() + 2 * 60 * 1000;

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
        label: r.label,
        notification_title: r.notification_title || '📅 Upcoming',
        notification_body: r.notification_body || title,
      };
    })
    .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
    .sort((a, b) => new Date(a.sendAtISO).getTime() - new Date(b.sendAtISO).getTime());
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
}) {
  try {
    const reminders = await fetchReminderSchedule(title, scheduledDateISO);
    if (!reminders || reminders.length === 0) return null;

    const reminderTimes = resolveReminderTimes(reminders, scheduledDateISO, title);
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
          data: {
            screen: '/TaskNotification',
            taskId,
            urgency: urgency || 'medium',
            type: 'task_reminder',
          },
          buttons: [
            { id: 'snooze_15', text: 'Snooze 15 min' },
            { id: 'snooze_60', text: 'Snooze 1 hour' },
            { id: 'complete', text: '✅ Done' },
          ],
        });
        if (id) notificationIds.push(id);
      } catch (e) {
        console.error(`[multiReminderScheduler] Failed to schedule "${reminder.label}":`, e);
      }
    }

    console.log(`[multiReminderScheduler] Scheduled ${notificationIds.length}/${reminderTimes.length} reminders`);

    // Persist a human-readable summary so the task detail popover can show
    // exactly how many reminders the LLM decided and when they fire.
    if (notificationIds.length > 0) {
      const summary = `${notificationIds.length} smart reminder${notificationIds.length === 1 ? '' : 's'}:\n` +
        reminderTimes
          .map(r => {
            const dt = new Date(r.sendAtISO);
            const formatted = dt.toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
            });
            return `• ${r.label} — ${formatted}`;
          })
          .join('\n');
      base44.entities.Task.update(taskId, { reminder_schedule_summary: summary }).catch(() => {});
    }

    return notificationIds.length > 0 ? notificationIds : null;
  } catch (error) {
    console.error('[multiReminderScheduler] Error:', error);
    return null;
  }
}