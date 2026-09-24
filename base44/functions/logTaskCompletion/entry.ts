import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveQuietHours, adjustForQuietHours, userTimeZone } from '../../shared/quietHours.ts';
import { ledgerCancel } from '../../shared/sendLedger.ts';

// Records ONE analytics row when a task is completed, with the reminder history
// that led up to it. Driven by the Task-update workflow rather than the UI,
// because a task can be completed from half a dozen places (card, today's list,
// notification screen, subtask roll-up) and every one of them must be counted.
//
// Deliberately stores no task title or user-written text — only counts, timings
// and flags.
// "45 minutes", "an hour", "an hour and a half", "2 hours" — for the follow-up
// text, which is written when it's booked, so the wait itself is the elapsed time.
function sinceText(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} minutes`;
  if (m < 75) return 'an hour';
  if (m < 105) return 'an hour and a half';
  const h = Math.round(m / 60);
  return `${h} hours`;
}

// Takes back a follow-up booked for a task that is no longer done.
async function cancelPush(base44: any, id: string) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  try {
    await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${key}` },
    });
  } catch (e) {
    console.error('[logTaskCompletion] follow-up cancel failed:', e?.message);
  }
  await ledgerCancel(base44, [id]);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const taskId = body.task_id;
    if (!taskId) return Response.json({ error: 'task_id required' }, { status: 400 });

    const task = await base44.asServiceRole.entities.Task.get(taskId);
    if (!task) return Response.json({ skipped: 'no task' });

    const email = task.notification_recipient_email || task.created_by || '';
    const completedAt = task.completed_at ? new Date(task.completed_at) : new Date();
    const createdAt = new Date(task.created_date);

    // Every push that actually went out for this task before it got done.
    let reminders = [];
    if (email) {
      const ledger = await base44.asServiceRole.entities.NotificationLedger.filter({
        user_email: email,
        task_id: taskId,
      });
      reminders = ledger
        .filter((l) => new Date(l.send_at) <= completedAt)
        .sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
    }

    // The chore's next step, if the parser found one ("Move the laundry to the
    // dryer", 60 minutes after this was marked done). Booked here because this
    // runs for every way a task can be completed. The push carries the task id
    // so the send ledger refuses a second copy if the workflow fires twice.
    const fuTitle = String(task.follow_up_title || '').trim();
    const fuMinutes = Number(task.follow_up_minutes);
    if (email && fuTitle && Number.isFinite(fuMinutes) && fuMinutes >= 5 && fuMinutes <= 1440) {
      try {
        const owner = (await base44.asServiceRole.entities.User.filter({ email }))?.[0] || null;
        // Not in the middle of the night: a follow-up that would land in the
        // owner's quiet hours waits until they end, like every other reminder.
        // The text says how long ago it really was by then.
        const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(owner);
        let sendAt = new Date(Date.now() + Math.round(fuMinutes) * 60000);
        if (quietEnabled) sendAt = adjustForQuietHours(sendAt, startMin, endMin, userTimeZone(owner));
        const waitMinutes = (sendAt.getTime() - Date.now()) / 60000;
        // Rings out loud only the way this task's own reminders do: the task's
        // own switch wins ("notification" = never an alarm), else the account
        // default.
        const data: Record<string, unknown> = { type: 'follow_up', taskId };
        if (task.alert_style === 'alarm' || (task.alert_style !== 'notification' && owner?.alarm_mode === 'alarm')) data.alarm = true;
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: Deno.env.get('CRON_SECRET'),
          toUserExternalId: email,
          title: fuTitle,
          body: `You finished "${task.title}" ${sinceText(waitMinutes)} ago.`,
          sendAtISO: sendAt.toISOString(),
          data,
        });
        const followUpId = (res?.data || res)?.notificationId || null;
        if (followUpId) {
          // Saved on the task in its OWN field so un-checking or deleting the
          // task can take it back (onTaskUpdate). Not in
          // onesignal_notification_ids: completing a task cancels and clears
          // those, which would kill this push. If the task was already
          // un-checked or deleted while this was being booked, take it back now.
          const fresh = await base44.asServiceRole.entities.Task.get(taskId).catch(() => null);
          if (fresh && fresh.status === 'completed') {
            await base44.asServiceRole.entities.Task.update(taskId, { follow_up_notification_id: followUpId });
          } else {
            await cancelPush(base44, followUpId);
          }
        }
      } catch (e) {
        console.error('[logTaskCompletion] follow-up booking failed:', e?.message);
      }
    }

    const first = reminders[0] ? new Date(reminders[0].send_at) : null;
    const last = reminders.length ? new Date(reminders[reminders.length - 1].send_at) : null;

    await base44.asServiceRole.entities.AppEvent.create({
      event: 'task_completed',
      user_email: email,
      session_id: '',
      seconds: Math.round((completedAt.getTime() - createdAt.getTime()) / 1000),
      page: '',
      props: {
        classification: task.classification || 'task',
        urgency: task.urgency || null,
        life_area: task.life_area || null,
        interval: task.reminder_interval || 'none',
        day_only: !!task.day_only_task,
        is_subtask: !!task.parent_task_id,
        from_calendar: !!task.google_event_id,
        silenced_at_some_point: !!task.silenced,
        snooze_count: task.snooze_count || 0,
        due_date_pushes: task.due_date_pushes || 0,
        // The reminder timeline: how many landed, and how long the gap was from
        // the first nudge (and the last) to the task actually getting done.
        reminders_before_completion: reminders.length,
        reminder_kinds: reminders.map((r) => r.kind),
        minutes_first_reminder_to_done: first
          ? Math.round((completedAt.getTime() - first.getTime()) / 60000)
          : null,
        minutes_last_reminder_to_done: last
          ? Math.round((completedAt.getTime() - last.getTime()) / 60000)
          : null,
        had_no_reminders: reminders.length === 0,
      },
    });

    return Response.json({ logged: true, reminders: reminders.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}