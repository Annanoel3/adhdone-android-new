// "This is what a reminder looks like 👋" — booked on the server.
//
// Anna, Nov 1 2026 ("yes" to booking it from the server): Caterina finished
// the welcome chat and closed the app 7 seconds after her first to-do saved.
// The sample was booked from the phone, after a pause and only once the phone
// was linked for pushes, and a phone in the background stops running the
// app's code, so it never went out. For someone who leaves that fast it is
// the one thing that can bring them back on day one (Michael opened the app 6
// seconds after his).
//
// The phone now calls this the moment the sample is planned (the welcome
// chat's first to-do, or a new account's first to-do from anywhere else,
// QuickCapturePrompt). From then on the waiting happens here: a new phone
// isn't linked to the account until a few seconds after the notifications
// question, and OneSignal refuses a push for an account with nothing linked,
// so this tries again over about a minute, whatever the phone does meanwhile.
//
// POST { title, body, at, alarm? } from the signed-in person, for their own
// account only. Once per account (User.first_win_demo): a second call gets
// the one already booked (or "pending" while a first call is still booking).
// Only for an account made in the last 2 days. Dropped once it is more than
// 15 minutes past its planned time (arriving later, it no longer reads as a
// demo), and never booked closer than 90 seconds out (so it can't land on top
// of the question that's open). Inside quiet hours too: they are setting the
// app up right now (Anna, Oct 23 2026; RULES.md §9 Q4).
//
// Answers { ok, notificationId, at, alarm } once booked, { ok: true, pending }
// while another call is booking, { ok: false, gone } when it's too late, and
// { ok: false } when it couldn't be booked (the phone may call again).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { platformRequest } from '../../shared/sdkRetry.ts';

const NEW_ACCOUNT_MS = 2 * 24 * 60 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const MIN_LEAD_MS = 90 * 1000;
const DEFAULT_DELAY_MS = 3 * 60 * 1000;
// Another call is booking right now: leave it to that one for this long.
const BOOKING_HOLD_MS = 2 * 60 * 1000;
// Pauses between tries while the phone's link settles (about a minute in all).
const PAUSES_MS = [0, 3000, 6000, 10000, 15000, 20000];

// Base44 timestamps can come back without a zone marker; they are UTC.
function utcMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(platformRequest(req));
    const me = await base44.auth.me().catch(() => null);
    if (!me?.email) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    // { selftest: true } from the owner's account skips the new-account check,
    // to try the whole path from the editor (it still books only to the
    // caller's own account, which has no phone linked: every try is refused).
    const selftest = body?.selftest === true && me.role === 'admin';
    const made = utcMs(me.signed_up_at || me.created_date);
    if (!selftest && !(Number.isFinite(made) && Date.now() - made < NEW_ACCOUNT_MS)) {
      return Response.json({ ok: false, reason: 'not_new' });
    }

    const users = base44.asServiceRole.entities.User;
    const record = async () => (await users.filter({ email: me.email }, '-created_date', 1).catch(() => []))?.[0] || null;
    const owner = await record();
    if (!owner) return Response.json({ ok: false, reason: 'no_account' });

    const prior = selftest ? null : (owner.first_win_demo || null);
    if (prior?.id) {
      return Response.json({ ok: true, notificationId: prior.id, at: prior.at, alarm: prior.alarm === true, already: true });
    }
    if (prior?.booking_since && Date.now() - utcMs(prior.booking_since) < BOOKING_HOLD_MS) {
      return Response.json({ ok: true, pending: true });
    }

    const title = String(body?.title || '').trim().slice(0, 120);
    const text = String(body?.body || '').trim().slice(0, 300);
    if (!title || !text) return Response.json({ ok: false, error: 'title and body are required' }, { status: 400 });
    let planned = utcMs(body?.at);
    if (!Number.isFinite(planned)) planned = Date.now() + DEFAULT_DELAY_MS;
    // Never further out than a normal sample (a few minutes).
    planned = Math.min(planned, Date.now() + 10 * 60 * 1000);
    const alarm = body?.alarm === true;
    if (planned < Date.now() - STALE_MS) return Response.json({ ok: false, gone: true });

    await users.update(owner.id, {
      first_win_demo: { booking_since: new Date().toISOString(), at: new Date(planned).toISOString(), title },
    });

    const internalKey = Deno.env.get('CRON_SECRET')?.trim();
    // What each try got back, shown to a selftest only.
    const tries: any[] = [];
    for (const pause of PAUSES_MS) {
      if (pause) await sleep(pause);
      if (planned < Date.now() - STALE_MS) break;
      const sendAt = new Date(Math.max(planned, Date.now() + MIN_LEAD_MS)).toISOString();
      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey,
          toUserExternalId: me.email,
          title,
          body: text,
          sendAtISO: sendAt,
          data: alarm ? { type: 'first_win_demo', alarm: true } : { type: 'first_win_demo' },
        });
        const result = res?.data || res;
        const id = result?.notificationId;
        if (selftest) tries.push({ id: id || null, skipped: result?.skipped || null, reason: result?.reason || null, error: result?.error || null, onesignal: result?.onesignal_response?.errors || null });
        if (!id) continue; // not linked yet (refused), or held back: try again after the next pause
        const at = typeof result?.sendAt === 'string' && result.sendAt ? result.sendAt : sendAt;
        await users.update(owner.id, {
          first_win_demo: { id, at, title, alarm, booked_at: new Date().toISOString() },
        }).catch((e: any) => console.error('[bookFirstWinDemo] booked but not recorded:', e?.message || e));
        console.log(`[bookFirstWinDemo] ${me.email}: booked for ${at}${alarm ? ' (alarm)' : ''}`);
        return Response.json({ ok: true, notificationId: id, at, alarm });
      } catch (e) {
        const err: any = e;
        if (selftest) tries.push({ thrown: String(err?.message || err), status: err?.response?.status || null, data: err?.response?.data || null });
        console.warn('[bookFirstWinDemo] try failed:', err?.message || err);
      }
    }

    // Couldn't book it: free the hold so a later call (the phone once it's
    // linked) can try again while it's still on time.
    await users.update(owner.id, {
      first_win_demo: { failed_at: new Date().toISOString(), at: new Date(planned).toISOString(), title },
    }).catch(() => {});
    console.warn(`[bookFirstWinDemo] ${me.email}: not booked (this phone never took the push in time)`);
    return Response.json(selftest ? { ok: false, tries } : { ok: false });
  } catch (error) {
    console.error('[bookFirstWinDemo] failed:', error);
    return Response.json({ ok: false, error: String((error as any)?.message || error) }, { status: 500 });
  }
});
