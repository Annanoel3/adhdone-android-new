import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Records ONE analytics row when a task is completed, with the reminder history
// that led up to it. Driven by the Task-update workflow rather than the UI,
// because a task can be completed from half a dozen places (card, today's list,
// notification screen, subtask roll-up) and every one of them must be counted.
//
// Deliberately stores no task title or user-written text — only counts, timings
// and flags.
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