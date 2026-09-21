import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getTodaysCommute, localDateKey } from '../../shared/commuteSchedule.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { getProximity } from '../../shared/mapsDistance.ts';

// TEMPORARY read-only diagnostic, borrowed slot. Restore the original
// testOneSignalConnection code right after use. Admins only. Changes nothing.
// Runs cronCommuteWatch's own decision logic against the CALLER's record and
// reports every gate. Returns no addresses and no coordinates.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    const rec = (await svc.entities.User.filter({ email: me.email }))[0] || me;
    const now = new Date();
    const tz = rec.timezone || 'America/Chicago';
    const today = localDateKey(now, tz);

    const home = getHomeOrigin(rec);
    const gates = {
      hasEmail: !!rec.email,
      workRemote: rec.work_remote ?? null,
      hasWorkAddress: !!(rec.work_address || '').trim(),
      workAddressLength: (rec.work_address || '').length,
      hasHome: !!home,
      homeLatType: typeof rec.home_lat,
      homeLngType: typeof rec.home_lng,
    };
    const passesCommuterFilter = !!(rec.email && !rec.work_remote && rec.work_address && home);

    let shifts = [];
    if (rec.work_schedule_mode === 'varies') {
      const all = await svc.entities.WorkShift.list('-shift_date', 500);
      shifts = all.filter((s) => s.created_by === rec.email);
    }
    const commute = getTodaysCommute(rec, shifts, now);

    let drive = null;
    let leaveAtUtc = null;
    if (commute && home) {
      const p = await getProximity([commute.place], home, commute.arriveUtc);
      const d = p.fromHome[commute.place];
      drive = d ? { minutes: d.minutes ?? null, inTraffic: d.inTraffic ?? null } : null;
      if (d?.minutes) leaveAtUtc = new Date(commute.arriveUtc.getTime() - (d.minutes + 10) * 60000).toISOString();
    }

    const ledger = await svc.entities.NotificationLedger.filter({ user_email: rec.email, source: 'cronCommuteWatch' });

    const fmt = (iso) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : null);

    return Response.json({
      ok: true,
      nowLocal: fmt(now.toISOString()),
      tz,
      today,
      gates,
      passesCommuterFilter,
      scheduleMode: rec.work_schedule_mode ?? null,
      fixedDays: Array.isArray(rec.work_fixed_days) ? rec.work_fixed_days : rec.work_fixed_days ?? null,
      shiftsToday: shifts.filter((s) => s.shift_date === today).map((s) => ({ arrive_by: s.arrive_by })),
      todaysCommute: commute ? { arriveBy: commute.arriveBy, arriveLocal: fmt(commute.arriveUtc.toISOString()) } : null,
      drive,
      wouldLeaveAtLocal: fmt(leaveAtUtc),
      lastLeaveDate: rec.last_commute_leave_date ?? null,
      lastHeadsupDate: rec.last_commute_headsup_date ?? null,
      commuteLedgerEntries: ledger.length,
      commuteLedgerRecent: ledger.slice(-5).map((l) => ({ sendAtLocal: fmt(l.send_at), title: l.title })),
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
