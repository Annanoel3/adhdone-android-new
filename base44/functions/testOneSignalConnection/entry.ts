import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getTodaysCommute, localDateKey } from '../../shared/commuteSchedule.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { getProximity } from '../../shared/mapsDistance.ts';

// TEMPORARY read-only diagnostic, borrowed slot. Restore the original
// testOneSignalConnection code right after use. Admins only. Changes nothing.
// Runs cronCommuteWatch's own decision logic against ONE named account (Anna's
// app account by default) and reports every gate. Returns no addresses and no
// coordinates.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const target = String(body.email || 's2kap2chick@gmail.com');
    const found = await svc.entities.User.filter({ email: target });
    if (found.length !== 1) return Response.json({ ok: false, usersMatched: found.length });
    const rec = found[0];
    const now = new Date();
    const tz = rec.timezone || 'America/Chicago';
    const today = localDateKey(now, tz);

    const home = getHomeOrigin(rec);
    const gates = {
      hasEmail: !!rec.email,
      workRemote: rec.work_remote ?? null,
      hasWorkAddress: !!(rec.work_address || '').trim(),
      workAddressLength: (rec.work_address || '').length,
      workAddressKeyPresent: Object.prototype.hasOwnProperty.call(rec, 'work_address'),
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

    const lastEntry = ledger[ledger.length - 1] || null;
    const appId = Deno.env.get('ONESIGNAL_APP_ID')!.trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim();
    let osNotif = null;
    if (lastEntry?.notification_id) {
      const r = await fetch('https://onesignal.com/api/v1/notifications/' + encodeURIComponent(lastEntry.notification_id) + '?app_id=' + encodeURIComponent(appId), { headers: { Authorization: 'Basic ' + key } });
      const j = await r.json();
      osNotif = { httpStatus: r.status, successful: j?.successful ?? null, failed: j?.failed ?? null, errored: j?.errored ?? null, remaining: j?.remaining ?? null, received: j?.received ?? null, converted: j?.converted ?? null, completedAt: j?.completed_at ?? null, queuedAt: j?.queued_at ?? null, errors: j?.errors ?? null };
    }
    let osUser = null;
    {
      const r = await fetch('https://api.onesignal.com/apps/' + appId + '/users/by/external_id/' + encodeURIComponent(rec.email), { headers: { Authorization: 'Basic ' + key } });
      if (r.ok) {
        const b = await r.json();
        const subs = Array.isArray(b?.subscriptions) ? b.subscriptions : [];
        const toIso = (t) => (t ? new Date(Number(t) * 1000).toISOString() : null);
        osUser = { lastActive: toIso(b?.properties?.last_active), pushSubs: subs.filter((s) => typeof s?.type === 'string' && s.type.endsWith('Push')).map((s) => ({ type: s.type, enabled: s.enabled ?? null, notificationTypes: s.notification_types ?? null, sessionCount: s.session_count ?? null, appVersion: s.app_version ?? null, deviceModel: s.device_model ?? null })) };
      } else osUser = { httpStatus: r.status };
    }

    // Compare against her other recent pushes: does OneSignal record confirmed
    // receipt for ANY of them? If yes, confirmed delivery is tracked and a 0 means
    // the commute push really did not land.
    const allLedger = await svc.entities.NotificationLedger.filter({ user_email: rec.email });
    const recent = allLedger.filter((l) => l.notification_id).sort((a, b) => String(b.send_at || '').localeCompare(String(a.send_at || ''))).slice(0, 8);
    const compare = [];
    for (const l of recent) {
      try {
        const r = await fetch('https://onesignal.com/api/v1/notifications/' + encodeURIComponent(l.notification_id) + '?app_id=' + encodeURIComponent(appId), { headers: { Authorization: 'Basic ' + key } });
        const j = await r.json();
        compare.push({ source: l.source, sendAt: l.send_at, successful: j?.successful ?? null, received: j?.received ?? null, converted: j?.converted ?? null, failed: j?.failed ?? null });
      } catch (e) { compare.push({ source: l.source, err: true }); }
    }
    const enabledSubs = (osUser?.pushSubs || []).filter((s) => s.enabled === true);

    const fmt = (iso) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : null);

    return Response.json({
      ok: true,
      isEditorAccount: target === me.email,
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
      lastLedgerHasNotificationId: !!lastEntry?.notification_id,
      osNotif,
      osUserLastActive: osUser?.lastActive ?? null,
      pushSubsTotal: (osUser?.pushSubs || []).length,
      enabledSubs,
      compare,
      commuteLedgerEntries: ledger.length,
      commuteLedgerRecent: ledger.slice(-5).map((l) => ({ sendAtLocal: fmt(l.send_at), title: l.title })),
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
