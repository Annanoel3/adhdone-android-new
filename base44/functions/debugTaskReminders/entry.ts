import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { listAll, filterAll } from '../../shared/listAll.ts';

// Admin-only audit of how the app is doing for real people: one JSON report
// (nothing is written). Per person: how often they come back, what they made,
// what reached them, what their phone allows. Overall: retention, errors,
// what went wrong and where. Run from the Test Function panel with {} (or
// { days: 45 }). Replaced the old debug-reminders probe, which nothing called.

const DAY = 24 * 60 * 60 * 1000;
const ms = (v: any) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : NaN; };
const day = (v: any) => (Number.isFinite(ms(v)) ? new Date(ms(v)).toISOString().slice(0, 10) : '');
const inc = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] || 0) + n; };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* {} */ }
    const days = Math.min(120, Math.max(7, Number(body?.days) || 45));
    const since = new Date(Date.now() - days * DAY).toISOString();
    const now = Date.now();

    const svc = base44.asServiceRole.entities;
    const [users, tasks, events, ledger, feedback] = await Promise.all([
      listAll(svc.User),
      listAll(svc.Task),
      filterAll(svc.AppEvent, { created_date: { $gte: since } }),
      filterAll(svc.NotificationLedger, { send_at: { $gte: since } }),
      listAll(svc.UserFeedback),
    ]);

    const byEmail: Record<string, any> = {};
    for (const u of users) {
      byEmail[u.email] = {
        email: u.email, name: u.preferred_name || u.full_name || '', role: u.role || '',
        signed_up: day(u.signed_up_at || u.created_date), last_active: day(u.last_active_at),
        days_since_signup: Math.floor((now - ms(u.signed_up_at || u.created_date)) / DAY),
        days_since_active: Number.isFinite(ms(u.last_active_at)) ? Math.floor((now - ms(u.last_active_at)) / DAY) : null,
        tz: u.timezone || '', alarm_mode: u.alarm_mode || '',
        notifications: u.alarm_permissions?.notifications ?? null,
        perms_missing: u.alarm_permissions_missing || '',
        perms_checked: day(u.alarm_permissions?.checked_at),
        onboarding: Array.isArray(u.onboarding_flags) ? u.onboarding_flags.length : 0,
        calendar: (Array.isArray(u.device_calendar_ids) && u.device_calendar_ids.length > 0) || !!u.google_connected_at,
        quiet: `${u.quiet_hours_enabled === false ? 'off' : (u.quiet_hours_start || '22:00') + '-' + (u.quiet_hours_end || '08:00')}`,
        players: Array.isArray(u.onesignal_player_ids) ? u.onesignal_player_ids.length : 0,
        about: String(u.about_me || '').slice(0, 80),
        active_days: new Set<string>(), sessions: 0, page_views: 0, errors: 0, sync_failed: 0, ads: 0,
        update_prompt: 0, update_taps: 0, events_by_type: {} as Record<string, number>,
        tasks_total: 0, tasks_active: 0, tasks_done: 0, tasks_cancelled: 0, events_count: 0, birthdays: 0,
        captures: 0, calendar_tasks: 0, snoozes: 0, dismissed: 0, ignored: 0, laters: 0, no_recipient: 0,
        stale_once: 0, pushes: {} as Record<string, number>, first_push: '', last_push: '',
        nudge_planned_today: (u.smart_nudge_schedule_date || ''),
      };
    }

    for (const t of tasks) {
      const email = t.notification_recipient_email || t.created_by;
      const u = byEmail[email] || byEmail[t.created_by];
      if (!u) continue;
      if (t.parent_task_id) continue;
      u.tasks_total++;
      if (t.status === 'active') u.tasks_active++;
      if (t.status === 'completed') u.tasks_done++;
      if (t.status === 'cancelled') u.tasks_cancelled++;
      if (t.classification === 'event') u.events_count++;
      if (t.birthday_person || t.classification === 'birthday') u.birthdays++;
      if (t.capture_id) u.captures++;
      if (t.google_event_id) u.calendar_tasks++;
      u.snoozes += t.snooze_count || 0;
      u.dismissed += t.dismissed_count || 0;
      u.ignored += t.ignored_count || 0;
      u.laters += t.later_count || 0;
      if (t.status === 'active' && !t.notification_recipient_email) u.no_recipient++;
      if (t.status === 'active' && t.reminder_interval === 'once' && Number.isFinite(ms(t.next_reminder)) && ms(t.next_reminder) < now - DAY) u.stale_once++;
    }

    const errorGroups: Record<string, { count: number; users: Set<string>; last: string; sample: string }> = {};
    const eventTypes: Record<string, number> = {};
    for (const e of events) {
      inc(eventTypes, e.event || '?');
      const u = byEmail[e.user_email];
      if (!u) continue;
      inc(u.events_by_type, e.event || '?');
      u.active_days.add(day(e.created_date));
      if (e.event === 'session_start') u.sessions++;
      if (e.event === 'page_view') u.page_views++;
      if (e.event === 'ad_shown') u.ads++;
      if (e.event === 'device_calendar_sync_failed') u.sync_failed++;
      if (e.event === 'update_prompt') { if (e.props?.action === 'shown') u.update_prompt++; if (e.props?.action === 'update') u.update_taps++; }
      if (e.event === 'app_error') {
        u.errors++;
        const key = String(e.props?.message || 'unknown').replace(/\d+/g, '#').slice(0, 90);
        const g = errorGroups[key] || (errorGroups[key] = { count: 0, users: new Set(), last: '', sample: String(e.props?.message || '').slice(0, 200) });
        g.count++; g.users.add(e.user_email); if (day(e.created_date) > g.last) g.last = day(e.created_date);
      }
    }

    for (const l of ledger) {
      const u = byEmail[l.user_email];
      if (!u) continue;
      inc(u.pushes, l.kind || l.source || '?');
      const d = day(l.send_at);
      if (!u.first_push || d < u.first_push) u.first_push = d;
      if (!u.last_push || d > u.last_push) u.last_push = d;
    }

    const people = Object.values(byEmail)
      .map((u: any) => ({ ...u, active_days: u.active_days.size }))
      .sort((a: any, b: any) => (b.signed_up || '').localeCompare(a.signed_up || ''));

    // Retention: of people who signed up in the window, who came back on a
    // later day, and who was seen in the last 7 days.
    const cohort = people.filter((u: any) => u.role !== 'admin' && u.days_since_signup <= days);
    const retention = {
      signed_up_in_window: cohort.length,
      came_back_another_day: cohort.filter((u: any) => u.last_active && u.last_active > u.signed_up).length,
      three_or_more_days: cohort.filter((u: any) => u.active_days >= 3).length,
      seen_last_7_days: cohort.filter((u: any) => u.days_since_active !== null && u.days_since_active <= 7).length,
      notifications_off: cohort.filter((u: any) => u.notifications === false).length,
      never_made_a_task: cohort.filter((u: any) => u.tasks_total === 0).length,
      no_push_ever: cohort.filter((u: any) => !u.first_push).length,
    };

    const errors = Object.entries(errorGroups)
      .map(([k, g]) => ({ message: g.sample, count: g.count, users: g.users.size, last: g.last }))
      .sort((a, b) => b.count - a.count).slice(0, 40);

    return Response.json({
      ok: true, days, users: users.length, tasks: tasks.length, events: events.length, pushes: ledger.length,
      retention, eventTypes, errors,
      feedback: feedback.map((f: any) => ({ when: day(f.created_date), by: f.created_by, type: f.feedback_type, reason: f.reason, rating: f.rating, text: String(f.detailed_feedback || '').slice(0, 300) })),
      people,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
});
