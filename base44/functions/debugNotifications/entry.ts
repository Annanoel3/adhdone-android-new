// Re-saved Nov 4 2026 (event alarms, all of them) so the bundled shared/reminderTitle.ts is picked up: every reminder of a timed event rings for an alarm user (night before, morning of, hour before, leave now, its time).
// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 13 2026 (night) so the bundled shared/reminderTitle.ts is picked up: an appointment's alarm carries "Record notes" as its second button.
// Re-saved Oct 13 2026 (evening) so the bundled shared/reminderTitle.ts is picked up: an event's alarm is marked `event` for the phone (build 42 on shows "Got it" only).
// Re-saved Oct 13 2026 so the bundled shared/reminderTitle.ts is picked up: a timed event's alarm rings at its time (and "leave now"), its heads-ups stay pushes.
// Re-saved Oct 12 2026 (pets) so the bundled shared/reminderTitle.ts is picked up: a pet's birthday alarm has no "Write a text" button.
// Re-saved Oct 6 2026 so the bundled shared/reminderTitle.ts (Later break: no alarm inside later_until) is picked up.
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { getReminderContent, pushPhoneAlarms, ringsOutLoudOn } from '../../shared/reminderTitle.ts';
import { userTimeZone } from '../../shared/quietHours.ts';
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
      // "Due today / tomorrow" and the weekday are read on the owner's calendar.
      const owner = (await base44.asServiceRole.entities.User.filter({ email }))?.[0];
      const tz = userTimeZone(owner);
      let body: string;
      if (task.due_date) {
        body = getReminderContent(title, task.due_date, sendAtISO, tz).body;
      } else if (rhythm) {
        body = `Reminder: ${sentence(title)}`;
      } else {
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
        // { ringSelfTest: true } (owner only): which reminders ring as alarms,
        // checked against Anna's rules (RULES.md §9 Q6). Run it after ANY change
        // to ringsOutLoudOn (shared/reminderTitle.ts) or ringsOutLoud
        // (widgetBridge.js, the same rules on the phone). Nov 4 2026: a timed
        // event's heads-ups had been turned into notifications on Oct 13 from a
        // sentence that meant something else, and nothing noticed for three
        // weeks until a vet visit that needed a fasting cat.
        if (reqBody?.ringSelfTest === true) {
            if (user.role !== 'admin') return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            const tz = 'America/Chicago';
            const ms = (s: string) => new Date(s).getTime();
            const timed = { classification: 'event', event_time: '2026-11-04T19:45:00.000Z', due_date: '2026-11-04T19:45:00.000Z', next_reminder: '2026-11-04T19:45:00.000Z' };
            const dayOnly = { classification: 'event', event_time: null, day_only_task: true, due_date: '2026-11-05T15:00:00.000Z', next_reminder: '2026-11-05T15:00:00.000Z' };
            const birthday = { classification: 'birthday', birthday_person: 'Someone', due_date: '2026-11-10T15:00:00.000Z', next_reminder: '2026-11-10T15:00:00.000Z' };
            const onDay = { classification: 'task', due_date: '2026-11-06T22:00:00.000Z', next_reminder: '2026-11-06T22:00:00.000Z', urgency: 'medium', reminder_interval: 'once', deadline_style: 'on' };
            const RING_CHECKS: { name: string; task: any; at: string; label: string; expect: boolean }[] = [
                { name: 'timed event: night before rings', task: timed, at: '2026-11-04T02:25:00Z', label: 'night before', expect: true },
                { name: 'timed event: night before (questions wording) rings', task: timed, at: '2026-11-04T02:25:00Z', label: 'night before · questions', expect: true },
                { name: 'timed event: night before (prep ask wording) rings', task: { ...timed, prep_worthy: true }, at: '2026-11-04T02:25:00Z', label: 'night before · prep', expect: true },
                { name: 'timed event: morning of rings', task: timed, at: '2026-11-04T15:25:00Z', label: 'morning of', expect: true },
                { name: 'timed event: 1 hour before rings', task: timed, at: '2026-11-04T18:45:00Z', label: '1 hour before', expect: true },
                { name: 'timed event: leave now rings', task: timed, at: '2026-11-04T18:35:00Z', label: 'leave now', expect: true },
                { name: 'timed event: at the time (one minute before) rings', task: timed, at: '2026-11-04T19:44:00Z', label: 'at the time', expect: true },
                { name: 'timed event: at the time (record notes wording) rings', task: timed, at: '2026-11-04T19:44:00Z', label: 'at the time · record notes', expect: true },
                { name: 'all-day event: morning of rings', task: dayOnly, at: '2026-11-05T15:00:00Z', label: 'morning of', expect: true },
                { name: 'all-day event: night before stays a push', task: dayOnly, at: '2026-11-05T02:00:00Z', label: 'night before', expect: false },
                { name: 'birthday: day of rings', task: birthday, at: '2026-11-10T15:00:00Z', label: 'day of', expect: true },
                { name: 'birthday: day before stays a push', task: birthday, at: '2026-11-09T15:00:00Z', label: 'day before', expect: false },
                { name: 'medium task on its day rings', task: onDay, at: '2026-11-06T15:00:00Z', label: 'morning of', expect: true },
                { name: 'medium task the day before stays a push', task: onDay, at: '2026-11-06T02:00:00Z', label: 'night before', expect: false },
            ];
            const results = RING_CHECKS.map((c) => {
                let got: any = null;
                try { got = ringsOutLoudOn(c.task, ms(c.at), tz, c.label); } catch (e) { got = `threw: ${(e as any)?.message || e}`; }
                return { name: c.name, expect: c.expect, got, pass: got === c.expect };
            });
            const failed = results.filter((r) => !r.pass);
            return Response.json({ success: failed.length === 0, passed: results.length - failed.length, failed: failed.length, results });
        }
        // { prepSelfTest: true } (owner only): the prep-note rules in
        // shared/prepNote.ts, checked as pure functions — which plan gets the
        // ask, what a note does to every reminder's words, how a saved entry
        // is re-worded when the note changes, and when the one creation-time
        // ask push goes. Run it after ANY change to prepNote.ts. Added Nov 4
        // 2026 with the feature (RULES.md §9).
        if (reqBody?.prepSelfTest === true) {
            if (user.role !== 'admin') return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            const now = new Date('2026-11-10T15:00:00Z').getTime(); // 9 AM Central
            const vet = { id: 't1', title: 'Take the dog to the vet', classification: 'event', status: 'active', prep_worthy: true, event_time: '2026-11-11T19:45:00.000Z', next_reminder: '2026-11-11T19:45:00.000Z' };
            const dinner = { ...vet, id: 't2', title: 'Dinner with friends', prep_worthy: false };
            const plan = (labels: string[]) => labels.map((label) => ({ label, notification_title: `T ${label}`, notification_body: `B ${label}.` }));
            const checks: { name: string; got: any; expect: any }[] = [];
            const add = (name: string, got: any, expect: any) => checks.push({ name, got, expect });
            // 1. The plan: no note on an appointment → the night before asks, once, nothing else touched.
            const asked = applyPrepToPlan(plan(['night before', 'morning of', '1 hour before', 'at the time']), vet, { when: '1:45 PM' });
            add('appointment, no note: night before becomes the ask', asked[0].label, PREP_ASK_LABEL);
            add('appointment, no note: the ask names the time', /tomorrow at 1:45 PM/.test(asked[0].notification_body), true);
            add('appointment, no note: morning of untouched', asked[1].notification_body, 'B morning of.');
            add('appointment, no note: at the time untouched', asked[3].notification_body, 'B at the time.');
            // 2. Questions wording keeps its label, merges the ask.
            const merged = applyPrepToPlan(plan(['night before · questions', 'at the time · record notes']), vet);
            add('questions night before keeps its label', merged[0].label, QUESTIONS_LABEL);
            add('questions night before asks for prep too', /prep note/.test(merged[0].notification_body) && /questions/.test(merged[0].notification_body), true);
            add('record notes at the time untouched', merged[1].notification_body, 'B at the time · record notes.');
            // 3. Not an appointment: nothing changes.
            add('plain event: plan untouched', JSON.stringify(applyPrepToPlan(plan(['night before', 'at the time']), dinner)), JSON.stringify(plan(['night before', 'at the time'])));
            // 4. A note: on every reminder, once, trimmed and capped; a non-event with a note still gets it.
            const noted = applyPrepToPlan(plan(['night before', 'morning of', 'leave now', 'at the time']), { ...vet, prep_note: '  no food   after midnight ' });
            add('note: on every reminder', noted.every((r: any) => r.notification_body.endsWith('\nPrep: no food after midnight')), true);
            add('note: night before stays a heads-up, not the ask', noted[0].label, 'night before');
            add('note: applied twice is still one line', withPrep(withPrep('B.', 'x'), 'x'), 'B.\nPrep: x');
            add('note: capped', prepNoteOf({ prep_note: 'a'.repeat(300) }).length <= PREP_MAX, true);
            add('strip: takes the line off', stripPrep('B.\nPrep: x'), 'B.');
            add('strip: leaves a body without one alone', stripPrep('B. Prep is fun.'), 'B. Prep is fun.');
            // 5. Re-wording a saved entry when the note changes.
            const askEntry = { label: PREP_ASK_LABEL, notification_title: asked[0].notification_title, notification_body: asked[0].notification_body, send_at: '2026-11-11T02:00:00.000Z' };
            const r1 = rewordEntryForPrep(askEntry, { ...vet, prep_note: 'no food after midnight' });
            add('note typed: the ask turns back into the heads-up', r1?.label, 'night before');
            add('note typed: with the note on it', r1?.notification_body, `${nightBeforeWords(vet.title).body}\nPrep: no food after midnight`);
            add('note still empty: the ask is left alone', rewordEntryForPrep(askEntry, vet), null);
            const qEntry = { label: QUESTIONS_LABEL, notification_title: merged[0].notification_title, notification_body: merged[0].notification_body, send_at: '2026-11-11T02:00:00.000Z' };
            const r2 = rewordEntryForPrep(qEntry, { ...vet, prep_note: 'bring the records' });
            add('note typed on the questions ask: questions words + note', r2?.label === QUESTIONS_LABEL && r2?.notification_body === `${nightBeforeWords(vet.title, { questions: true }).body}\nPrep: bring the records`, true);
            const plainEntry = { label: 'leave now', notification_title: 'T', notification_body: 'Head out now. 🚗\nPrep: old words', send_at: '2026-11-11T18:30:00.000Z' };
            add('note changed: the old line is replaced', rewordEntryForPrep(plainEntry, { ...vet, prep_note: 'new words' })?.notification_body, 'Head out now. 🚗\nPrep: new words');
            add('note cleared: the line comes off', rewordEntryForPrep(plainEntry, { ...vet, prep_note: '' })?.notification_body, 'Head out now. 🚗');
            add('nothing to change: null', rewordEntryForPrep({ label: 'at the time', notification_title: 'T', notification_body: 'B.', send_at: '2026-11-11T19:44:00.000Z' }, vet), null);
            // 6. Who wants the ask (row line, alarm button).
            add('wants: appointment with no note', wantsPrepAsk(vet), true);
            add('wants: not once a note is saved', wantsPrepAsk({ ...vet, prep_note: 'x' }), false);
            add('wants: not a plain event', wantsPrepAsk(dinner), false);
            add('wants: not a finished one', wantsPrepAsk({ ...vet, status: 'completed' }), false);
            add('wants: not a birthday', wantsPrepAsk({ ...vet, birthday_person: 'Someone' }), false);
            // 7. The one creation-time push: only when no night-before is left to ask, start 2 h+ away, not asked yet, timed.
            const entries = (labels: string[], at: string) => labels.map((label) => ({ label, send_at: at }));
            add('push: night before still ahead → no push', needsPrepAskPush(vet, entries(['night before'], '2026-11-11T02:00:00.000Z'), now), false);
            add('push: night before already gone → push', needsPrepAskPush(vet, entries(['night before'], '2026-11-10T02:00:00.000Z'), now), true);
            add('push: no night before in the plan → push', needsPrepAskPush(vet, entries(['1 hour before', 'at the time'], '2026-11-11T18:45:00.000Z'), now), true);
            add('push: starts within 2 h → no push', needsPrepAskPush({ ...vet, event_time: '2026-11-10T16:30:00.000Z' }, [], now), false);
            add('push: already asked → no push', needsPrepAskPush({ ...vet, prep_asked_at: '2026-11-10T14:00:00.000Z' }, [], now), false);
            add('push: all-day event → no push', needsPrepAskPush({ ...vet, event_time: null, day_only_task: true }, [], now), false);
            add('push: plain event → no push', needsPrepAskPush(dinner, [], now), false);
            add('push words: today / tomorrow on their clock', startWords('2026-11-11T19:45:00.000Z', 'America/Chicago', now), 'tomorrow at 1:45 PM');
            add('push words: the ask', /Added: "Take the dog to the vet" today at 1:45 PM\./.test(prepAskPushWords(vet.title, 'today at 1:45 PM').body), true);
            const results = checks.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
            const failed = results.filter((r) => !r.pass);
            return Response.json({ success: failed.length === 0, passed: results.length - failed.length, failed: failed.length, failures: failed, results });
        }
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
                            const fields = {
                                onesignal_notification_ids: t.onesignal_notification_ids.filter((x: string) => x !== id),
                                reminder_schedule: (Array.isArray(t.reminder_schedule) ? t.reminder_schedule : []).filter((r: any) => r?.notification_id !== id),
                            };
                            await base44.asServiceRole.entities.Task.update(t.id, fields);
                            dropped = true;
                            // The phone keeps its own copy of the alarm and rings it
                            // on its own clock; tell it the list changed (Oct 10 2026:
                            // a push cancelled here still rang at 11 from the phone).
                            try {
                                const owners = await base44.asServiceRole.entities.User.filter({ email: t.created_by }, '-created_date', 1);
                                if (owners?.[0]) await pushPhoneAlarms({ ...t, ...fields }, owners[0], { before: t, changedAt: Date.now(), source: 'debugNotifications' });
                            } catch (e) {
                                console.error('[debugNotifications] could not update the phone:', e);
                            }
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