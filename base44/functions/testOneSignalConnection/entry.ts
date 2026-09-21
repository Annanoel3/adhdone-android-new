import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// TEMPORARY read-only admin check, borrowed slot. Restore the original
// testOneSignalConnection code right after use. Admins only. Changes nothing.
// Returns no names, email addresses, tokens or device identifiers.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const svc = base44.asServiceRole;

    const tasks = await svc.entities.Task.filter({ title: 'Add Item to Samsung Calendar' });
    if (tasks.length !== 1) return Response.json({ ok: false, tasksMatched: tasks.length });
    const task = tasks[0];
    const email = task.notification_recipient_email || task.created_by;

    const appId = Deno.env.get('ONESIGNAL_APP_ID')!.trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim();
    const res = await fetch(
      'https://api.onesignal.com/apps/' + appId + '/users/by/external_id/' + encodeURIComponent(email),
      { headers: { Authorization: 'Basic ' + key } },
    );
    let onesignal = { httpStatus: res.status };
    if (res.ok) {
      const body = await res.json();
      const subs = Array.isArray(body?.subscriptions) ? body.subscriptions : [];
      const push = subs.filter((s) => typeof s?.type === 'string' && s.type.endsWith('Push'));
      const toIso = (t) => (t ? new Date(Number(t) * 1000).toISOString() : null);
      onesignal = {
        httpStatus: res.status,
        lastActive: toIso(body?.properties?.last_active),
        firstActive: toIso(body?.properties?.first_active),
        pushSubscriptions: push.map((s) => ({
          type: s.type,
          enabled: s.enabled ?? null,
          notificationTypes: s.notification_types ?? null,
          sessionCount: s.session_count ?? null,
          appVersion: s.app_version ?? null,
        })),
      };
    }

    const now = new Date().toISOString();
    const sched = Array.isArray(task.reminder_schedule) ? task.reminder_schedule : [];
    const reminders = {
      interval: task.reminder_interval ?? null,
      silenced: task.silenced ?? null,
      nextReminder: task.next_reminder ?? null,
      scheduledTotal: sched.length,
      alreadyFired: sched.filter((r) => r?.send_at && r.send_at < now).length,
      stillToCome: sched.filter((r) => r?.send_at && r.send_at >= now).length,
      firedAt: sched.filter((r) => r?.send_at && r.send_at < now).map((r) => r.send_at),
    };

    return Response.json({ ok: true, now, onesignal, wrongTaskReminders: reminders });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
