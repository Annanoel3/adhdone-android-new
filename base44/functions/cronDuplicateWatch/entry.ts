import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Duplicate watchdog. Runs on a schedule, across EVERY user, and does two things:
//   1. Heals: if a calendar event somehow produced two tasks, the extra task is
//      deleted and its scheduled pushes cancelled before the user ever sees a
//      double notification.
//   2. Reports: emails the app owner whatever it had to clean, so a regression
//      in the sync/reminder pipeline surfaces here instead of in a user's
//      notification tray.
const OWNER_EMAIL = 'annanoelwenballew@gmail.com';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const healed: string[] = [];
    let rowsDeleted = 0;
    let tasksDeleted = 0;
    let pushesCancelled = 0;

    // --- 1. Same calendar event imported more than once for the same user ---
    const rows = await svc.entities.CalendarSyncedEvent.list('-created_date', 5000);
    const byKey: Record<string, any[]> = {};
    for (const r of rows) {
      const key = `${r.user_email}||${r.google_event_id}`;
      (byKey[key] ||= []).push(r);
    }

    for (const group of Object.values(byKey)) {
      if (group.length < 2) continue;
      group.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
      const keep = group[0];
      for (const extra of group.slice(1)) {
        if (extra.adhd_task_id && extra.adhd_task_id !== keep.adhd_task_id) {
          const task = await svc.entities.Task.get(extra.adhd_task_id).catch(() => null);
          if (task) {
            for (const nid of task.onesignal_notification_ids || []) {
              const ok = await base44.functions.invoke('cancelScheduled', { notificationId: nid }).catch(() => null);
              if (ok) pushesCancelled++;
            }
            await svc.entities.Task.delete(task.id);
            tasksDeleted++;
            healed.push(`${extra.user_email}: duplicate calendar task "${task.title}"`);
          }
        }
        await svc.entities.CalendarSyncedEvent.delete(extra.id);
        rowsDeleted++;
      }
    }

    // --- 2. Two active tasks with the same title AND the same reminder time ---
    // (a duplicate that slipped through by some other route)
    const tasks = await svc.entities.Task.filter({ status: 'active' }, '-created_date', 5000);
    const seen: Record<string, any> = {};
    for (const t of tasks) {
      if (!t.next_reminder || t.parent_task_id) continue;
      const key = `${t.created_by}||${(t.title || '').trim().toLowerCase()}||${t.next_reminder}`;
      const first = seen[key];
      if (!first) {
        seen[key] = t;
        continue;
      }
      for (const nid of t.onesignal_notification_ids || []) {
        const ok = await base44.functions.invoke('cancelScheduled', { notificationId: nid }).catch(() => null);
        if (ok) pushesCancelled++;
      }
      await svc.entities.Task.delete(t.id);
      tasksDeleted++;
      healed.push(`${t.created_by}: duplicate task "${t.title}" at ${t.next_reminder}`);
    }

    if (healed.length) {
      const list = healed.slice(0, 60).map((h) => `<li>${h}</li>`).join('');
      await svc.integrations.Core.SendEmail({
        to: OWNER_EMAIL,
        from_name: 'ADHDone Watchdog',
        subject: `ADHDone: cleaned ${healed.length} duplicate${healed.length === 1 ? '' : 's'}`,
        html: `<p>The duplicate watchdog found and cleaned these before users saw them:</p><ul>${list}</ul>
               <p>Tasks removed: ${tasksDeleted} &middot; Sync records removed: ${rowsDeleted} &middot; Scheduled pushes cancelled: ${pushesCancelled}</p>
               <p>If this list keeps growing, something in the calendar sync or reminder pipeline is regressing.</p>`,
      }).catch((e) => console.error('[cronDuplicateWatch] email failed', e?.message));
    }

    console.log('[cronDuplicateWatch] done', { healed: healed.length, tasksDeleted, rowsDeleted, pushesCancelled });
    return Response.json({ ok: true, healed, tasksDeleted, rowsDeleted, pushesCancelled });
  } catch (error) {
    console.error('[cronDuplicateWatch] fatal', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}