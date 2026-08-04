import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Cancels ALL OneSignal notifications (scheduled or sent) that reference a given
 * taskId in their `data` payload. Used when the task's onesignal_notification_ids
 * were already cleared from the entity but the actual OneSignal notifications
 * still exist and keep firing.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { taskId } = body;
    if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 });

    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    if (!appId || !restKey) return Response.json({ error: 'OneSignal credentials missing' }, { status: 500 });

    // Page through all notifications and find ones whose data.taskId matches
    let offset = 0;
    let found: any[] = [];
    let hasMore = true;

    while (hasMore && offset < 500) {
      const url = `https://onesignal.com/api/v1/notifications?app_id=${appId}&limit=50&offset=${offset}`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${restKey}` } });
      const json = await res.json().catch(() => ({}));
      const notifs = json.notifications || [];
      if (!notifs.length) break;
      for (const n of notifs) {
        const dataTaskId = n.data?.taskId || n.data?.data?.taskId;
        if (dataTaskId === taskId) {
          found.push({ id: n.id, send_after: n.send_after, completed_at: n.completed_at });
        }
      }
      hasMore = notifs.length === 50;
      offset += 50;
    }

    // Cancel all matching notifications (both pending and already-sent — OneSignal
    // won't un-deliver sent ones, but cancelling pending ones stops future fires)
    let cancelled = 0;
    for (const n of found) {
      if (n.completed_at) continue; // already sent, can't undo
      try {
        const res = await fetch(
          `https://onesignal.com/api/v1/notifications/${n.id}?app_id=${appId}`,
          { method: 'DELETE', headers: { Authorization: `Basic ${restKey}` } }
        );
        if (res.ok) cancelled++;
      } catch (e) { /* ignore individual failures */ }
    }

    return Response.json({
      success: true,
      taskId,
      foundCount: found.length,
      cancelledPending: cancelled,
      found
    });
  } catch (error) {
    console.error('[cancelOrphanedNotifications] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});