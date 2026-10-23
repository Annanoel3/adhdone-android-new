// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 17 2026 so the bundled shared/reminderTitle.ts is picked up: the at-the-time words are written by gpt-6-astra (was gpt-6-luna).
// Re-saved Oct 12 2026 so the bundled shared/workHours.ts (via sendLedger) is picked up:
// an overnight shift belongs to the day it starts and runs past midnight.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { atTimeWords, isPlainAtTimeWords, taskRingsAsAlarm, ringsOutLoudOn } from '../../shared/reminderTitle.ts';
import { userTimeZone, resolveQuietHours, isInQuietHours } from '../../shared/quietHours.ts';

// WHO MAY BOOK A PUSH
// Like every Base44 function, this endpoint can be reached by anyone on the
// internet, and it used to book whatever it was handed: any text, to any user's
// email, no questions asked. Only two kinds of caller are legitimate:
//   1. another backend function of this app (the reminder job, calendar import,
//      Focus Mode, quick capture). It proves itself by passing the app's internal
//      key as `internalKey`. The key is the CRON_SECRET secret, so it is never in
//      the repo.
//   2. a signed-in user booking a reminder for THEMSELVES from the app.
// Everyone else is turned away.
//
// While ENFORCE_CALLER_CHECK is false this is WATCH ONLY: the check runs and
// logs what it would have done, and nothing is blocked. It is switched to true
// only once the logs show every real caller passing.
const ENFORCE_CALLER_CHECK = false;

Deno.serve(async (req) => {
    console.log('[schedulePush] ========== FUNCTION START ==========');
    
    try {
        const bodyText = await req.text();
        let payload;
        try {
            payload = JSON.parse(bodyText);
        } catch (parseError) {
            return Response.json({ success: false, error: 'Invalid JSON in request body', details: parseError.message }, { status: 400 });
        }

        const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim();

        if (!appId || !restApiKey) {
            return Response.json({ success: false, error: 'Missing OneSignal environment variables.' }, { status: 500 });
        }

        const { toUserExternalId, title, body: messageBody, sendAtISO, minutesFromNow, data, android_channel_id, buttons } = payload;
        
        if (!toUserExternalId) {
            return Response.json({ success: false, error: 'toUserExternalId is required' }, { status: 400 });
        }

        if (!title || !messageBody) {
            return Response.json({ success: false, error: 'Missing title or message body' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Caller check (see the note at the top). Never log the key or an email.
        const internalKey = Deno.env.get('CRON_SECRET')?.trim();
        const presentedKey = typeof payload.internalKey === 'string' ? payload.internalKey.trim() : '';
        const isInternal = !!internalKey && presentedKey === internalKey;
        let callerEmail = null;
        if (!isInternal) {
            try {
                const me = await base44.auth.me();
                callerEmail = me?.email || null;
            } catch {
                callerEmail = null;
            }
        }
        const isSelf = !!callerEmail && String(callerEmail).toLowerCase() === String(toUserExternalId).toLowerCase();
        const callerKind = isInternal ? 'internal' : isSelf ? 'self' : callerEmail ? 'signed-in, but booking for someone else' : 'anonymous';
        console.log(`[schedulePush] caller check: ${callerKind}${ENFORCE_CALLER_CHECK ? '' : ' (watch only)'}`);
        if (ENFORCE_CALLER_CHECK && !isInternal && !isSelf) {
            return Response.json({ success: false, error: 'Not allowed to book this push' }, { status: 403 });
        }

        // Quiet hours enforcement is handled by callers using per-user, timezone-aware
        // logic (see cronRefillReminders, rescanTasks, and the client-side
        // reminderScheduler). A crude UTC blanket here would collapse multiple
        // night/early-morning notifications to the same timestamp — causing
        // duplicate notifications — so we do NOT apply quiet hours in schedulePush.

        let resolvedSendAt = sendAtISO
            ? sendAtISO
            : minutesFromNow !== undefined
                ? new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString()
                : null;

        // Safety guard: never allow instant delivery by accident
        if (!resolvedSendAt || new Date(resolvedSendAt).getTime() <= Date.now()) {
            return Response.json({ success: false, error: 'Refusing to schedule: send time missing or in the past' }, { status: 400 });
        }

        // Send ledger — every sender books through here, so this is where two
        // systems booking the same task minutes apart get caught.
        const ledgerKind = data?.type || 'task_reminder';
        const ledgerTaskId = data?.taskId || data?.scheduledTextId || null;
        let gate = await ledgerCheck(base44, { email: String(toUserExternalId), taskId: ledgerTaskId, kind: ledgerKind, sendAt: resolvedSendAt });
        // A heads-up about a dated thing (an event's "tomorrow" the night
        // before, "today at 5" the morning of) that lands within 20 minutes of
        // another push used to be dropped outright, and nothing ever booked it
        // again: Anna's Bike Night (Oct 13 2026) lost its night-before to another
        // event's night-before at the same 8 PM, so the first she heard of it
        // that day was "in about an hour". Now it moves to a free minute nearby
        // instead — later first, earlier if it must — never into their quiet
        // hours and never within half an hour of the thing itself. The caller
        // gets the time it really went at (`sendAt`).
        if (!gate.allowed && gate.reason === 'stacked_on_other_push' && (isInternal || isSelf) && data?.taskId && ledgerKind === 'task_checkin') {
            try {
                const task = await base44.asServiceRole.entities.Task.get(String(data.taskId));
                const users = await base44.asServiceRole.entities.User.filter({ email: String(toUserExternalId) });
                const owner = users?.[0] || null;
                const tz = userTimeZone(owner);
                const quiet = resolveQuietHours(owner);
                const startMs = new Date(task?.event_time || task?.next_reminder || 0).getTime();
                const wantMs = new Date(resolvedSendAt).getTime();
                for (const shiftMin of [25, 50, 75, -25, -50]) {
                    const t = wantMs + shiftMin * 60 * 1000;
                    if (t <= Date.now() + 2 * 60 * 1000) continue;
                    if (Number.isFinite(startMs) && startMs > 0 && t >= startMs - 30 * 60 * 1000) continue;
                    if (quiet.enabled && isInQuietHours(new Date(t), quiet.startMin, quiet.endMin, tz)) continue;
                    const again = await ledgerCheck(base44, { email: String(toUserExternalId), taskId: ledgerTaskId, kind: ledgerKind, sendAt: new Date(t).toISOString() });
                    if (again.allowed) {
                        console.log(`[schedulePush] heads-up moved ${shiftMin} min to a free minute (was ${resolvedSendAt})`);
                        resolvedSendAt = new Date(t).toISOString();
                        gate = again;
                        break;
                    }
                }
            } catch (e) {
                console.log('[schedulePush] could not move the heads-up:', e?.message || e);
            }
        }
        if (!gate.allowed) {
            return Response.json({ success: true, skipped: true, reason: gate.reason, notificationId: null });
        }

        // The reminder at a task's own time is booked everywhere with plain
        // words ("It's time — "… "You've got this! 💪"); here they become the
        // brief's words for that moment (shared/reminderTitle.ts, atTimeWords). Only for the
        // app's own callers and the task's owner, only for a one-time task or
        // an event, and never at the cost of the reminder: no answer within a
        // few seconds and the plain words go out. The words used come back as
        // `words`, so the caller saves them on the task and the phone's alarm
        // says the same thing as the push.
        let pushTitle = title;
        let pushBody = messageBody;
        let reworded = null;
        // The task and its owner, for the two decisions below. Only for the
        // app's own callers, and only a task the recipient owns.
        let task = null;
        let owner = null;
        if ((isInternal || isSelf) && data?.taskId && (ledgerKind === 'task_reminder' || ledgerKind === 'event_reminder')) {
            try {
                const t = await base44.asServiceRole.entities.Task.get(String(data.taskId));
                const to = String(toUserExternalId).toLowerCase();
                const owns = !!t && [t.created_by, t.notification_recipient_email].some((e) => String(e || '').toLowerCase() === to);
                if (owns) {
                    task = t;
                    const users = await base44.asServiceRole.entities.User.filter({ email: String(toUserExternalId) });
                    owner = users?.[0] || null;
                }
            } catch (e) {
                console.log('[schedulePush] task not read:', e?.message || e);
            }
        }
        if (task && isPlainAtTimeWords(messageBody)) {
            try {
                const oneTime = task.classification === 'event' || !task.reminder_interval || task.reminder_interval === 'once';
                if (oneTime && !task.day_only_task) {
                    // 6 seconds (was 4.5): gpt-6-astra writes these now, and answered in
                    // 2.5–3.5 s in tests (Oct 17 2026); past this the plain words go out.
                    reworded = await atTimeWords(task, new Date(resolvedSendAt).getTime(), userTimeZone(owner), 6000);
                    if (reworded) {
                        pushTitle = reworded.title;
                        pushBody = reworded.body;
                    }
                }
            } catch (e) {
                console.log('[schedulePush] plain words kept:', e?.message || e);
            }
        }
        // Does this phone's own alarm ring for this very moment? Then the push
        // is only the quiet tray copy next to that alarm, and it gets a short
        // life (10 minutes, like a ring-on-arrival push): OneSignal's app
        // re-delivers a recent push whenever the app process starts fresh, and
        // the phone's filter, past the alarm's 10-minute window, showed it as a
        // new reminder (Anna, Oct 13 2026: Take Pills rang at 11:00, Later, then
        // the same words came back as a notification at 11:11). A push held back
        // by the phone for longer than that is dropped the same way. The one
        // cost: a phone that is off for more than 10 minutes around the moment
        // gets neither the alarm nor this copy; Smart Reminders takes the task
        // up as overdue on its next run.
        let coveredByAlarm = false;
        if (task && owner) {
            try {
                const label = /time to leave/i.test(String(pushTitle)) ? 'leave now' : '';
                coveredByAlarm = taskRingsAsAlarm(task, owner) && ringsOutLoudOn(task, new Date(resolvedSendAt).getTime(), userTimeZone(owner), label);
            } catch (_) {
                coveredByAlarm = false;
            }
        }

        const notificationPayload = {
            app_id: appId,
            include_external_user_ids: [String(toUserExternalId)],
            headings: { en: pushTitle },
            contents: { en: pushBody },
            data: data || {},
            channel_for_external_user_ids: "push",
            // Scheduling
            send_after: resolvedSendAt,
            // NOTE: Action buttons (Snooze / Complete) were removed — native
            // notification action buttons in this Capacitor app only open the
            // app without performing the action, which is worse than no button.
        };
        
        if (android_channel_id) {
            notificationPayload.android_channel_id = android_channel_id;
        }
        // Everything booked here is for a set time — a reminder at the task's
        // time, an event, a snooze, a birthday, a scheduled text — so it goes at
        // HIGH priority. At normal priority Android holds a push while the
        // phone has been idle with the screen off and delivers it in a later
        // batch (Google: "delivery may be delayed to conserve battery until the
        // device exits doze"); "Go to Bed", handed to Google at 11:00:05 PM on
        // Oct 7 2026, reached Anna's phone at 11:21. High priority wakes the
        // phone. Google de-prioritizes an app whose high-priority pushes don't
        // show a notification; every push here shows one. Until Oct 8 2026 only
        // the ring-on-arrival pushes (data.alarm) were high priority (Anna:
        // "make things that have to be at an exact time high priority").
        notificationPayload.priority = 10;
        if (coveredByAlarm) {
            notificationPayload.ttl = 10 * 60;
        }
        if (data && data.alarm === true) {
            // A push that asks to ring on arrival also gets a short lifetime:
            // OneSignal's app re-delivers recent pushes every time the app starts
            // fresh ("restore"), and the phone's filter rang a ring-now push again
            // when it did, so one push could ring on every app open for its whole
            // lifetime (3 days by default). A short lifetime means OneSignal never
            // restores it after 10 minutes; a ring-now moment is stale by then anyway.
            notificationPayload.ttl = 10 * 60;
        }

        console.log('[schedulePush] Sending payload:', JSON.stringify(notificationPayload, null, 2));

        const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${restApiKey}`
            },
            body: JSON.stringify(notificationPayload)
        });

        const responseText = await oneSignalResponse.text();
        let oneSignalResult;
        try {
            oneSignalResult = JSON.parse(responseText);
        } catch {
            return Response.json({ success: false, error: 'Invalid response from OneSignal API', response_text: responseText }, { status: 500 });
        }

        if (!oneSignalResponse.ok || oneSignalResult.errors) {
            console.error('[schedulePush] OneSignal error:', oneSignalResult);
            return Response.json({
                success: false,
                error: oneSignalResult.errors?.[0] || 'OneSignal API failed',
                onesignal_status: oneSignalResponse.status,
                onesignal_response: oneSignalResult
            }, { status: 200 });
        }

        console.log('[schedulePush] ========== SUCCESS ==========', oneSignalResult.id);
        await ledgerRecord(base44, { email: String(toUserExternalId), taskId: ledgerTaskId, kind: ledgerKind, source: 'schedulePush', sendAt: resolvedSendAt, notificationId: oneSignalResult.id, title: pushTitle });
        return Response.json({ success: true, notificationId: oneSignalResult.id, sendAt: resolvedSendAt, words: reworded ? { title: pushTitle, body: pushBody } : null, onesignal_response: oneSignalResult });

    } catch (error) {
        console.error('[schedulePush] Unhandled error:', error.message);
        return Response.json({ success: false, error: 'Internal server error', error_message: error.message }, { status: 500 });
    }
});