import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// TEMPORARY one-off admin tool, borrowed slot. Restore the original
// testOneSignalConnection code as soon as this has been used. Admins only.
//
// Finds the single task with the given title, then on that task's owner:
//   mode "inspect" (default) — reads only, changes nothing
//   mode "queue"  — sets pending_feedback_prompt to their verbatim words and
//                   marks the ways-to-add popup seen
//   mode "push"   — one push to that person, by external id (email) only
// Returns no names or email addresses.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'inspect';
    const title = body.title || 'Add Item to Samsung Calendar';
    const svc = base44.asServiceRole;

    const tasks = await svc.entities.Task.filter({ title });
    if (tasks.length !== 1) return Response.json({ ok: false, tasksMatched: tasks.length });
    const task = tasks[0];

    const email = task.notification_recipient_email || task.created_by;
    const users = await svc.entities.User.filter({ email });
    if (users.length !== 1) return Response.json({ ok: false, usersMatched: users.length });
    const u = users[0];

    const tz = u.timezone || 'America/Chicago';
    const localTime = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit',
    }).format(new Date());
    const flags = Array.isArray(u.onboarding_flags) ? u.onboarding_flags : [];
    const fb = u.pending_feedback_prompt;

    const summary = {
      ok: true,
      tasksMatched: 1,
      taskStatus: task.status,
      originalInputLength: (task.original_input || '').length,
      originalInputMatchesQuote: (task.original_input || '').toLowerCase().includes('samsung'),
      localTime,
      tz,
      quietHours: { enabled: u.quiet_hours_enabled ?? null, start: u.quiet_hours_start ?? null, end: u.quiet_hours_end ?? null },
      waysSeen: flags.includes('onboarding_ways_seen'),
      waysFirstOpen: flags.includes('onboarding_ways_first_open'),
      feedbackWaiting: !!(fb?.text && !fb?.answered_at),
      feedbackAnswer: fb?.answer ?? null,
      feedbackAnsweredAt: fb?.answered_at ?? null,
      feedbackEmail: fb?.email ?? null,
      feedbackEmailError: fb?.email_error ?? null,
      feedbackSentText: fb?.answer === 'yes' ? (fb?.sent_text ?? null) : null,
    };

    if (mode === 'inspect') return Response.json(summary);

    if (mode === 'queue') {
      const text = String(body.text || task.original_input || '').trim();
      if (!text) return Response.json({ ...summary, error: 'No verbatim text to show. Pass text explicitly.' }, { status: 400 });
      const nextFlags = Array.from(new Set([...flags, 'onboarding_ways_seen']));
      await svc.entities.User.update(u.id, {
        pending_feedback_prompt: { text, task_id: task.id, queued_at: new Date().toISOString() },
        onboarding_flags: nextFlags,
      });
      const after = (await svc.entities.User.filter({ email }))[0];
      return Response.json({
        ...summary,
        queued: true,
        verifiedWaiting: !!(after?.pending_feedback_prompt?.text && !after?.pending_feedback_prompt?.answered_at),
        verifiedWaysSeen: (after?.onboarding_flags || []).includes('onboarding_ways_seen'),
      });
    }

    if (mode === 'push') {
      const { pushTitle, pushBody } = body;
      if (!pushTitle || !pushBody) {
        return Response.json({ error: 'pushTitle and pushBody are required' }, { status: 400 });
      }
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim(),
        },
        body: JSON.stringify({
          app_id: Deno.env.get('ONESIGNAL_APP_ID')!.trim(),
          // HARD RULE: external id (email) only. Never player ids.
          include_external_user_ids: [email],
          channel_for_external_user_ids: 'push',
          headings: { en: pushTitle },
          contents: { en: pushBody },
          data: { type: 'feedback_prompt' },
        }),
      });
      const out = await res.json();
      return Response.json({
        ...summary,
        pushed: res.ok,
        onesignalId: out?.id ?? null,
        recipients: out?.recipients ?? null,
        errors: out?.errors ?? null,
      });
    }

    if (mode === 'status') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'id required' }, { status: 400 });
      const url = 'https://onesignal.com/api/v1/notifications/' + encodeURIComponent(id) +
        '?app_id=' + encodeURIComponent(Deno.env.get('ONESIGNAL_APP_ID')!.trim());
      const r = await fetch(url, { headers: { Authorization: 'Basic ' + Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim() } });
      const j = await r.json();
      return Response.json({
        ...summary,
        httpStatus: r.status,
        successful: j?.successful ?? null,
        failed: j?.failed ?? null,
        errored: j?.errored ?? null,
        remaining: j?.remaining ?? null,
        received: j?.received ?? null,
        converted: j?.converted ?? null,
        completedAt: j?.completed_at ?? null,
        errors: j?.errors ?? null,
      });
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
