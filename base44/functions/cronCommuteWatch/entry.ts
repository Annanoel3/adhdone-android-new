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
//      it's information, and it stays silent on a normal day.
//   2. LEAVE NOW (the safety net): fires when departure time arrives —
//      arrival time minus measured drive time minus a get-out-the-door
//      cushion. This one is time-critical and is never suppressed by quiet
//      hours; a commute alert that yields is a commute alert that made
//      someone late.
//
// Both are claimed on the user record BEFORE sending, so a re-run (or a run cut
// off mid-send) can't double-notify — the same rule the daily digest uses.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getTodaysCommute, localDateKey } from '../../shared/commuteSchedule.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { getProximity } from '../../shared/mapsDistance.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { listAll } from '../../shared/listAll.ts';

const CUSHION_MINUTES = 10;       // finding keys / shoes / getting in the car
const LEAVE_WINDOW_MINUTES = 16;  // one cron tick, so departure is never missed
const HEADS_UP_EARLIEST = 100;    // minutes before arrival
const HEADS_UP_LATEST = 40;
// "Worse than usual" has to mean something, or the heads-up becomes noise the
// user learns to ignore: at least 8 minutes AND 20% over the free-flow drive.
const WORSE_MIN_MINUTES = 8;
const WORSE_RATIO = 1.2;

function fmtLocalTime(utc: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(utc);
}

async function sendPush(email: string, user: any, title: string, body: string) {
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

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const sent: any[] = [];

    const users = await listAll(base44.asServiceRole.entities.User);
    // Remote workers have hours but no drive — never send them a "leave now".
    const commuters = users.filter((u: any) => u?.email && !u?.work_remote && u?.work_address && getHomeOrigin(u));
    if (commuters.length === 0) {
      return Response.json({ success: true, checked: 0, sent: [] });
    }

    // Shifts are only needed for people on a week-by-week schedule.
    let shifts: any[] = [];
    if (commuters.some((u: any) => u.work_schedule_mode === 'varies')) {
      shifts = await base44.asServiceRole.entities.WorkShift.list('-shift_date', 500);
    }

    for (const user of commuters) {
      const email = user.email;
      const timeZone = user.timezone || 'America/Chicago';
      const today = localDateKey(now, timeZone);

      const mine = shifts.filter((s: any) => s.created_by === email);
      const commute = getTodaysCommute(user, mine, now);
      if (!commute) continue;

      const minutesUntilArrival = Math.round((commute.arriveUtc.getTime() - now.getTime()) / 60000);
      // Past arrival time, or too far out to measure traffic usefully.
      if (minutesUntilArrival <= 0 || minutesUntilArrival > HEADS_UP_EARLIEST) continue;

      const alreadyLeft = user.last_commute_leave_date === today;
      const alreadyWarned = user.last_commute_headsup_date === today;
      if (alreadyLeft) continue;

      const home = getHomeOrigin(user);
      // Traffic-aware drive, measured for the moment they'd actually be driving.
      const withTraffic = await getProximity([commute.place], home, commute.arriveUtc);
      const drive = withTraffic.fromHome[commute.place];
      if (!drive?.minutes) {
        console.log(`[COMMUTE] Could not measure home → ${commute.place} for ${email}`);
        continue;
      }

      const leaveInMinutes = minutesUntilArrival - drive.minutes - CUSHION_MINUTES;
      const departUtc = new Date(commute.arriveUtc.getTime() - (drive.minutes + CUSHION_MINUTES) * 60000);

      // ── 1. LEAVE NOW ────────────────────────────────────────────────────────
      if (leaveInMinutes <= LEAVE_WINDOW_MINUTES) {
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_commute_leave_date: today });
        } catch (e) {
          console.error(`[COMMUTE] Could not claim leave-now for ${email}, skipping:`, e);
          continue;
        }
        const late = leaveInMinutes < -5;
        const title = late ? '🚗 Running behind — head out now' : '🚗 Time to leave for work';
        const body = late
          ? `${drive.minutes} min drive${drive.inTraffic ? ' with traffic' : ''} and you're due at ${commute.arriveBy}. Grab your stuff and go.`
          : `It's about ${drive.minutes} min${drive.inTraffic ? ' with traffic right now' : ''} — leaving now gets you there by ${commute.arriveBy}.`;
        const id = await sendPush(email, user, title, body);
        if (id) {
          await ledgerRecord(base44, {
            email, kind: 'task_reminder', source: 'cronCommuteWatch',
            notificationId: typeof id === 'string' ? id : null, title,
          });
          sent.push({ email, type: 'leave_now', driveMinutes: drive.minutes });
        } else {
          try {
            await base44.asServiceRole.entities.User.update(user.id, { last_commute_leave_date: user.last_commute_leave_date || null });
          } catch {}
        }
        continue;
      }

      // ── 2. HEADS-UP (only when traffic is genuinely worse than usual) ───────
      if (alreadyWarned) continue;
      if (minutesUntilArrival < HEADS_UP_LATEST || minutesUntilArrival > HEADS_UP_EARLIEST) continue;
      if (!drive.inTraffic) continue; // no traffic data = nothing to compare

      const freeFlow = await getProximity([commute.place], home, null);
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
      const body = `Your drive is running about ${drive.minutes} min instead of the usual ${usual}. Leaving by ${fmtLocalTime(departUtc, timeZone)} keeps you on time for ${commute.arriveBy}. I'll ping you when it's time to go.`;
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

    console.log(`[COMMUTE] Checked ${commuters.length} commuter(s), sent ${sent.length} push(es)`);
    return Response.json({ success: true, checked: commuters.length, sent });
  } catch (err) {
    console.error('[COMMUTE] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}