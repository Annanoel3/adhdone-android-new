import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

async function cancelOneSignal(ids: string[]) {
  if (!ids.length) return;
  await Promise.allSettled(ids.map(id =>
    fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${ONESIGNAL_APP_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` }
    })
  ));
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, taskId } = body;

    if (action === 'enter') {
      if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 });

      // Fetch all active recurring tasks for this user and silence every one
      // except the chosen focus task. The cron will refill the focus task on
      // its next run; the others stay quiet until the user exits Focus Mode.
      const tasks = await base44.asServiceRole.entities.Task.filter({
        notification_recipient_email: user.email,
        status: 'active'
      }, '-updated_date', 500);

      const recurring = tasks.filter(t =>
        t.reminder_interval && t.reminder_interval !== 'once'
      );

      for (const t of recurring) {
        if (t.id === taskId) continue;
        const ids = Array.isArray(t.onesignal_notification_ids) ? t.onesignal_notification_ids : [];
        if (ids.length) await cancelOneSignal(ids);
        await base44.asServiceRole.entities.Task.update(t.id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null
        });
      }

      await base44.auth.updateMe({
        focus_mode_task_id: taskId,
        focus_mode_entered_at: new Date().toISOString()
      });

      return Response.json({ success: true, focusMode: true, taskId });
    }

    if (action === 'exit') {
      await base44.auth.updateMe({
        focus_mode_task_id: null,
        focus_mode_entered_at: null
      });
      return Response.json({ success: true, focusMode: false });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[setFocusMode] Error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}