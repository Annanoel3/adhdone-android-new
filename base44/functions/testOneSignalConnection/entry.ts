import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// TEMPORARY read-only admin check, borrowed slot. Restore the original
// testOneSignalConnection code right after use. Admins only. Changes nothing.
// Returns no names, no email addresses, and no task contents.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    const tasks = await svc.entities.Task.filter({ title: 'Add Item to Samsung Calendar' });
    if (tasks.length !== 1) return Response.json({ ok: false, tasksMatched: tasks.length });
    const task = tasks[0];
    const email = task.notification_recipient_email || task.created_by;
    const users = await svc.entities.User.filter({ email });
    if (users.length !== 1) return Response.json({ ok: false, usersMatched: users.length });
    const u = users[0];
    const fb = u.pending_feedback_prompt || {};

    const since = String(body.since || '2026-09-21T02:46:00');
    const myTasks = await svc.entities.Task.filter({ created_by: email });
    const myIdeas = await svc.entities.ParkingLotIdea.filter({ created_by: email });

    let push = null;
    if (body.pushId) {
      const url = 'https://onesignal.com/api/v1/notifications/' + encodeURIComponent(body.pushId) +
        '?app_id=' + encodeURIComponent(Deno.env.get('ONESIGNAL_APP_ID')!.trim());
      const r = await fetch(url, { headers: { Authorization: 'Basic ' + Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim() } });
      const j = await r.json();
      push = { successful: j?.successful ?? null, received: j?.received ?? null, converted: j?.converted ?? null };
    }

    return Response.json({
      ok: true,
      lastActiveAt: u.last_active_at ?? null,
      feedback: {
        waiting: !!(fb.text && !fb.answered_at),
        answer: fb.answer ?? null,
        answeredAt: fb.answered_at ?? null,
        email: fb.email ?? null,
        emailError: fb.email_error ?? null,
        sentText: fb.answer === 'yes' ? (fb.sent_text ?? null) : null,
      },
      wrongTaskStatus: task.status,
      tasksTotal: myTasks.length,
      tasksCreatedSincePush: myTasks.filter((t) => String(t.created_date || '') > since).length,
      ideasTotal: myIdeas.length,
      ideasCreatedSincePush: myIdeas.filter((t) => String(t.created_date || '') > since).length,
      push,
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
