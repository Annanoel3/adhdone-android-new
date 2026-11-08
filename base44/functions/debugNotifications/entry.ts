// Re-saved Nov 7 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r43, store runs wait for daytime or early evening (after about 7 PM, the next day).
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 4 2026 (night) so the bundled shared/sendLedger.ts and shared/prepNote.ts are picked up (prepSelfTest: 36 cases).
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
import { applyPrepToPlan, rewordEntryForPrep, withPrep, stripPrep, prepNoteOf, wantsPrepAsk, needsPrepAskPush, nightBeforeWords, prepAskPushWords, startWords, PREP_ASK_LABEL, QUESTIONS_LABEL, PREP_MAX } from '../../shared/prepNote.ts';

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
        // { mode: 'ai_projects' } (owner only): which OpenAI project each key
        // belongs to, from the openai-project header OpenAI sends back. The
        // private key's project must not be in Data controls > Sharing
        // (shared/privateAi.ts). Never returns the keys themselves.
        if (reqBody?.mode === 'ai_projects') {
            if (user.role !== 'admin') return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            const look = async (name: string) => {
                const key = (Deno.env.get(name) || '').trim();
                if (!key) return { name, set: false };
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                    body: JSON.stringify({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'Say ok.' }] }),
                }).catch((e) => ({ ok: false, status: 0, headers: new Headers(), text: async () => String(e?.message || e) } as any));
                const body = res.ok ? '' : String(await res.text()).slice(0, 300);
                // Record Notes' transcription model on the same key: a 1 s tone.
                const fr = 16000, n = fr, wav = new DataView(new ArrayBuffer(44 + n * 2));
                const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
                ws(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
                wav.setUint32(24, fr, true); wav.setUint32(28, fr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); ws(36, 'data'); wav.setUint32(40, n * 2, true);
                for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.round(3000 * Math.sin(2 * Math.PI * 440 * i / fr)), true);
                const form = new FormData();
                form.append('model', String(reqBody?.transcribe_model || 'gpt-transcribe'));
                form.append('file', new File([wav.buffer], 'tone.wav', { type: 'audio/wav' }));
                const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
                }).catch(() => null);
                const trBody = tr && !tr.ok ? String(await tr.text()).slice(0, 300) : '';
                return {
                    name, set: true, status: res.status,
                    transcribe_status: tr?.status ?? 0,
                    ...(trBody ? { transcribe_error: trBody } : {}),
                    project: res.headers.get('openai-project'),
                    organization: res.headers.get('openai-organization'),
                    ...(body ? { error: body } : {}),
                };
            };
            return Response.json({ success: true, keys: [await look('OPENAI_API_KEY'), await look('OPENAI_API_KEY_PRIVATE')] });
        }
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
            // The Notes page's Remove strips the questions mark but leaves the merged ask's words: still the ask.
            const strippedEntry = { ...qEntry, label: 'night before' };
            add('note typed on a stripped questions ask: plain words + note', rewordEntryForPrep(strippedEntry, { ...vet, prep_note: 'bring the records' })?.notification_body, `${nightBeforeWords(vet.title).body}\nPrep: bring the records`);
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
        if (reqBody?.mode === 'push_history') {
            // Owner-only: for several people at once, OneSignal's own record of
            // their phone (each push subscription: on/off, code, app build,
            // device, sessions) and every push to them in a window with what
            // OneSignal did with it. Read only. Pages through OneSignal's list
            // newest first; pass back nextOffset to continue. Nov 6 2026 (Anna:
            // "how many of these people just have broken notifications?"): an
            // uninstall is only found after 2+ pushes bounce (OneSignal's FCM
            // expired-token FAQ), so a phone whose FIRST push after its last
            // session already reached nobody was reported by the phone itself.
            // { mode: 'push_history', emails: [...], since, until, offset, maxPages }
            if (user.role !== 'admin') {
                return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            }
            const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
            const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
            const emails = (Array.isArray(reqBody.emails) ? reqBody.emails : []).map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean).slice(0, 25);
            if (!emails.length) return Response.json({ success: false, error: 'emails required' }, { status: 400 });
            const sinceSec = Math.floor((Date.parse(reqBody.since || '') || (Date.now() - 7 * 24 * 3600 * 1000)) / 1000);
            const untilSec = Math.floor((Date.parse(reqBody.until || '') || Date.now()) / 1000);
            const maxPages = Math.min(Number(reqBody.maxPages) || 25, 60);
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
            const people: Record<string, any> = {};
            if (!reqBody.offset) {
                for (const em of emails) {
                    try {
                        const r = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(em)}`, { headers: { Authorization: `Basic ${key}` } });
                        if (r.status === 404) { people[em] = { known: false, rows: [] }; continue; }
                        const b: any = await r.json().catch(() => ({}));
                        const subs = (Array.isArray(b?.subscriptions) ? b.subscriptions : []).filter((s: any) => typeof s?.type === 'string' && s.type.endsWith('Push'));
                        people[em] = {
                            known: true,
                            lastActive: b?.properties?.last_active ? new Date(b.properties.last_active * 1000).toISOString() : null,
                            firstActive: b?.properties?.first_active ? new Date(b.properties.first_active * 1000).toISOString() : null,
                            // hasToken: whether OneSignal still holds a push token for the
                            // phone (never the token itself). OneSignal blanks it when it
                            // marks the phone not subscribed (-10). id = the subscription id.
                            subs: subs.map((s: any) => ({ id: s.id ?? null, type: s.type, enabled: s.enabled, code: s.notification_types, hasToken: !!(s.token && String(s.token).length), build: s.app_version ?? null, device: s.device_model ?? null, os: s.device_os ?? null, sdk: s.sdk ?? null, sessions: s.session_count ?? null })),
                            rows: [],
                        };
                    } catch (e) {
                        people[em] = { known: null, error: String((e as any)?.message || e), rows: [] };
                    }
                    await sleep(150);
                }
            } else {
                for (const em of emails) people[em] = { rows: [] };
            }
            let offset = Number(reqBody.offset) || 0, pages = 0, done = false, rateLimited = 0;
            for (let p = 0; p < maxPages; p++) {
                const res = await fetch(`https://onesignal.com/api/v1/notifications?app_id=${appId}&limit=50&offset=${offset}`, { headers: { Authorization: `Basic ${key}` } });
                if (res.status === 429) { rateLimited++; if (rateLimited > 5) break; await sleep(5000); continue; }
                if (!res.ok) break;
                const json = await res.json();
                const batch = json.notifications || [];
                pages++;
                let oldestSec = Infinity;
                for (const n of batch) {
                    const at = Number(n.send_after || n.queued_at || 0);
                    if (at && at < oldestSec) oldestSec = at;
                    if (at && (at < sinceSec || at > untilSec)) continue;
                    const targets = [...(n.include_external_user_ids || []), ...(n.include_aliases?.external_id || [])].map((x: string) => String(x).toLowerCase());
                    for (const em of targets) {
                        if (!people[em]) continue;
                        people[em].rows.push({
                            at: at ? new Date(at * 1000).toISOString() : null,
                            type: n.data?.type || (n.headings?.en ? 'visible' : 'silent'),
                            outcome: n.canceled ? 'cancelled' : (n.completed_at ? (n.successful > 0 ? 'sent' : (n.failed > 0 ? 'FAILED-unsubscribed' : (n.errored > 0 ? 'errored' : 'none'))) : 'queued'),
                        });
                    }
                }
                offset += 50;
                if (!batch.length || (json.total_count != null && offset >= json.total_count)) { done = true; break; }
                if (Number.isFinite(oldestSec) && oldestSec < sinceSec) { done = true; break; }
                await sleep(500);
            }
            for (const em of Object.keys(people)) people[em].rows.sort((a: any, b: any) => String(a.at || '').localeCompare(String(b.at || '')));
            return Response.json({ success: true, since: new Date(sinceSec * 1000).toISOString(), pages, nextOffset: offset, done, people });
        }
        if (reqBody?.mode === 'sent_to') {
            // Owner-only: what OneSignal really did with one person's pushes in
            // a window — sent (how many phones got it), cancelled before it
            // went, or still queued — read from OneSignal's own list, newest
            // first. The send ledger can't answer this: a push cancelled by
            // setFocusMode leaves its ledger row behind, and ledgerPrune then
            // files that row as "sent" (Nov 6 2026, Liz's hourly Focus Mode
            // check-ins). { mode: 'sent_to', email, since, until, maxPages }
            if (user.role !== 'admin') {
                return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
            }
            const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
            const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
            const who = String(reqBody.email || '').trim().toLowerCase();
            const sinceSec = Math.floor((Date.parse(reqBody.since || '') || (Date.now() - 3 * 24 * 3600 * 1000)) / 1000);
            const untilSec = Math.floor((Date.parse(reqBody.until || '') || Date.now()) / 1000);
            const maxPages = Math.min(Number(reqBody.maxPages) || 20, 60);
            if (!who) return Response.json({ success: false, error: 'email required' }, { status: 400 });
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
            const rows: any[] = [];
            let offset = 0, scanned = 0, pages = 0, stoppedEarly = false, rateLimited = 0;
            for (let p = 0; p < maxPages; p++) {
                const res = await fetch(`https://onesignal.com/api/v1/notifications?app_id=${appId}&limit=50&offset=${offset}`, { headers: { Authorization: `Basic ${key}` } });
                if (res.status === 429) { rateLimited++; if (rateLimited > 5) break; await sleep(5000); continue; }
                if (!res.ok) break;
                const json = await res.json();
                const batch = json.notifications || [];
                pages++;
                scanned += batch.length;
                let oldestSec = Infinity;
                for (const n of batch) {
                    const at = Number(n.send_after || n.queued_at || 0);
                    if (at && at < oldestSec) oldestSec = at;
                    const targets = [...(n.include_external_user_ids || []), ...(n.include_aliases?.external_id || [])].map((x: string) => String(x).toLowerCase());
                    if (!targets.includes(who)) continue;
                    if (at && (at < sinceSec || at > untilSec)) continue;
                    rows.push({
                        id: n.id,
                        send_at: at ? new Date(at * 1000).toISOString() : null,
                        title: String(n.headings?.en || '').slice(0, 80),
                        type: n.data?.type || null,
                        taskId: n.data?.taskId || null,
                        outcome: n.canceled ? 'cancelled' : (n.completed_at ? (n.successful > 0 ? `sent (${n.successful} phone${n.successful === 1 ? '' : 's'})` : `tried, reached nobody (failed ${n.failed || 0}, errored ${n.errored || 0})`) : 'still queued'),
                        received: n.received || 0,
                        converted: n.converted || 0,
                    });
                }
                offset += 50;
                if (!batch.length || (json.total_count != null && offset >= json.total_count)) break;
                // OneSignal lists newest first: past the window, stop.
                if (Number.isFinite(oldestSec) && oldestSec < sinceSec - 24 * 3600) { stoppedEarly = true; break; }
                await sleep(600);
            }
            rows.sort((a, b) => String(a.send_at || '').localeCompare(String(b.send_at || '')));
            return Response.json({ success: true, email: who, since: new Date(sinceSec * 1000).toISOString(), until: new Date(untilSec * 1000).toISOString(), pages, scanned, stoppedEarly, rows });
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
// Redeployed Nov 4 2026: shared/reminderTitle.ts lets the iPhone app ring (phoneCanRing).

// Redeployed Nov 5 2026 (evening): shared/reminderTitle.ts tells the reminder-words model the task's corrected name beats the words it was first typed with.
