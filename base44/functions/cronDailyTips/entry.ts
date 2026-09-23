import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

// ── Day-2 nudge ─────────────────────────────────────────────────────────────
// Someone who signed up a day or two ago and never put a single task in has
// not seen the app do anything yet. One friendly push, once, at 10 in their
// own morning; never again after that, whatever they do with it.
const HOUR_MS = 60 * 60 * 1000;
const NUDGE_MIN_AGE_MS = 20 * HOUR_MS;
const NUDGE_MAX_AGE_MS = 96 * HOUR_MS;

// The next 10:00 in the user's own zone, as a UTC instant.
function nextTenAmLocal(tz: string): string {
  const now = new Date();
  for (let d = 0; d < 3; d++) {
    const day = new Date(now.getTime() + d * 24 * HOUR_MS);
    let ymd = '';
    try { ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(day); } catch { ymd = day.toISOString().slice(0, 10); }
    const naive = new Date(`${ymd}T10:00:00Z`);
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

async function sendDayTwoNudges(base44: any) {
  const now = Date.now();
  const users = await base44.asServiceRole.entities.User.list('-created_date', 1000);
  let sent = 0;
  for (const u of users) {
    if (!u?.email || !u.signed_up_at || u.first_task_nudge_sent_at) continue;
    const age = now - new Date(u.signed_up_at).getTime();
    if (!(age >= NUDGE_MIN_AGE_MS && age <= NUDGE_MAX_AGE_MS)) continue;
    const tasks = await base44.asServiceRole.entities.Task.filter({ created_by: u.email }, '-created_date', 1);
    if (tasks?.length) continue;
    try {
      await base44.asServiceRole.functions.invoke('schedulePush', {
        internalKey: CRON_SECRET,
        toUserExternalId: u.email,
        title: 'Ready when you are 👋',
        body: "Add one thing you need to do today — a call, an errand, anything — and ADHDone will remind you at the right time.",
        sendAtISO: nextTenAmLocal(u.timezone || 'America/Chicago'),
        data: { type: 'first_task_nudge' },
      });
      await base44.asServiceRole.entities.User.update(u.id, { first_task_nudge_sent_at: new Date().toISOString() });
      sent++;
    } catch (e) {
      console.error('[DAILY TIPS] day-2 nudge failed for one account:', e?.message);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  try {
    console.log('💡 [DAILY TIPS] Starting daily tip cleanup...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!providedSecret) {
      try {
        const body = await req.json();
        providedSecret = body.secret || '';
      } catch (e) {
        // Body not JSON or empty, that's ok
      }
    }
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [DAILY TIPS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

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

    let nudged = 0;
    try {
      nudged = await sendDayTwoNudges(base44);
    } catch (e) {
      console.error('[DAILY TIPS] day-2 nudge pass failed:', e?.message);
    }

    const result = {
      success: true,
      today: today,
      deleted: deletedCount,
      remaining: allTips.length - deletedCount,
      day2_nudges: nudged,
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