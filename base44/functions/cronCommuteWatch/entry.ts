// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Commute watch — the "leave now" reminder for work, plus a heads-up when
// today's drive is running worse than it normally does.
//
// Runs every 15 minutes. For each user who has a home base, a work address and
// a shift today, it measures the actual drive (Google, with predicted traffic)
// and sends at most two pushes per day:
//
//   1. HEADS-UP (informational, ~45-100 min before they need to be there):
//      only when traffic is meaningfully worse than the free-flow drive. It
//      says what time to leave, but it is explicitly NOT the safety net —
//      it's information, and it stays silent on a normal day. Not inside
//      quiet hours (Anna, Oct 16 2026: hers came at 7:32 AM with quiet hours
//      until 8 — "Yes. Respect quiet hours."), unless the traffic means
//      leaving before quiet hours end ("it can ignore quiet hours if the
//      traffic is so bad that it has to remind them earlier").
//   2. LEAVE NOW (the safety net): fires AT departure time — arrival time
//      minus measured drive time minus a get-out-the-door cushion. The cron
//      only ticks every 15 minutes, so on the tick before departure it books
//      the push with OneSignal for the exact minute instead of sending early
//      (2026-09-21: Anna's fired at 8:15 for an 8:25 departure and went
//      unnoticed). It goes out at high priority, on the alarm channel when one
//      is configured, and is never suppressed by quiet hours; a commute alert
//      that yields is a commute alert that made someone late.
//
// Both are claimed on the user record BEFORE sending, so a re-run (or a run cut
// off mid-send) can't double-notify — the same rule the daily digest uses.
//
// 3. EVENTS' "LEAVE NOW", RE-CHECKED LIVE (Oct 17 2026). An event at a place
//    gets its "leave now" booked when its reminders are made, from Google's
//    traffic FORECAST for that hour (shared/travelLead.ts), and until now
//    nothing ever looked again, so a bad traffic day never moved it. That was
//    never Anna's call: on Sep 13 2026 she asked Base44's AI to make a demo's
//    "14 min away with traffic right now" real, it built the one-time forecast
//    and called it "live and real", and Commute Watch's live checks were only
//    ever built for work ("I never said yes to not having live traffic data").
//    Now, from 3 hours before a booked "leave now", the drive is measured
//    again on live traffic: every 15 minutes, then on every run (5 minutes
//    apart) for its last 30 minutes. When they need to leave at least 5
//    minutes earlier, the push moves earlier (or goes right away if that time
//    has passed). It never moves later, so a light-traffic reading can't make
//    anyone late. On the last check before it goes (5 minutes or less), its
//    drive-time words are brought up to date, so "with traffic right now" is
//    true when it's read. The phone's own alarm for it moves too: this sends
//    the phone the task's new alarm list itself (pushPhoneAlarms), because
//    the "Reschedule OneSignal on Task Edit" workflow doesn't fire for a
//    reminder_schedule-only change, so onTaskUpdate never sees it.
//
// 4. AFTER A "LEAVE NOW" (work and events, Oct 17 2026). Anna: "a huge wreck
//    happens and now they won't make it." No check can see a wreck before it
//    happens, so the blind spot was cut from 15 minutes to 5 (the workflow
//    runs every 5 minutes, Base44's shortest) and the 30 minutes after a
//    "leave now" are watched too: if the drive got bad enough that leaving
//    on time now means arriving 5+ minutes late, ONE plain push ("Traffic got
//    worse after we told you to leave… you may get there around 1:20 instead
//    of 1:00") so they can let people know. Never an alarm: they may be
//    driving. Never a second one.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getTodaysCommute, localDateKey } from '../../shared/commuteSchedule.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { getProximity } from '../../shared/mapsDistance.ts';
import { ledgerCheck, ledgerRecord, ledgerCancel } from '../../shared/sendLedger.ts';
import { resolveQuietHours, isInQuietHours, adjustForQuietHours } from '../../shared/quietHours.ts';
import { listAll } from '../../shared/listAll.ts';
import { taskRingsAsAlarm, pushPhoneAlarms } from '../../shared/reminderTitle.ts';

const CUSHION_MINUTES = 10;       // finding keys / shoes / getting in the car
// OneSignal "Android notification channel" for the leave-now push, created in
// the OneSignal dashboard (Settings → Push & In-App → Android Notification
// Channels) at URGENT importance with an alarm sound — that is what makes it a
// banner with sound instead of a silent tray entry. Paste its ID here. Empty
// means "default channel", which is what this used to do.
const LEAVE_NOW_CHANNEL_ID = '';
const LEAVE_WINDOW_MINUTES = 6;   // one cron tick (5 min since Oct 17 2026), so departure is never missed
const HEADS_UP_EARLIEST = 100;    // minutes before arrival
const HEADS_UP_LATEST = 40;
// "Worse than usual" has to mean something, or the heads-up becomes noise the
// user learns to ignore: at least 8 minutes AND 20% over the free-flow drive.
const WORSE_MIN_MINUTES = 8;
const WORSE_RATIO = 1.2;

// What the push SAYS. Google's figure is exact-looking ("34 min") but it is a
// prediction, and a low-looking number reads as permission to dawdle — so the
// spoken figure rounds UP to the next 5 ("about 35 min"). The departure time
// itself is still computed from the exact minutes.
function aboutMinutes(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

function fmtLocalTime(utc: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(utc);
}

async function sendPush(
  email: string,
  user: any,
  title: string,
  body: string,
  opts: { sendAt?: Date | null; alarm?: boolean } = {},
) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) {
    console.error('[COMMUTE] Missing OneSignal credentials');
    return false;
  }

  // HARD RULE: target by external id (the user's email) only. Never player ids.
  const payload: any = {
    app_id: appId,
    include_external_user_ids: [email],
    headings: { en: title },
    contents: { en: body },
    data: { screen: '/Places', type: 'commute' },
    channel_for_external_user_ids: 'push',
  };
  // Booked for the exact departure minute (only when that is still ahead of us;
  // OneSignal rejects a send_after in the past, and "now" is right anyway).
  if (opts.sendAt && opts.sendAt.getTime() > Date.now() + 30_000) {
    payload.send_after = opts.sendAt.toISOString();
  }
  if (opts.alarm) {
    // High priority = delivered immediately even in battery saving / Doze.
    payload.priority = 10;
    // Only useful for a few minutes: a "leave now" that arrives an hour late
    // is noise, so let OneSignal drop it rather than deliver it stale.
    payload.ttl = 20 * 60;
    if (LEAVE_NOW_CHANNEL_ID) payload.android_channel_id = LEAVE_NOW_CHANNEL_ID;
    // Accounts that chose full-screen reminders get this as an alarm: the app
    // build that can ring (its PushFilter) rings it the moment it arrives, with
    // these same words. Older builds and everyone else see the push as before.
    if (user?.alarm_mode === 'alarm') payload.data.alarm = true;
  }

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || result.errors) {
      console.error(`[COMMUTE] OneSignal error for ${email}:`, result);
      return false;
    }
    return result.id || 'sent';
  } catch (e) {
    console.error(`[COMMUTE] Send failed for ${email}:`, e);
    return false;
  }
}

// ── Events' "leave now", re-checked on live traffic (see 3. at the top) ──────
const EVENT_WATCH_MS = 3 * 60 * 60 * 1000; // live checks start this long before the booked push
const EVENT_MOVE_MIN = 5;                  // moved only when they need to leave 5+ min earlier
const EVENT_WORDS_MIN = 5;                 // words refreshed when the drive is 5+ min off
const EVENT_FINAL_MS = 6 * 60 * 1000;      // the last run before it goes (runs are 5 min apart)
const MAX_EVENT_LEAD = 180;                // same cap as shared/travelLead.ts

// Runs are 5 minutes apart since Oct 17 2026 (they were 15). Far from the
// moment, the drive is still measured only every 15 minutes, like before
// (Google bills each measurement); within CLOSE_MS of it, every run.
const CLOSE_MS = 30 * 60 * 1000;
function onQuarterHour(ms: number): boolean {
  return Math.floor(ms / 60000) % 15 < 5;
}

// After a "leave now" goes (work or an event): for FOLLOWUP_MS the drive is
// watched, and if it got bad enough that leaving on time now means arriving
// LATE_MIN+ minutes late, ONE heads-up says so (see 4. at the top).
const FOLLOWUP_MS = 30 * 60 * 1000;
const LATE_MIN = 5;
const LATE_SOURCE = 'cronCommuteWatch:late';

// Same lead as the booking (shared/travelLead.ts): drive + cushion, up to the
// next 5 minutes, so a re-check that finds the same traffic lands on the same minute.
function eventLeadMinutes(driveMinutes: number): number {
  return Math.min(Math.ceil((driveMinutes + CUSHION_MINUTES) / 5) * 5, MAX_EVENT_LEAD);
}

// The drive time a booked "leave now" states ("about 76 min away", "about a 76 min drive").
function statedMinutes(body: any): number {
  const m = /about (?:a )?(\d+)\s*min/i.exec(String(body || ''));
  return m ? Number(m[1]) : NaN;
}

// A stored time in ms. The platform sometimes stores UTC with no zone letter.
function timeMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
}

async function cancelOneSignal(appId: string, restApiKey: string, id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://onesignal.com/api/v1/notifications/${encodeURIComponent(id)}?app_id=${appId}`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${restApiKey}` },
      });
      if (res.ok) return true;
      // Already sent or already gone: nothing left to cancel.
      if (res.status === 400 || res.status === 404) return true;
    } catch (_) { /* tried once more below */ }
  }
  return false;
}

// Books an event's "leave now" the way every event reminder is booked (same
// data, so the phone gives it the event screen: Got it only). sendAt null =
// right now. For someone with full-screen alarms it asks to ring: if the
// phone's own alarm already rings for that moment (the alarm list sent with
// pushPhoneAlarms), PushFilter shows the push quietly instead of ringing
// twice; if that list never arrived, the push itself rings, so the moved time
// is never left to a quiet tray entry.
async function bookEventLeave(
  appId: string, restApiKey: string, email: string, task: any, owner: any,
  title: string, body: string, sendAt: Date | null,
): Promise<string | null> {
  const later = !!sendAt && sendAt.getTime() > Date.now() + 30_000;
  const atMs = later ? sendAt!.getTime() : Date.now();
  const payload: any = {
    app_id: appId,
    include_external_user_ids: [email],
    headings: { en: title },
    contents: { en: body },
    data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency || 'medium', type: 'event_reminder' },
    channel_for_external_user_ids: 'push',
    // A set time: high priority, so a dozing phone can't hold it.
    priority: 10,
    // A "leave now" read 20 minutes late is noise.
    ttl: 20 * 60,
  };
  if (later) payload.send_after = sendAt!.toISOString();
  let alarmUser = false;
  try { alarmUser = taskRingsAsAlarm(task, owner); } catch (_) { alarmUser = false; }
  if (alarmUser) {
    payload.data.alarm = true;
    payload.data.at = atMs;
    payload.ttl = 10 * 60;
  }
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.errors || !result.id) {
      console.error(`[EVENT LEAVE] OneSignal error for task ${task.id}:`, JSON.stringify(result));
      return null;
    }
    return String(result.id);
  } catch (e) {
    console.error(`[EVENT LEAVE] Send failed for task ${task.id}:`, e);
    return null;
  }
}

// The one "traffic got worse after we told you to leave" heads-up for an
// event. Information, not an alarm: they may well be driving. Never a second
// one for the same task (the ledger row is the claim).
async function eventRunningLate(
  base44: any, appId: string, restApiKey: string, email: string, task: any,
  leftAtMs: number, arriveMs: number, drive: any, timeZone: string,
): Promise<any | null> {
  const etaMs = leftAtMs + drive.minutes * 60000;
  const lateMin = Math.round((etaMs - arriveMs) / 60000);
  if (lateMin < LATE_MIN) return null;
  const ledgerRows = base44.asServiceRole.entities.NotificationLedger;
  const prior = await ledgerRows.filter({ task_id: task.id, source: LATE_SOURCE }).catch(() => null);
  // Unreadable ledger: no way to be sure it wasn't sent, so it isn't.
  if (!Array.isArray(prior) || prior.length > 0) return null;
  const t = String(task.title || 'your event');
  const title = '🚧 Traffic got worse';
  const body = `Traffic got worse after we told you to leave: "${t}" is now about ${aboutMinutes(drive.minutes)} min away, so you may get there around ${fmtLocalTime(new Date(etaMs), timeZone)} instead of ${fmtLocalTime(new Date(arriveMs), timeZone)}.`;
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [email],
        headings: { en: title },
        contents: { en: body },
        data: { screen: '/TaskNotification', taskId: task.id, type: 'event_heads_up' },
        channel_for_external_user_ids: 'push',
        priority: 10,
        ttl: 15 * 60,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.errors || !result.id) {
      console.error(`[EVENT LEAVE] running-late push failed for task ${task.id}:`, JSON.stringify(result));
      return null;
    }
    await ledgerRecord(base44, {
      email, taskId: task.id, kind: 'general', source: LATE_SOURCE,
      notificationId: String(result.id), title,
    });
    console.log(`[EVENT LEAVE] ${task.id} running late: about ${aboutMinutes(drive.minutes)} min now, ~${lateMin} min late`);
    return { email, taskId: task.id, what: 'running late', driveMinutes: drive.minutes, lateMin };
  } catch (e) {
    console.error(`[EVENT LEAVE] running-late send failed for task ${task.id}:`, e);
    return null;
  }
}

async function checkEventLeaveTimes(base44: any, now: Date): Promise<any[]> {
  const done: any[] = [];
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return done;
  const nowMs = now.getTime();

  let tasks: any[] = [];
  try {
    tasks = await base44.asServiceRole.entities.Task.filter({ status: 'active', 'reminder_schedule.label': 'leave now' }, '-updated_date', 200);
  } catch (e) {
    // If the nested filter is ever refused: every active event, sorted out below.
    console.log('[EVENT LEAVE] nested filter failed, reading active events:', (e as any)?.message || e);
    tasks = await base44.asServiceRole.entities.Task.filter({ status: 'active', classification: 'event' }, '-updated_date', 500);
  }
  console.log(`[EVENT LEAVE] ${(tasks || []).length} active task(s) with a leave-now to look at`);

  const owners = new Map<string, any>();
  for (const task of tasks || []) {
    try {
      if (!task?.id || task.silenced || task.parent_task_id) continue;
      const place = String(task.location || '').trim();
      if (!place) continue;
      const schedule: any[] = Array.isArray(task.reminder_schedule) ? task.reminder_schedule : [];
      const idx = schedule.findIndex((r: any) => r && /leave now/i.test(String(r.label || '')) && r.send_at);
      if (idx < 0) continue;
      const entry = schedule[idx];
      // Only a push that is really booked. A planned one ("planned_…" id, not
      // yet scheduled) is cronRefillReminders' to book: it promotes event plans
      // into OneSignal's window, and booking it here too would send it twice.
      const oldId = entry.notification_id ? String(entry.notification_id) : '';
      if (!oldId || entry.scheduled === false || /^planned_/i.test(oldId)) continue;
      const bookedMs = timeMs(entry.send_at);
      const arriveMs = timeMs(task.event_time || task.next_reminder);
      if (!Number.isFinite(bookedMs) || !Number.isFinite(arriveMs) || arriveMs <= nowMs) continue;
      // Going out this very minute: nothing to change, nothing to follow up yet.
      if (bookedMs > nowMs && bookedMs <= nowMs + 60_000) continue;
      const gone = bookedMs <= nowMs;
      // Gone: watched for half an hour after (running late?). Ahead: watched
      // from 3 hours before, every 15 minutes, then every run for the last 30.
      if (gone && nowMs - bookedMs > FOLLOWUP_MS) continue;
      if (!gone && bookedMs - nowMs > EVENT_WATCH_MS) continue;
      if (!gone && bookedMs - nowMs > CLOSE_MS && !onQuarterHour(nowMs)) continue;

      const email = String(task.notification_recipient_email || task.created_by || '').trim();
      if (!email) continue;
      if (!owners.has(email)) {
        const rows = await base44.asServiceRole.entities.User.filter({ email });
        owners.set(email, rows?.[0] || null);
      }
      const owner = owners.get(email);
      if (!owner || owner.notifications === false) continue;
      const home = getHomeOrigin(owner);
      if (!home) continue;
      const routeOpts = { avoidTolls: owner.commute_avoid_tolls === true };
      const timeZone = owner.timezone || 'America/Chicago';

      // Already told them it's running late: nothing more to measure.
      if (gone) {
        const prior = await base44.asServiceRole.entities.NotificationLedger.filter({ task_id: task.id, source: LATE_SOURCE }).catch(() => null);
        if (!Array.isArray(prior) || prior.length > 0) continue;
      }

      const first = (await getProximity([place], home, new Date(nowMs + 60_000), routeOpts)).fromHome[place];
      if (!first?.minutes) {
        console.log(`[EVENT LEAVE] Could not measure the drive for task ${task.id}`);
        continue;
      }
      if (gone) {
        const late = await eventRunningLate(base44, appId, restApiKey, email, task, bookedMs, arriveMs, first, timeZone);
        if (late) done.push(late);
        continue;
      }

      // Two passes, like the commute: traffic now gives a first departure
      // time, then the drive is measured again for that minute while it's ahead.
      let drive = first;
      const firstDepart = arriveMs - eventLeadMinutes(first.minutes) * 60000;
      if (firstDepart > nowMs + 2 * 60000) {
        const refined = (await getProximity([place], home, new Date(firstDepart), routeOpts)).fromHome[place];
        if (refined?.minutes) drive = refined;
      }
      const leaveMs = arriveMs - eventLeadMinutes(drive.minutes) * 60000;
      const about = aboutMinutes(drive.minutes);
      const t = String(task.title || 'your event');
      const title = entry.notification_title || `🚗 Time to leave — ${t}`;
      const arriveBy = fmtLocalTime(new Date(arriveMs), timeZone);

      const moveEarlier = leaveMs <= bookedMs - EVENT_MOVE_MIN * 60000;
      const said = statedMinutes(entry.notification_body);
      const finalCheck = bookedMs - nowMs <= EVENT_FINAL_MS;
      const wordsOff = !!drive.inTraffic && (!Number.isFinite(said) || Math.abs(about - said) >= EVENT_WORDS_MIN);
      if (!moveEarlier && !(finalCheck && wordsOff)) {
        console.log(`[EVENT LEAVE] ${task.id}: about ${about} min, leave by ${new Date(leaveMs).toISOString()}, booked ${entry.send_at}, unchanged`);
        continue;
      }

      // Read it again right before changing it: if anything else re-booked
      // this leave-now meanwhile (an edit, another run), leave it alone.
      const fresh = await base44.asServiceRole.entities.Task.get(task.id).catch(() => null);
      const freshEntry = (Array.isArray(fresh?.reminder_schedule) ? fresh.reminder_schedule : [])
        .find((r: any) => r && /leave now/i.test(String(r.label || '')));
      if (!fresh || fresh.status !== 'active' || !freshEntry || String(freshEntry.notification_id || '') !== oldId) {
        console.log(`[EVENT LEAVE] ${task.id} changed since it was read, left alone`);
        continue;
      }

      let sendAt: Date | null;
      let body: string;
      if (moveEarlier) {
        const late = leaveMs <= nowMs + 60_000;
        sendAt = late ? null : new Date(leaveMs);
        // "To get there by 1:00 PM" only when leaving then really does that:
        // not when it's already too late, or the drive is past the 3-hour cap.
        const onTime = !late && drive.minutes + CUSHION_MINUTES <= MAX_EVENT_LEAD;
        body = late
          ? `Traffic got worse: "${t}" is about ${about} min away right now, and it starts at ${arriveBy}. Leave as soon as you can. 🚗`
          : onTime
            ? `Traffic's worse than expected: "${t}" is about ${about} min away. Head out now to get there by ${arriveBy}. 🚗`
            : `Traffic's worse than expected: "${t}" is about ${about} min away, and it starts at ${arriveBy}. Leave as soon as you can. 🚗`;
      } else {
        // The last check before it goes: same minute, true numbers.
        sendAt = new Date(bookedMs);
        body = Number.isFinite(said) && about < said
          ? `"${t}" is about ${about} min away with traffic right now. Leaving now gets you there a little early. 🚗`
          : `"${t}" is about ${about} min away with traffic right now. Head out now to get there by ${arriveBy}. 🚗`;
      }

      const newId = await bookEventLeave(appId, restApiKey, email, task, owner, title, body, sendAt);
      if (!newId) continue; // the booked one stays as it was
      const sendIso = (sendAt || new Date()).toISOString();

      // A time moved into quiet hours by traffic still rings (the commute's
      // rule, and Anna's for its heads-up, Oct 16 2026: it can ignore quiet
      // hours when traffic means reminding them earlier).
      const quiet = resolveQuietHours(owner);
      const inQuiet = (ms: number) => quiet.enabled && isInQuietHours(new Date(ms), quiet.startMin, quiet.endMin, timeZone);
      const theirTime = entry.their_time === true || (!!sendAt && inQuiet(sendAt.getTime()) && !inQuiet(bookedMs));

      const freshSchedule: any[] = fresh.reminder_schedule;
      const nextSchedule = freshSchedule.map((r: any) => r !== freshEntry ? r : {
        ...r,
        notification_id: newId,
        send_at: sendIso,
        notification_title: title,
        notification_body: body,
        ...(theirTime ? { their_time: true } : {}),
      });
      const ids: string[] = (Array.isArray(fresh.onesignal_notification_ids) ? fresh.onesignal_notification_ids : []).map(String);
      const nextIds = ids.includes(oldId) ? ids.map((x) => (x === oldId ? newId : x)) : [...ids, newId];
      try {
        await base44.asServiceRole.entities.Task.update(task.id, { reminder_schedule: nextSchedule, onesignal_notification_ids: nextIds });
      } catch (e) {
        // Not saved: take the new push back, so the next run doesn't book another.
        console.error(`[EVENT LEAVE] Could not save the new leave-now for task ${task.id}, taking it back:`, e);
        await cancelOneSignal(appId, restApiKey, newId);
        continue;
      }
      // The phone's alarm moves with it (and the old one comes off), without
      // the app being opened. Only for the task's own owner: the list goes to
      // created_by's phone, with that person's alarm settings.
      if (String(fresh.created_by || '').toLowerCase() === email.toLowerCase()) {
        const phone = await pushPhoneAlarms(
          { ...fresh, reminder_schedule: nextSchedule, onesignal_notification_ids: nextIds },
          owner,
          { before: fresh, changedAt: Date.now(), source: 'cronCommuteWatch' },
        );
        console.log(`[EVENT LEAVE] ${task.id} phone alarms: ${phone}`);
      }
      await ledgerRecord(base44, {
        email, taskId: task.id, kind: 'event_reminder', source: 'cronCommuteWatch',
        sendAt: sendIso, notificationId: newId, title,
      });
      const cancelled = await cancelOneSignal(appId, restApiKey, oldId);
      if (!cancelled) console.error(`[EVENT LEAVE] Could not cancel the old leave-now ${oldId} for task ${task.id}`);
      await ledgerCancel(base44, [oldId]);
      const what = moveEarlier ? (sendAt ? 'moved earlier' : 'sent now') : 'words refreshed';
      console.log(`[EVENT LEAVE] ${task.id} ${what}: about ${about} min (said ${Number.isFinite(said) ? said : '?'}), ${entry.send_at} → ${sendIso}`);
      done.push({ email, taskId: task.id, what, driveMinutes: drive.minutes, from: entry.send_at, to: sendIso });
    } catch (e) {
      console.error(`[EVENT LEAVE] task ${task?.id} failed:`, e);
    }
  }
  return done;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const sent: any[] = [];

    // Events first, and on their own: a failure here never stops the commute.
    let events: any[] = [];
    try {
      events = await checkEventLeaveTimes(base44, now);
    } catch (e) {
      console.error('[EVENT LEAVE] pass failed:', e);
    }

    const users = await listAll(base44.asServiceRole.entities.User);
    // Remote workers have hours but no drive — never send them a "leave now".
    const commuters = users.filter((u: any) => u?.email && !u?.work_remote && u?.work_address && getHomeOrigin(u));
    if (commuters.length === 0) {
      return Response.json({ success: true, checked: 0, sent: [], events });
    }

    // Shifts are only needed for people on a week-by-week schedule.
    let shifts: any[] = [];
    if (commuters.some((u: any) => u.work_schedule_mode === 'varies')) {
      shifts = await base44.asServiceRole.entities.WorkShift.list('-shift_date', 500);
    }

    for (const user of commuters) {
      const email = user.email;
      const timeZone = user.timezone || 'America/Chicago';
      const mine = shifts.filter((s: any) => s.created_by === email);
      const commute = getTodaysCommute(user, mine, now);
      if (!commute) continue;
      // Claims are keyed by the shift's own day, so a 12:30 AM shift warned
      // about at 11:40 PM isn't warned about again once the date changes.
      const today = commute.dateKey;

      const minutesUntilArrival = Math.round((commute.arriveUtc.getTime() - now.getTime()) / 60000);
      // Past arrival time, or too far out to measure traffic usefully.
      if (minutesUntilArrival <= 0 || minutesUntilArrival > HEADS_UP_EARLIEST) continue;

      const alreadyLeft = user.last_commute_leave_date === today;
      const alreadyWarned = user.last_commute_headsup_date === today;

      const home = getHomeOrigin(user);
      // People who don't take toll roads get toll-free timing (asked on the
      // Places page when the work address goes in).
      const routeOpts = { avoidTolls: user.commute_avoid_tolls === true };

      // ── 4. AFTER LEAVE NOW: traffic got worse on the way (see the top) ─────
      if (alreadyLeft) {
        const leftAt = timeMs(user.last_commute_leave_at);
        const sinceLeave = now.getTime() - leftAt;
        if (user.last_commute_late_date === today || !Number.isFinite(leftAt) || sinceLeave < 0 || sinceLeave > FOLLOWUP_MS) continue;
        const live = (await getProximity([commute.place], home, new Date(now.getTime() + 60000), routeOpts)).fromHome[commute.place];
        if (!live?.minutes) continue;
        const etaMs = leftAt + live.minutes * 60000;
        const lateMin = Math.round((etaMs - commute.arriveUtc.getTime()) / 60000);
        if (lateMin < LATE_MIN) continue;
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_commute_late_date: today });
        } catch (e) {
          console.error(`[COMMUTE] Could not claim the running-late push for ${email}, skipping:`, e);
          continue;
        }
        const title = '🚧 Traffic got worse';
        const body = `Traffic got worse after we told you to leave: the drive is now about ${aboutMinutes(live.minutes)} min, so you may get to work around ${fmtLocalTime(new Date(etaMs), timeZone)} instead of ${fmtLocalTime(commute.arriveUtc, timeZone)}.`;
        const id = await sendPush(email, user, title, body);
        if (id) {
          await ledgerRecord(base44, {
            email, kind: 'general', source: 'cronCommuteWatch',
            notificationId: typeof id === 'string' ? id : null, title,
          });
          sent.push({ email, type: 'running_late', driveMinutes: live.minutes, lateMin });
        } else {
          try {
            await base44.asServiceRole.entities.User.update(user.id, { last_commute_late_date: user.last_commute_late_date || null });
          } catch {}
        }
        continue;
      }

      // Runs are 5 minutes apart (Oct 17 2026). Far from departure the drive
      // is measured every 15 minutes, as before (Google bills each one);
      // within 30 minutes of the last estimated departure, on every run.
      const estMs = timeMs(user.commute_depart_est);
      const nearDepart = Number.isFinite(estMs) && Math.abs(estMs - now.getTime()) <= CLOSE_MS;
      if (!onQuarterHour(now.getTime()) && !nearDepart) continue;
      // Traffic-aware drive, measured for the moment they'd actually be
      // DRIVING — not for the arrival time. Google's departure_time is when
      // the car leaves, and asking for 9:00 traffic when the drive starts at
      // 8:20 under-read the rush hour (2026-09-23: "about 30 min" against a
      // real 34-37). The drive time is what decides the departure time, so it
      // takes two passes: measure at "now" to get a first departure estimate,
      // then re-measure at that departure minute when it is still ahead.
      const firstPass = await getProximity([commute.place], home, new Date(Date.now() + 60000), routeOpts);
      let drive = firstPass.fromHome[commute.place];
      if (!drive?.minutes) {
        console.log(`[COMMUTE] Could not measure home → ${commute.place} for ${email}`);
        continue;
      }
      // The departure math uses the same rounded-up drive the message says
      // ("about 30 min"), never the raw measurement: a 26-minute measurement
      // sent "about 30 min" 36 minutes before arrival, so the 10-minute
      // cushion read as 6 (Anna, Oct 10 2026). Rounding up only ever adds.
      const firstDepart = new Date(commute.arriveUtc.getTime() - (aboutMinutes(drive.minutes) + CUSHION_MINUTES) * 60000);
      if (firstDepart.getTime() > now.getTime() + 2 * 60000) {
        const secondPass = await getProximity([commute.place], home, firstDepart, routeOpts);
        const refined = secondPass.fromHome[commute.place];
        if (refined?.minutes) drive = refined;
      }

      const planMinutes = aboutMinutes(drive.minutes);
      const leaveInMinutes = minutesUntilArrival - planMinutes - CUSHION_MINUTES;
      const departUtc = new Date(commute.arriveUtc.getTime() - (planMinutes + CUSHION_MINUTES) * 60000);

      // ── 1. LEAVE NOW ────────────────────────────────────────────────────────
      if (leaveInMinutes <= LEAVE_WINDOW_MINUTES) {
        // When they were told to go, for the running-late check (4.).
        const toldAt = leaveInMinutes < -5 ? now : departUtc;
        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            last_commute_leave_date: today,
            last_commute_leave_at: toldAt.toISOString(),
          });
        } catch (e) {
          console.error(`[COMMUTE] Could not claim leave-now for ${email}, skipping:`, e);
          continue;
        }
        const late = leaveInMinutes < -5;
        const title = late ? '🚗 Running behind — head out now' : '🚗 Time to leave for work';
        const about = aboutMinutes(drive.minutes);
        const body = late
          ? `About ${about} min drive${drive.inTraffic ? ' with traffic' : ''} and you're due at ${commute.arriveBy}. Grab your stuff and go.`
          : `It's about ${about} min${drive.inTraffic ? ' with traffic right now' : ''} — leaving now gets you there by ${commute.arriveBy}.`;
        // Not late yet → book it for the departure minute itself. Late → now.
        const sendAt = late ? null : departUtc;
        const id = await sendPush(email, user, title, body, { sendAt, alarm: true });
        if (id) {
          await ledgerRecord(base44, {
            email, kind: 'task_reminder', source: 'cronCommuteWatch',
            sendAt: sendAt || undefined,
            notificationId: typeof id === 'string' ? id : null, title,
          });
          sent.push({
            email, type: 'leave_now', driveMinutes: drive.minutes,
            scheduledFor: sendAt ? sendAt.toISOString() : 'now',
          });
        } else {
          try {
            await base44.asServiceRole.entities.User.update(user.id, { last_commute_leave_date: user.last_commute_leave_date || null });
          } catch {}
        }
        continue;
      }

      try {
        await base44.asServiceRole.entities.User.update(user.id, { commute_depart_est: departUtc.toISOString() });
      } catch {}

      // ── 2. HEADS-UP (only when traffic is genuinely worse than usual) ───────
      if (alreadyWarned) continue;
      if (minutesUntilArrival < HEADS_UP_LATEST || minutesUntilArrival > HEADS_UP_EARLIEST) continue;
      // Information waits for quiet hours to end, unless the traffic means
      // they have to leave before then: waiting would make it useless, so it
      // goes now (Oct 14 2026, the 7:32 AM one: leaving at 8:10 with quiet
      // hours until 8 waits until 8; leaving at 7:50 would not). The
      // leave-now above never waits.
      const quiet = resolveQuietHours(user);
      if (quiet.enabled && isInQuietHours(now, quiet.startMin, quiet.endMin, timeZone)) {
        const quietEndsAt = adjustForQuietHours(now, quiet.startMin, quiet.endMin, timeZone);
        if (departUtc.getTime() > quietEndsAt.getTime()) continue;
      }
      if (!drive.inTraffic) continue; // no traffic data = nothing to compare

      const freeFlow = await getProximity([commute.place], home, null, routeOpts);
      const usual = freeFlow.fromHome[commute.place]?.minutes;
      if (!usual) continue;
      const extra = drive.minutes - usual;
      if (extra < WORSE_MIN_MINUTES || drive.minutes < usual * WORSE_RATIO) continue;

      // Informational only — so it yields if something else is already landing.
      const gate = await ledgerCheck(base44, { email, kind: 'general' });
      if (!gate.allowed) continue;

      try {
        await base44.asServiceRole.entities.User.update(user.id, { last_commute_headsup_date: today });
      } catch (e) {
        console.error(`[COMMUTE] Could not claim heads-up for ${email}:`, e);
        continue;
      }

      const title = '🚧 Traffic is worse than usual';
      const body = `Your drive is running about ${aboutMinutes(drive.minutes)} min instead of the usual ${aboutMinutes(usual)}. Leaving by ${fmtLocalTime(departUtc, timeZone)} keeps you on time for ${commute.arriveBy}. I'll ping you when it's time to go.`;
      const id = await sendPush(email, user, title, body);
      if (id) {
        await ledgerRecord(base44, {
          email, kind: 'general', source: 'cronCommuteWatch',
          notificationId: typeof id === 'string' ? id : null, title,
        });
        sent.push({ email, type: 'heads_up', driveMinutes: drive.minutes, usual });
      } else {
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_commute_headsup_date: user.last_commute_headsup_date || null });
        } catch {}
      }
    }

    console.log(`[COMMUTE] Checked ${commuters.length} commuter(s), sent ${sent.length} push(es); ${events.length} event leave-now change(s)`);
    return Response.json({ success: true, checked: commuters.length, sent, events });
  } catch (err) {
    console.error('[COMMUTE] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}