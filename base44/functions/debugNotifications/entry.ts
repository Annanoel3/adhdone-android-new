import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { getReminderContent } from '../../shared/reminderTitle.ts';
import { ledgerCancel } from '../../shared/sendLedger.ts';

// One-time repair, run by the app owner from the editor: { mode: 'reword_pending',
// ids: [OneSignal ids], apply: false|true }. Reminders booked before the wording
// fix say things like "Whenever you've got a minute — no pressure" without ever
// naming the task. For each still-pending one this books the same push again at
// the same time, to the same person, with a body that names the task, then
// cancels the old one and swaps the id on the task. apply:false only reports.
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

async function rewordPending(base44: any, ids: string[], apply: boolean) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  const out: any[] = [];
  for (const id of ids || []) {
    const row: any = { id };
    try {
      const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
        headers: { Authorization: `Basic ${key}` },
      });
      const n = await res.json();
      const rawSend = n.send_after;
      const sendMs = typeof rawSend === 'number' ? (rawSend < 1e12 ? rawSend * 1000 : rawSend) : Date.parse(rawSend || '');
      if (n.canceled || n.completed_at || !sendMs || sendMs <= Date.now() + 2 * 60 * 1000) {
        out.push({ ...row, skipped: 'not pending' });
        continue;
      }
      const taskId = n.data?.taskId;
      const task = taskId ? await base44.asServiceRole.entities.Task.get(taskId).catch(() => null) : null;
      if (!task || task.status !== 'active') { out.push({ ...row, skipped: 'task not active' }); continue; }
      const title = String(task.title || '').trim() || 'your task';
      const oldBody = String(n.contents?.en || '');
      if (oldBody.includes(title)) { out.push({ ...row, skipped: 'already names the task' }); continue; }
      const email = task.notification_recipient_email;
      if (!email) { out.push({ ...row, skipped: 'no recipient' }); continue; }
      const sendAtISO = new Date(sendMs).toISOString();
      const rhythm = !!task.reminder_interval && task.reminder_interval !== 'once';
      let body: string;
      if (task.due_date) {
        body = getReminderContent(title, task.due_date, sendAtISO).body;
      } else if (rhythm) {
        body = `Reminder: ${sentence(title)}`;
      } else {
        const owner = (await base44.asServiceRole.entities.User.filter({ email }))?.[0];
        const tz = owner?.timezone || 'America/Chicago';
        const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(sendMs))) % 24;
        body = hour >= 19 || hour < 6
          ? `Just keeping "${title}" on your radar — no need to tackle it tonight.`
          : `"${title}" — whenever you've got a minute. No pressure.`;
      }
      Object.assign(row, { taskId, title, sendAtISO, oldBody, newBody: body });
      if (!apply) { out.push(row); continue; }
      // Out of the ledger first, so the new booking isn't refused as a repeat.
      await ledgerCancel(base44, [id]);
      const booked = await base44.asServiceRole.functions.invoke('schedulePush', {
        internalKey: Deno.env.get('CRON_SECRET'),
        toUserExternalId: email,
        title: n.headings?.en || title,
        body,
        sendAtISO,
        data: n.data || { taskId },
      });
      const newId = (booked?.data || booked)?.notificationId;
      if (!newId) { out.push({ ...row, error: 'rebook refused', detail: booked?.data || booked }); continue; }
      await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${key}` },
      });
      const ids2 = (Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : []).map((x: string) => (x === id ? newId : x));
      const sched = (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : []).map((e: any) => (e?.notification_id === id ? { ...e, notification_id: newId, notification_body: body } : e));
      await base44.asServiceRole.entities.Task.update(task.id, { onesignal_notification_ids: ids2, reminder_schedule: sched });
      out.push({ ...row, newId, swappedOnTask: ids2.includes(newId) });
    } catch (e) {
      out.push({ ...row, error: String(e?.message || e) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ 
                success: false, 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        let reqBody: any = {};
        try { reqBody = await req.clone().json(); } catch { reqBody = {}; }
        if (reqBody?.mode === 'cancel_pending') {
            // Owner-only: cancel specific booked pushes for good — OneSignal, the
            // send ledger, and the id on the task — e.g. a reminder someone
            // doesn't need.
            if (user.role !== 'admin') {
                return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            }
            const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
            const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
            const results: any[] = [];
            for (const id of (reqBody.ids || [])) {
                try {
                    const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, { headers: { Authorization: `Basic ${key}` } });
                    const n = await res.json();
                    const del = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, { method: 'DELETE', headers: { Authorization: `Basic ${key}` } });
                    await ledgerCancel(base44, [id]);
                    const taskId = n?.data?.taskId;
                    let dropped = false;
                    if (taskId) {
                        const t = await base44.asServiceRole.entities.Task.get(taskId).catch(() => null);
                        if (t && Array.isArray(t.onesignal_notification_ids) && t.onesignal_notification_ids.includes(id)) {
                            await base44.asServiceRole.entities.Task.update(t.id, { onesignal_notification_ids: t.onesignal_notification_ids.filter((x: string) => x !== id) });
                            dropped = true;
                        }
                    }
                    results.push({ id, cancelled: del.ok, title: n?.headings?.en, droppedFromTask: dropped });
                } catch (e) {
                    results.push({ id, error: String(e?.message || e) });
                }
            }
            return Response.json({ success: true, results });
        }
        if (reqBody?.mode === 'reword_pending') {
            if (user.role !== 'admin') {
                return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            }
            const results = await rewordPending(base44, reqBody.ids || [], reqBody.apply === true);
            return Response.json({ success: true, apply: reqBody.apply === true, results });
        }

        const diagnostics = {
            timestamp: new Date().toISOString(),
            user_email: user.email,
            checks: {}
        };

        // Check 1: OneSignal credentials in Deno
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
        diagnostics.checks.deno_onesignal = {
            has_app_id: !!appId,
            has_rest_key: !!restKey,
            app_id_length: appId?.length || 0,
            rest_key_length: restKey?.length || 0
        };

        // Check 2: Scheduler (no longer calling external scheduler, but OneSignal directly)
        // Renamed 'scheduler' check to 'onesignal_direct_send_via_schedulePush' for clarity
        // The schedulePush function now directly handles OneSignal API calls.
        diagnostics.checks.onesignal_direct_send_via_schedulePush = {
            status: 'N/A - schedulePush now handles OneSignal directly',
            notes: 'SCHEDULER_URL and SCHEDULER_SECRET are no longer used by schedulePush for direct OneSignal calls.'
        };


        // Check 3: User's tasks with reminders
        const tasks = await base44.asServiceRole.entities.Task.filter({
            created_by: user.email,
            status: 'active'
        }, '-updated_date', 10);
        
        const tasksWithReminders = tasks.filter(t => t.next_reminder);
        diagnostics.checks.user_tasks = {
            total_active: tasks.length,
            with_reminders: tasksWithReminders.length,
            upcoming_reminders: tasksWithReminders.map(t => ({
                task_id: t.id,
                title: t.title,
                next_reminder: t.next_reminder,
                interval: t.reminder_interval,
                time_until: t.next_reminder ? 
                    Math.round((new Date(t.next_reminder).getTime() - Date.now()) / 60000) + ' minutes' 
                    : 'N/A'
            }))
        };

        // Check 4: Try direct OneSignal API call (unchanged)
        if (appId && restKey) {
            try {
                const testResponse = await fetch(`https://onesignal.com/api/v1/apps/${appId}`, {
                    headers: {
                        'Authorization': `Basic ${restKey}` // Using Basic auth as per OneSignal docs
                    }
                });
                diagnostics.checks.onesignal_api_status_check = {
                    status: testResponse.status,
                    ok: testResponse.ok,
                    details: await testResponse.json() // Get details from response
                };
            } catch (e) {
                diagnostics.checks.onesignal_api_status_check = {
                    error: e.message
                };
            }
        }

        // Check 5: Try calling schedulePush (unchanged)
        try {
            const testPayload = {
                toUserExternalId: user.email,
                title: "Test Notification (scheduled 1 min from now)",
                body: "This is a test notification from schedulePush.",
                minutesFromNow: 1
            };
            
            const scheduleResponse = await base44.functions.invoke('schedulePush', testPayload);
            diagnostics.checks.test_schedule_push_call = {
                response: scheduleResponse.data
            };
        } catch (e) {
            diagnostics.checks.test_schedule_push_call = {
                error: e.message
            };
        }

        return Response.json(diagnostics);

    } catch (error) {
        console.error('[debugNotifications] Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});