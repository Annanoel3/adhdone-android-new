// Re-saved Nov 12 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r44, a chore is only brought up when there is time to finish it before their bedtime (laundry at 10:29 PM, an hour before quiet hours; Anna: "Too late to be suggesting this").
// Nov 11 2026: the morning summary is gone (Anna: "ok get rid of it"). This function now sends only the evening check-in.
// Re-saved Nov 11 2026 so the bundled shared/sendLedger.ts is picked up: reminder history is filed by what OneSignal says happened (sent, reached no phone, or cancelled and not kept).
// Re-saved Nov 9 2026 (night) so the bundled shared/easeOff.ts is picked up: a one-time task is never put on the morning-summary-only plan.
// Re-saved Nov 7 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r43, store runs wait for daytime or early evening (after about 7 PM, the next day).
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 4 2026 (night) so the bundled shared/sendLedger.ts is picked up: event_heads_up, event_conflict and first_task_nudge count as soft pushes in the ledger.
// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// The evening check-in push. (This function also sent the morning summary
// until Nov 11 2026; its name and its 30-minute schedule are from then.)
//
// THE MORNING SUMMARY IS GONE (Anna, Nov 11 2026: "It's always too much text
// to read, so I never read it. It's a nuisance for me", then "ok get rid of
// it"). It was one push in the hour after someone woke up, listing everything
// on their day. What the numbers said when she asked: of the five real people
// getting it, four had 1 to 3 things on their day (it repeated what their own
// reminder would say) and hers squeezed seven into 179 characters; since Oct
// 30, 58 of them went to 13 other people and the app was opened within the
// hour after 6 times; OneSignal counted no taps on the 11 checked from Nov 9
// to 11. With it went: Smart Reminders' wait for it in the hour after wake-up
// (cronSmartTaskNudge), and the owner alert's "it was named in the morning
// summary" pass (cronRefillReminders check 8). Nothing reads
// User.last_digest_date any more.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
// localDateKey is this file's own (below). Importing it too, as on Oct 12 2026 at
// 05:28 UTC, is a duplicate declaration and the function failed to start.
import { localMinutesOfDay, userTimeZone, theirDayKeyFor, resolveQuietHours } from '../../shared/quietHours.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { listAll } from '../../shared/listAll.ts';
import { usedAppBetween } from '../../shared/usedApp.ts';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();

    const allUsers = await listAll(base44.asServiceRole.entities.User);

    // The evening check-in push (Anna, Oct 30 2026: the evening card AND a
    // notification; Oct 31 2026: it asks "How did you feel today?" too). Once
    // a day, in the hour before their quiet hours start (9 PM with quiet hours
    // off), a plain push that opens the box with the mood faces and the win
    // (data.type 'win_ask', OneSignalInit). Not on someone's first day, not
    // for anyone away a week or paused, not when they already saved a win OR
    // a mood today (they already checked in; don't nag), and never stacked on
    // another push (send ledger).
    let winAsks = 0;
    try {
      winAsks = await sendEveningWinAsks(base44, allUsers, now);
    } catch (e) {
      console.error('[DIGEST] Evening win asks failed:', e);
    }

    return Response.json({
      success: true,
      winAsks,
      at: now.toISOString()
    });
  } catch (err) {
    console.error('[DIGEST] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

// Paused by Smart Reminders after a week away and not back since (opening the
// app moves last_active_at past it; cronSmartTaskNudge clears it when any
// other sign of them shows up).
function pausedForAway(user: any): boolean {
  const paused = Date.parse(user?.smart_nudge_paused_at || '');
  if (!Number.isFinite(paused)) return false;
  const back = Date.parse(user?.last_active_at || '');
  return !(Number.isFinite(back) && back > paused);
}

// For people who need to be brought back, the evening push changes every
// night (Anna, Nov 6 2026: "the wording for
// 'what's one win today' should definitely differ day by day. 3 days in a row
// of that is annoying. Maybe alternate between the come back push like
// 'what's something you could get off your brain' etc."). All of that was
// about people who need to be brought back, never active people (Anna, Nov 9
// 2026: "I was 10,000% only talking about people who dont use the app";
// "Those are COMEBACK MESSAGES. The entire time I talked about those with
// you, WE were talking about PEOPLE WHO NEED TO BE BROUGHT BACK... I NEVER
// asked for it to happen to active people"). From Nov 6 to Nov 9 it went to
// everyone, and she got "Anything you don't want to forget?" while using the
// app every day. So:
//  - actually used the app today, not just opened it (shared/usedApp.ts; Anna,
//    Nov 9 2026: "People who actually used the app!!! Not just opened get
//    the 'how did today go'"): "How did today go?" every night
//    (USED_TODAY_LINE; opens the mood faces + win box, data.type 'win_ask');
//  - everyone else this push reaches (here in the past week, opened the app
//    today or has finished a task before): a different line every night,
//    nights alternating between a check-in and a come-back-style brain dump
//    (opens Add Task, data.type 'evening_dump');
//  - a come-back push went out to them today: no evening push at all (Anna,
//    Nov 9 2026: "if someone gets a midday comeback or whatever, dont do a
//    night one").
// Picked by their calendar day, so a second run in the hour can't pick a
// different one. The come-back pushes (cronBackBurnerCheckIn) have their own
// lines; these don't repeat them.
const USED_TODAY_LINE = { title: 'How did today go?', body: 'Tap to check in and save one win, big or small.' };
const EVENING_CHECKINS = [
  { title: 'How did today go?', body: 'Tap to check in and save one win, big or small.' },
  { title: 'Anything go right today?', body: 'Even tiny counts. Save it before it slips away.' },
  { title: 'Quick check-in', body: "How are you feeling tonight? One tap and you're done." },
  { title: 'One win from today?', body: 'Made the bed, answered a text, got through it. It all counts.' },
  { title: 'How was your day, really?', body: 'Pick a face and jot down one thing that went okay.' },
];
const EVENING_DUMPS = [
  { title: "What's on your mind for tomorrow?", body: 'Get it out of your head and into ADHDone before bed.' },
  { title: 'Brain still running?', body: 'Drop one thing here and let ADHDone hold onto it overnight.' },
  { title: "Anything you don't want to forget?", body: "Say it or type it. We'll handle the reminding." },
  { title: 'Off your brain, onto the list', body: "One thing you'd rather not carry into tomorrow?" },
];
function eveningLine(dayKey: string, usedToday: boolean): { title: string; body: string; dump: boolean } {
  const [y, mo, d] = String(dayKey).split('-').map(Number);
  const n = Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)
    ? Math.floor(Date.UTC(y, mo - 1, d) / (24 * 60 * 60 * 1000))
    : 0;
  if (usedToday) return { ...USED_TODAY_LINE, dump: false };
  const list = n % 2 === 1 ? EVENING_DUMPS : EVENING_CHECKINS;
  return { ...list[Math.floor(n / 2) % list.length], dump: n % 2 === 1 };
}

// The day the evening card and the box stamp a win or a mood with
// (winsStore.eveningWindow on the phone): their calendar day, except that an
// evening window that runs past midnight (quiet hours starting after
// midnight) belongs to the day it started on.
function eveningDayKey(user: any, now: Date, timeZone: string): string {
  const today = localDateKey(now, timeZone);
  const m = /^(\d{1,2}):(\d{2})/.exec(String(user?.quiet_hours_start || ''));
  const end = m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? Number(m[1]) * 60 + Number(m[2]) : 22 * 60;
  const start = end > 17 * 60 ? 17 * 60 : (end - 240 + 1440) % 1440;
  if (start < end) return today;
  if (localMinutesOfDay(now, timeZone) >= end) return today;
  const [y, mo, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
}

// A come-back push (cronBackBurnerCheckIn, ledger source 'comeback') went
// out to them since the start of today. When the check can't run, it counts
// as yes (no evening push).
async function comebackToday(base44: any, email: string, sinceISO: string): Promise<boolean> {
  try {
    const rows = await base44.asServiceRole.entities.NotificationLedger.filter(
      { user_email: email, source: 'comeback', send_at: { $gte: sinceISO } }, '-send_at', 1);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.error(`[DIGEST] Come-back check failed for ${email}:`, (e as any)?.message || e);
    return true;
  }
}

async function sendEveningWinAsks(base44: any, allUsers: any[], now: Date): Promise<number> {
  const DAY = 24 * 60 * 60 * 1000;
  let sent = 0;
  for (const user of allUsers) {
    const email = user?.email;
    if (!email) continue;
    // Phone app accounts only (that's where pushes go).
    if (!user.app_platform && !user.app_build) continue;
    if (user.alarm_permissions?.notifications === false) continue;
    const lastActive = Date.parse(user.last_active_at || '');
    if (!Number.isFinite(lastActive) || now.getTime() - lastActive >= 7 * DAY) continue;
    if (pausedForAway(user)) continue;
    const joined = Date.parse(user.signed_up_at || user.created_date || '');
    if (!Number.isFinite(joined) || now.getTime() - joined < DAY) continue;

    const timeZone = userTimeZone(user);
    const quiet = resolveQuietHours(user);
    const startMin = quiet.enabled ? quiet.startMin : 21 * 60;
    const nowMin = localMinutesOfDay(now, timeZone);
    const minutesBefore = (startMin - nowMin + 1440) % 1440;
    if (!(minutesBefore > 0 && minutesBefore <= 60)) continue;

    const dayKey = theirDayKeyFor(user, now, timeZone);
    if (user.win_ask_date === dayKey) continue;

    // Only someone who opened the app today, or who has ever finished a task
    // in it. Someone who signed up, looked for a minute and never came back
    // was getting "How did you feel today?" the next evening with nothing
    // behind it (Nov 3 2026: two accounts from the weekend), the kind of
    // random ping that gets an app deleted. Anna: "the how did you feel could
    // go to the people you said".
    const openedToday = localDateKey(new Date(lastActive), timeZone) === localDateKey(now, timeZone);
    if (!openedToday) {
      let finishedOne = false;
      try {
        const done = await base44.asServiceRole.entities.Task.filter({ created_by: email, status: 'completed' }, '-updated_date', 1);
        finishedOne = Array.isArray(done) && done.length > 0;
      } catch (e) {
        console.error(`[DIGEST] Finished-task check failed for ${email}:`, (e as any)?.message || e);
        continue;
      }
      if (!finishedOne) continue;
    }

    // Already checked in today: a win or a mood saved for today, as the app
    // stamps it (their calendar day, or the evening it belongs to when their
    // evening runs past midnight; both are checked).
    const localDay = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const days = [...new Set([localDay, eveningDayKey(user, now, timeZone)])];
    let haveOne = true;
    try {
      haveOne = false;
      for (const day of days) {
        const wins = await base44.asServiceRole.entities.Win.filter({ created_by: email, win_date: day }, '-created_date', 1);
        if (Array.isArray(wins) && wins.length > 0) { haveOne = true; break; }
      }
    } catch (e) {
      // Can't check (the Win table isn't there yet): don't ask.
      console.error(`[DIGEST] Win check failed for ${email}:`, (e as any)?.message || e);
      continue;
    }
    if (haveOne) continue;
    try {
      for (const day of days) {
        const moods = await base44.asServiceRole.entities.DayMood.filter({ created_by: email, day }, '-updated_date', 1);
        if (Array.isArray(moods) && moods.length > 0) { haveOne = true; break; }
      }
    } catch (e) {
      // Can't check the mood: don't ask (same as the win check).
      console.error(`[DIGEST] Mood check failed for ${email}:`, (e as any)?.message || e);
      continue;
    }
    if (haveOne) continue;

    // Since the start of today: their calendar day, or the day an evening
    // that runs past midnight started on.
    let sinceMs = now.getTime() - (nowMin + 1) * 60 * 1000;
    if (eveningDayKey(user, now, timeZone) !== localDay) sinceMs -= DAY;
    const sinceISO = new Date(sinceMs).toISOString();
    if (await comebackToday(base44, email, sinceISO)) continue;
    // Actually used the app today (shared/usedApp.ts). A check that can't run
    // counts as used, so a brain dump never goes to someone using the app.
    const usedToday = await usedAppBetween(base44, email, sinceISO, null, true);

    const gate = await ledgerCheck(base44, { email, kind: 'motivation' });
    if (!gate.allowed) continue;

    // Claim the day before sending, so a second run in the hour can't repeat it.
    try {
      await base44.asServiceRole.entities.User.update(user.id, { win_ask_date: dayKey });
    } catch (e) {
      console.error(`[DIGEST] Could not claim the win ask for ${email}:`, e);
      continue;
    }
    const line = eveningLine(dayKey, usedToday);
    const id = await sendWinAsk(email, line);
    if (id) {
      // A brain dump is recorded as its own source, so the owner alerts
      // (cronRefillReminders check 17) can tell it from the check-in.
      await ledgerRecord(base44, { email, kind: 'motivation', source: line.dump ? 'evening_dump' : 'cronDailyDigest', notificationId: id, title: line.title });
      sent += 1;
    } else {
      try { await base44.asServiceRole.entities.User.update(user.id, { win_ask_date: user.win_ask_date || null }); } catch {}
    }
  }
  console.log(`[DIGEST] Evening win asks sent: ${sent}`);
  return sent;
}

async function sendWinAsk(email: string, line: { title: string; body: string; dump: boolean }): Promise<string | false> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return false;
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [email],
        channel_for_external_user_ids: 'push',
        headings: { en: line.title },
        contents: { en: line.body },
        data: line.dump ? { type: 'evening_dump', screen: '/AddTask' } : { type: 'win_ask', screen: '/Home?win=1' },
        // An evening question: gone by the time it would be stale.
        ttl: 2 * 60 * 60,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.errors) {
      console.error(`[DIGEST] Win ask: OneSignal error for ${email}:`, result);
      return false;
    }
    return result.id || 'sent';
  } catch (e) {
    console.error(`[DIGEST] Win ask: failed to send to ${email}:`, e);
    return false;
  }
}

// YYYY-MM-DD in the user's timezone, so dates compare as plain strings.
function localDateKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Re-saved Nov 12 2026: shared/reminderTitle.ts (the alarm of their own young child's birthday has no "Write a text" button; birthday_no_text).
