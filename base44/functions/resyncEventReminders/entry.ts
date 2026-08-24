// One-time maintenance: regenerate reminder schedules for all of the current
// user's one-time EVENT tasks using the timezone-aware localReminderUtc logic.
// Fixes "morning of" reminders that were scheduled at 9:00 UTC (= 4 AM US-Central)
// by the old syncGoogleCalendar code. Cancels existing OneSignal notifications,
// rebuilds the schedule via generateReminderSchedule (deterministic for
// appointments/events — no LLM cost), and reschedules with correct local times.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { localReminderUtc } from '../../shared/timezoneReminders.ts';

Deno.serve(async (req) => {
  const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
  const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const timeZone = (user as any)?.timezone || null;
  console.log('[resyncEventReminders] user=', user.email, '| tz=', timeZone);

  // All the user's one-time event tasks with a future reminder time.
  const tasks = await base44.entities.Task.filter({
    reminder_interval: 'once',
    status: 'active',
    notification_recipient_email: user.email,
  }, '-updated_date', 500);

  const futureEvents = tasks.filter(t => t.next_reminder && new Date(t.next_reminder).getTime() > Date.now() + 2 * 60 * 1000);
  console.log('[resyncEventReminders] found', tasks.length, 'once-tasks,', futureEvents.length, 'with future reminders');

  let processed = 0, rescheduled = 0, skipped = 0, errors = 0;

  for (const task of futureEvents) {
    processed++;
    try {
      // 1. Cancel existing OneSignal notifications (both id arrays).
      const allIds = [
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map((r: any) => r?.notification_id).filter(Boolean)),
      ];
      for (const nid of allIds) {
        try {
          await fetch(`https://onesignal.com/api/v1/notifications/${nid}?app_id=${ONESIGNAL_APP_ID}`, {
            method: 'DELETE',
            headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` },
          });
        } catch (e) { /* best-effort */ }
      }

      // 2. Regenerate the schedule spec (deterministic for appointments/events).
      const schedRes = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
        title: task.title,
        scheduledDateISO: task.next_reminder,
        urgency: task.urgency,
        classification: task.classification || 'event',
      });
      const schedData = schedRes?.data || schedRes || {};
      const rawReminders = schedData.reminders || [];
      if (!rawReminders.length) { skipped++; continue; }

      // 3. Recompute times with timezone-aware conversion.
      const scheduledDate = new Date(task.next_reminder);
      const bufferMs = Date.now() + 2 * 60 * 1000;
      const reminderTimes = rawReminders
        .map((r: any) => {
          let reminderTime;
          if (r.relative_minutes_before != null) {
            reminderTime = new Date(scheduledDate.getTime() - r.relative_minutes_before * 60 * 1000);
          } else {
            reminderTime = localReminderUtc(scheduledDate, r.days_before || 0, r.hour || 0, r.minute || 0, timeZone);
          }
          return {
            sendAtISO: reminderTime.toISOString(),
            label: r.label,
            notification_title: r.notification_title || '📅 Upcoming',
            notification_body: r.notification_body || task.title,
          };
        })
        .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
        .filter(r => {
          // For events, never schedule a reminder after the event start time.
          if ((task.classification || 'event') === 'event' && new Date(r.sendAtISO).getTime() > scheduledDate.getTime()) {
            console.log(`[resyncEventReminders] Dropping post-event reminder "${r.label}" at ${r.sendAtISO}`);
            return false;
          }
          // For events, never schedule a reminder more than 1 day before.
          if ((task.classification || 'event') === 'event') {
            const advanceMs = scheduledDate.getTime() - new Date(r.sendAtISO).getTime();
            if (advanceMs > 24 * 60 * 60 * 1000) {
              console.log(`[resyncEventReminders] Dropping far-out event reminder "${r.label}" at ${r.sendAtISO} (${Math.round(advanceMs / 86400000)}d before)`);
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => new Date(a.sendAtISO).getTime() - new Date(b.sendAtISO).getTime());

      if (!reminderTimes.length) { skipped++; continue; }

      // 4. Schedule new OneSignal pushes.
      const notificationIds = [];
      for (const reminder of reminderTimes) {
        try {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
            toUserExternalId: user.email,
            title: reminder.notification_title,
            body: reminder.notification_body,
            sendAtISO: reminder.sendAtISO,
            data: {
              screen: '/TaskNotification',
              taskId: task.id,
              urgency: task.urgency || 'medium',
              type: 'task_reminder',
            },
            buttons: [
              { id: 'snooze_15', text: 'Snooze 15 min' },
              { id: 'snooze_60', text: 'Snooze 1 hour' },
              { id: 'complete', text: '✅ Done' },
            ],
          });
          const result = res?.data || res;
          if (result?.notificationId) notificationIds.push(result.notificationId);
        } catch (e) {
          console.log('[resyncEventReminders] schedulePush failed for', task.title, ':', e.message);
        }
      }

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
        await base44.entities.Task.update(task.id, {
          onesignal_notification_ids: notificationIds,
          reminder_schedule: structured,
        });
        rescheduled++;
        console.log('[resyncEventReminders] ✓', task.title, '→', reminderTimes.map(r => `${r.label}@${r.sendAtISO}`).join(', '));
      } else {
        skipped++;
      }
    } catch (e) {
      errors++;
      console.error('[resyncEventReminders] error on', task.title, ':', e.message);
    }
  }

  const summary = { processed, rescheduled, skipped, errors, total_events: futureEvents.length };
  console.log('[resyncEventReminders] DONE', JSON.stringify(summary));
  return Response.json(summary);
});