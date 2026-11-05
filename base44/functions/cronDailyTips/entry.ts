import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { resolveQuietHours } from '../../shared/quietHours.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

// (The day-2 "Ready when you are" push that lived here — a no-task account
// 20-96 hours old, once, 2 hours after quiet hours end — was dropped Nov 4
// 2026 (Anna: "Drop the older day 2 push"): since Nov 2 the day-2 come-back in
// cronBackBurnerCheckIn reaches the same people the afternoon of their next
// day, so the two landed on the same day. User.first_task_nudge_sent_at stays
// on older accounts as a record; the ledger kind 'first_task_nudge' stays
// listed in shared/sendLedger.ts as a name only.)
const HOUR_MS = 60 * 60 * 1000;

// The next HH:MM (minutes after midnight) in the user's own zone, as a UTC instant.
function nextLocalTime(tz: string, minOfDay: number): string {
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0');
  const mm = String(minOfDay % 60).padStart(2, '0');
  const now = new Date();
  for (let d = 0; d < 3; d++) {
    const day = new Date(now.getTime() + d * 24 * HOUR_MS);
    let ymd = '';
    try { ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(day); } catch { ymd = day.toISOString().slice(0, 10); }
    const naive = new Date(`${ymd}T${hh}:${mm}:00Z`);
    let offsetMs = 0;
    try {
      const inTz = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
      const inUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
      offsetMs = inTz.getTime() - inUtc.getTime();
    } catch { offsetMs = 0; }
    const instant = new Date(naive.getTime() - offsetMs);
    if (instant.getTime() > now.getTime() + 5 * 60 * 1000) return instant.toISOString();
  }
  return new Date(now.getTime() + 24 * HOUR_MS).toISOString();
}

// ── About-you nudge ──────────────────────────────────────────────────────────────────────
// The about-you question ("tell us a little about your life") left the first
// sitting on Nov 4 2026 (Anna: "Make about me on second open. If they skip it
// or never open a second time, send them a notification mentioning the about
// me and how they can get the most from ADHDone by adding some info"). The
// app asks it on the second open (CatchUpDialog). This is the push: ONE, for a
// phone account that finished the welcome chat and still has nothing in
// about_me 44 hours on — either the question was shown and skipped (the app
// writes onboarding_catchup_done to the account the moment it appears) or it
// never came up because they never opened the app again. Someone who IS
// coming back and simply hasn't had the question yet (another popup had the
// open) is left to the app. Booked for midday their time (4 hours after
// their quiet hours end) through schedulePush, so the send ledger keeps it
// 20 minutes clear of their reminders and lets a real reminder take its slot.
// 44 hours: day 3, never day 2, which already has the "Ready when you are"
// nudge above and the day-2 come-back (cronBackBurnerCheckIn). Not sent to a
// web-only account (nothing to push to), to someone with notifications off,
// or to a phone OneSignal says nothing reaches; given up after 10 days. The
// tap opens the question on Home (OneSignalInit: data.ask === 'about' →
// /Home?askAbout=1).
const ABOUT_MIN_AGE_MS = 44 * HOUR_MS;
const ABOUT_MAX_AGE_MS = 10 * 24 * HOUR_MS;
// A first sitting is over well inside this; a last_active_at further from
// signing up than this means they came back.
const FIRST_SITTING_MS = 3 * HOUR_MS;
const ABOUT_TITLE = 'Get more out of ADHDone';
const ABOUT_BODY = "Tell us a little about your life — work hours, kids, night shifts — and your reminders start fitting around you. Tap to add it; it takes 30 seconds.";

const msOf = (v: any) => {
  const s = String(v || '');
  if (!s) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};

// Who is due the about-you push and why; `preview` sends and saves nothing.
async function sendAboutMeNudges(base44: any, preview = false) {
  const now = Date.now();
  const users = await base44.asServiceRole.entities.User.list('-created_date', 1000);
  const out: any[] = [];
  let sent = 0;
  for (const u of users) {
    if (!u?.email || !u.signed_up_at || u.about_me_nudge_sent_at) continue;
    if (String(u.about_me || '').trim()) continue;
    if (!u.app_platform) continue;                       // web only: nothing to push to
    const flags: string[] = Array.isArray(u.onboarding_flags) ? u.onboarding_flags : [];
    if (!flags.includes('onboarding_welcome_done')) continue; // the chat itself comes back first
    if (u.alarm_permissions?.notifications === false) continue;
    const signedUp = msOf(u.signed_up_at);
    const age = now - signedUp;
    if (!(age >= ABOUT_MIN_AGE_MS && age <= ABOUT_MAX_AGE_MS)) continue;
    const lastSeen = msOf(u.last_active_at);
    const unreachable = msOf(u.push_unreachable_at);
    if (Number.isFinite(unreachable) && !(Number.isFinite(lastSeen) && lastSeen > unreachable)) continue;
    const shown = flags.includes('onboarding_catchup_done');
    const cameBack = Number.isFinite(lastSeen) && lastSeen - signedUp > FIRST_SITTING_MS;
    const why = shown ? 'skipped the question' : !cameBack ? 'never opened the app again' : '';
    if (!why) continue;                                  // coming back; the app will ask
    const tz = u.timezone || 'America/Chicago';
    const sendAtISO = nextLocalTime(tz, (resolveQuietHours(u).endMin + 240) % (24 * 60));
    if (preview) { out.push({ email: u.email, why, hoursOld: Math.round(age / HOUR_MS), sendAtISO, tz }); continue; }
    try {
      const res = await base44.asServiceRole.functions.invoke('schedulePush', {
        internalKey: CRON_SECRET,
        toUserExternalId: u.email,
        title: ABOUT_TITLE,
        body: ABOUT_BODY,
        sendAtISO,
        data: { type: 'general', ask: 'about', screen: '/Home?askAbout=1' },
      });
      // Not booked (stacked on another push, or refused): tried again tomorrow.
      if (!res?.data?.notificationId) { console.log(`[DAILY TIPS] about-you push not booked for one account: ${res?.data?.reason || res?.data?.error || 'no id'}`); continue; }
      await base44.asServiceRole.entities.User.update(u.id, { about_me_nudge_sent_at: new Date().toISOString() });
      sent++;
    } catch (e) {
      console.error('[DAILY TIPS] about-you push failed for one account:', e?.message);
    }
  }
  return preview ? out : sent;
}

Deno.serve(async (req) => {
  try {
    console.log('💡 [DAILY TIPS] Starting daily tip cleanup...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    let body: any = {};
    try { body = await req.json(); } catch (e) { body = {}; /* not JSON or empty, that's ok */ }
    if (!providedSecret) providedSecret = body?.secret || '';

    const base44 = createClientFromRequest(req);

    // { "previewAboutMe": true } from an admin (Test Function): who is due the
    // about-you push, and when it would go. Sends nothing, saves nothing.
    if (body?.previewAboutMe === true) {
      const me = await base44.auth.me().catch(() => null);
      if (me?.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
      const due = await sendAboutMeNudges(base44, true);
      return Response.json({ preview: true, due, at: new Date().toISOString() });
    }
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [DAILY TIPS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`📅 [DAILY TIPS] Today is ${today}`);
    console.log(`🗑️  [DAILY TIPS] Deleting all tips older than today...`);
    
    // Get all existing tips
    const allTips = await base44.asServiceRole.entities.DailyTip.list();
    
    let deletedCount = 0;
    
    // Delete any tips that aren't from today
    for (const tip of allTips) {
      if (tip.shown_date !== today) {
        await base44.asServiceRole.entities.DailyTip.delete(tip.id);
        deletedCount++;
        console.log(`🗑️  [DAILY TIPS] Deleted old tip from ${tip.shown_date}`);
      }
    }

    let aboutNudged = 0;
    try {
      aboutNudged = await sendAboutMeNudges(base44);
    } catch (e) {
      console.error('[DAILY TIPS] about-you push pass failed:', e?.message);
    }

    const result = {
      success: true,
      today: today,
      deleted: deletedCount,
      remaining: allTips.length - deletedCount,
      about_me_nudges: aboutNudged,
      at: new Date().toISOString()
    };
    
    console.log('✅ [DAILY TIPS] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [DAILY TIPS] Fatal:', err);
    return Response.json({ 
      success: false, 
      error: String(err),
      stack: err.stack 
    }, { status: 500 });
  }
});