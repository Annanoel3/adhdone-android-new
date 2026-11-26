// OWNER TOOL: what every account's first days actually looked like, from the
// record. Anna, Nov 15 2026: "We cant afford to keep pretending this one day
// retention thing is figured out... every time you have claimed that its
// something, its been an uneducated, un research-backed guess." So this reads
// what happened instead of guessing: AppEvent (opens, how far the welcome chat
// got, tasks made and finished, errors, choices on alarms), the pushes that
// went out (NotificationLedger for the last 3 days, AppEvent reminder_sent /
// reminder_unreached before that) and the User record.
//
// Read-only: it changes nothing and sends nothing. Owner (admin) only: run it
// from the editor's Test Function.
//   {}                          -> totals, cross-tabs and one line per account
//   { "since": "2026-10-15" }   -> only accounts first seen on or after that day
//   { "email": "..." }          -> that account's first-week timeline, event by event
//   { "trends": true }          -> week by week (Mondays, Central): people around, people
//                                  in the app, new accounts, uninstalls, tasks made and
//                                  finished, pushes sent and how alarms were answered;
//                                  how many of one week's people were back the next; and
//                                  one line per person seen in the last 28 days (Anna,
//                                  Nov 25 2026: "usage is actually look pretty bad. like
//                                  it's in decline... there are things that are not
//                                  working for people and we don't pay enough attention").
//   { "ai": true }              -> what the app's AI calls added up to, day by day and
//                                  feature by feature (AppEvent ai_usage, kept since
//                                  Nov 6 2026), and every burst of calls close together:
//                                  a parser self-test or a calendar import shows as one.
//                                  Anna, Nov 15 2026: "Are all of your tests while fixing
//                                  things causing my usage to sky rocket?"
//
// What it CAN'T see, so nobody reads more into it than is there: anyone who
// installed and never signed in (Google Play has those numbers, this app has
// nothing on them); anything before Sep 18 2026 (AppEvent starts there); the
// pushes sent before Nov 1 2026 (not kept); and WHY anyone left. It shows what
// they did and what the app did to them, in order.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { platformRequest } from '../../shared/sdkRetry.ts';
import { listAll, filterAll } from '../../shared/listAll.ts';

const NOT_REAL = new Set([
  'annanoelwenballew@gmail.com', 'annanoelbusinessemail@gmail.com', 's2kap2chick@gmail.com',
  'mediocreatbestdev@outlook.com', 'annanoelwenballew@outlook.com', 'antonio.baird1996@gmail.com',
  'aleck.baird@gmail.com', 'adhdone.space@gmail.com', 'adhdone.space+test@gmail.com',
  'p2rrt2ycwd@privaterelay.appleid.com',
  // Google's AdMob reviewers (signed up Nov 25 2026, through the welcome in 4
  // seconds, gone 2 hours later) and a test account with no sign-up.
  'admob.blr@gmail.com', 'adhdtestuser99@gmail.com',
]);
// Counted in the totals, never listed by name (Anna, Nov 1 2026).
const NEVER_NAMED = new Set(['wickeddevildriver666@gmail.com']);

const H = 60 * 60 * 1000;
const D = 24 * H;
// AppEvent's first row is Sep 18 2026: an account older than this has no
// first day on record.
const EVENTS_START_MS = Date.parse('2026-09-19T00:00:00Z');

// Base44 timestamps can come back without a zone marker; they are UTC.
function utcMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}
const iso = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16) + 'Z' : null);
// Which calendar day a moment falls on where the person lives, as a day count.
function localDay(ms: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    return Math.floor(Date.parse(`${parts}T00:00:00Z`) / D);
  } catch {
    return Math.floor((ms - 6 * H) / D);
  }
}
const r1 = (n: number) => Math.round(n * 10) / 10;

// Rows the server writes about a push, not something the person did.
const PUSH_EVENTS = new Set(['reminder_sent', 'reminder_unreached', 'reminder_cancelled']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(platformRequest(req));
    let me: any = null;
    try { me = await base44.auth.me(); } catch { me = null; }
    if (me?.role !== 'admin') return Response.json({ success: false, error: 'Owner only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities;
    const nowMs = Date.now();
    const sinceMs = body?.since ? Date.parse(`${String(body.since).slice(0, 10)}T00:00:00Z`) : 0;
    const oneEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (body?.ai === true) {
      const rows = (await filterAll(svc.AppEvent, { event: 'ai_usage' }))
        .map((ev: any) => ({ ts: utcMs(ev.created_date), p: ev?.props || {} }))
        .filter((x: any) => Number.isFinite(x.ts))
        .sort((a: any, b: any) => a.ts - b.ts);
      const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
      const clock = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
      const add = (t: any, p: any) => { t.calls++; t.input += Number(p.input) || 0; t.cached += Number(p.cached) || 0; t.write += Number(p.write) || 0; t.output += Number(p.output) || 0; };
      const blank = () => ({ calls: 0, input: 0, cached: 0, write: 0, output: 0 });
      const byDay: Record<string, Record<string, any>> = {};
      const models: Record<string, any> = {};
      for (const x of rows) {
        const d = dayOf(x.ts);
        const key = `${x.p.fn || '?'}|${x.p.model || '?'}|${x.p.project || '?'}`;
        byDay[d] ||= {};
        add((byDay[d][key] ||= blank()), x.p);
        add((models[String(x.p.model || '?')] ||= blank()), x.p);
      }
      // Calls of one feature close together (30 seconds or less apart, 12 or more).
      const bursts: any[] = [];
      const byFn: Record<string, any[]> = {};
      for (const x of rows) (byFn[String(x.p.fn || '?')] ||= []).push(x);
      for (const [fn, list] of Object.entries(byFn)) {
        let run: any[] = [];
        const close = () => {
          if (run.length >= 12) {
            const t = blank();
            for (const x of run) add(t, x.p);
            bursts.push({ fn, from: clock(run[0].ts), to: clock(run[run.length - 1].ts), day: dayOf(run[0].ts), ...t });
          }
          run = [];
        };
        for (const x of list) {
          if (run.length && x.ts - run[run.length - 1].ts > 30 * 1000) close();
          run.push(x);
        }
        close();
      }
      // The parser outside those bursts (people adding tasks, imports, single
      // checks): how many calls came within 30 minutes of the one before. That
      // is how often a cached rule book would be read at the low price instead
      // of written at the higher one.
      const parserAll = (byFn['runTaskParse'] || []);
      const inBurst = new Set<any>();
      {
        let run: any[] = [];
        const close = () => { if (run.length >= 12) for (const x of run) inBurst.add(x); run = []; };
        for (const x of parserAll) { if (run.length && x.ts - run[run.length - 1].ts > 30 * 1000) close(); run.push(x); }
        close();
      }
      const real = parserAll.filter((x) => !inBurst.has(x));
      const WINDOW = 30 * 60 * 1000;
      let warmSliding = 0;
      let warmFixed = 0;
      let windowStart = -Infinity;
      for (let i = 0; i < real.length; i++) {
        if (i > 0 && real[i].ts - real[i - 1].ts <= WINDOW) warmSliding++;
        if (real[i].ts - windowStart <= WINDOW) warmFixed++;
        else windowStart = real[i].ts;
      }
      const parserRealUse = {
        calls: real.length,
        within_30_min_of_the_call_before: warmSliding,
        inside_a_30_min_window_from_its_first_call: warmFixed,
        avg_input_tokens: real.length ? Math.round(real.reduce((n, x) => n + (Number(x.p.input) || 0), 0) / real.length) : 0,
      };
      // What test runs booked against the daily cap (shared/testBudget.ts,
      // Nov 20 2026), day by day, at list price: tool, runs, model calls, cents.
      const testRuns: Record<string, any> = {};
      try {
        const booked = await filterAll(svc.AppEvent, { event: 'ai_test_run' });
        for (const ev of booked) {
          const ms = utcMs(ev.created_date);
          if (!Number.isFinite(ms)) continue;
          const d = dayOf(ms);
          const p = ev?.props || {};
          const day = (testRuns[d] ||= { runs: 0, calls: 0, cents: 0, tools: {} as Record<string, number> });
          day.runs++;
          day.calls += Number(p.calls) || 0;
          day.cents = Math.round((day.cents + (Number(p.cents) || 0)) * 10) / 10;
          day.tools[String(p.tool || '?')] = (day.tools[String(p.tool || '?')] || 0) + (Number(p.calls) || 0);
        }
      } catch (_) { /* the usage numbers above still stand */ }
      return Response.json({ success: true, as_of: iso(nowMs), rows: rows.length, first: rows.length ? iso(rows[0].ts) : null, models, parserRealUse, byDay, bursts, testRuns });
    }

    const [users, events, ledger] = await Promise.all([
      listAll(svc.User),
      listAll(svc.AppEvent),
      listAll(svc.NotificationLedger),
    ]);

    const userBy: Record<string, any> = {};
    for (const u of users) if (u?.email) userBy[String(u.email).trim().toLowerCase()] = u;

    // Everything on record per person: what they did (acts) and what was sent (pushes).
    const acts: Record<string, any[]> = {};
    const pushes: Record<string, any[]> = {};
    const pushSeen = new Set<string>();
    for (const ev of events) {
      const e = String(ev?.user_email || '').trim().toLowerCase();
      if (!e || NOT_REAL.has(e)) continue;
      const p = ev?.props && typeof ev.props === 'object' ? ev.props : {};
      const name = String(ev?.event || '');
      if (PUSH_EVENTS.has(name)) {
        if (name === 'reminder_cancelled') continue;
        const ts = utcMs(p.send_at) || utcMs(ev.created_date);
        if (!Number.isFinite(ts)) continue;
        if (p.id) pushSeen.add(String(p.id));
        (pushes[e] ||= []).push({ ts, kind: String(p.kind || '?'), out: name === 'reminder_unreached' ? 'nobody' : String(p.outcome || 'not_checked') });
        continue;
      }
      const ts = name === 'alarm_choice' && Number.isFinite(utcMs(p.at)) ? utcMs(p.at) : utcMs(ev.created_date);
      if (!Number.isFinite(ts)) continue;
      const sid = String(ev?.session_id || '');
      const inApp = !!sid && sid !== 'unknown';
      // Present = they were in the app, or they answered something on the phone.
      const present = inApp
        || (name === 'alarm_choice' && String(p.choice || '') !== 'ignored')
        || name === 'task_completed';
      (acts[e] ||= []).push({ ts, name, sid: inApp ? sid : '', sec: Number(ev?.seconds) || 0, page: String(ev?.page || ''), p, present, inApp });
    }
    for (const row of ledger) {
      const e = String(row?.user_email || '').trim().toLowerCase();
      if (!e || NOT_REAL.has(e) || String(row?.kind || '').startsWith('owner_')) continue;
      const ts = utcMs(row.send_at);
      if (!Number.isFinite(ts) || ts > nowMs) continue; // still ahead: not sent yet
      if (row.notification_id && pushSeen.has(String(row.notification_id))) continue;
      (pushes[e] ||= []).push({ ts, kind: String(row.kind || '?'), out: 'in_ledger' });
    }

    const emails = new Set<string>([...Object.keys(acts), ...Object.keys(userBy).filter((e) => !NOT_REAL.has(e))]);

    // TRENDS: week by week, and everyone seen in the last 28 days.
    if (body?.trends === true) {
      const TZ = 'America/Chicago';
      // The Monday (Central) that starts the week a moment falls in.
      const weekOf = (ms: number) => {
        const day = localDay(ms, TZ);
        return new Date((day - ((day + 3) % 7)) * D).toISOString().slice(0, 10);
      };
      const thisWeek = weekOf(nowMs);
      type Wk = { around: Set<string>; inApp: Set<string>; newAcc: number; gone: number; made: number; done: number; pushes: number; reachedNobody: number; alarms: Record<string, number>; errors: number };
      const weeks: Record<string, Wk> = {};
      const wk = (k: string): Wk => (weeks[k] ||= { around: new Set(), inApp: new Set(), newAcc: 0, gone: 0, made: 0, done: 0, pushes: 0, reachedNobody: 0, alarms: {}, errors: 0 });
      const choiceKey = (p: any) => {
        const c = String(p?.choice || '?');
        return c === 'closed' ? `closed_${String(p?.how || '?')}` : c;
      };
      for (const [e, list] of Object.entries(acts)) {
        for (const a of list) {
          if (a.ts < EVENTS_START_MS || a.ts > nowMs + H) continue;
          const w = wk(weekOf(a.ts));
          if (a.present) w.around.add(e);
          if (a.inApp) w.inApp.add(e);
          if (a.name === 'task_created') w.made++;
          if (a.name === 'task_completed') w.done++;
          if (a.name === 'app_error') w.errors++;
          if (a.name === 'alarm_choice') { const k = choiceKey(a.p); w.alarms[k] = (w.alarms[k] || 0) + 1; }
        }
      }
      for (const list of Object.values(pushes)) {
        for (const x of list) {
          if (x.ts < EVENTS_START_MS || x.ts > nowMs) continue;
          const w = wk(weekOf(x.ts));
          w.pushes++;
          if (x.out === 'nobody') w.reachedNobody++;
        }
      }
      for (const e of emails) {
        const u = userBy[e];
        const present = (acts[e] || []).filter((a) => a.present).map((a) => a.ts);
        const createdMs = utcMs(u?.created_date);
        const firstMs = Math.min(present.length ? Math.min(...present) : Infinity, Number.isFinite(createdMs) ? createdMs : Infinity);
        if (Number.isFinite(firstMs) && firstMs >= EVENTS_START_MS) wk(weekOf(firstMs)).newAcc++;
        const goneMs = utcMs(u?.push_unreachable_at);
        const lastActiveMs = utcMs(u?.last_active_at);
        const isGone = u?.suspected_uninstall === true || (Number.isFinite(goneMs) && (!Number.isFinite(lastActiveMs) || goneMs > lastActiveMs));
        if (isGone && Number.isFinite(goneMs) && goneMs >= EVENTS_START_MS) wk(weekOf(goneMs)).gone++;
      }
      const keys = Object.keys(weeks).sort();
      const table = keys.map((k, i) => {
        const w = weeks[k];
        const next = keys[i + 1] ? weeks[keys[i + 1]] : null;
        return {
          week_of: k,
          partial: k === thisWeek,
          new_accounts: w.newAcc,
          people_around: w.around.size,
          people_in_app: w.inApp.size,
          back_next_week: next && keys[i + 1] !== undefined ? [...w.around].filter((e) => next.around.has(e)).length : null,
          uninstalls: w.gone,
          tasks_made: w.made,
          tasks_done: w.done,
          pushes: w.pushes,
          pushes_reached_nobody: w.reachedNobody,
          alarm_answers: w.alarms,
          app_errors: w.errors,
        };
      });

      // Everyone seen (around) in the last 28 days, one line each.
      const people: any[] = [];
      const cut28 = nowMs - 28 * D;
      const cut14 = nowMs - 14 * D;
      const cut7 = nowMs - 7 * D;
      for (const e of emails) {
        const u = userBy[e];
        const mine = (acts[e] || []).filter((a) => a.ts <= nowMs + H);
        const present = mine.filter((a) => a.present).map((a) => a.ts);
        const lastActiveMs = utcMs(u?.last_active_at);
        if (Number.isFinite(lastActiveMs)) present.push(lastActiveMs);
        const lastMs = present.length ? Math.max(...present) : NaN;
        if (!(lastMs >= cut28)) continue;
        const createdMs = utcMs(u?.created_date);
        const firstMs = Math.min(present.length ? Math.min(...present) : Infinity, Number.isFinite(createdMs) ? createdMs : Infinity);
        const tz = String(u?.timezone || TZ);
        const daysIn = (from: number, to: number) => new Set(present.filter((ts) => ts >= from && ts < to).map((ts) => localDay(ts, tz))).size;
        const openDays = (from: number, to: number) => new Set(mine.filter((a) => a.inApp && a.ts >= from && a.ts < to).map((a) => localDay(a.ts, tz))).size;
        const sent = (pushes[e] || []).filter((x) => x.ts <= nowMs);
        const sent7 = sent.filter((x) => x.ts >= cut7);
        const kinds7: Record<string, number> = {};
        for (const x of sent7) kinds7[x.kind] = (kinds7[x.kind] || 0) + 1;
        const answers14: Record<string, number> = {};
        for (const a of mine) if (a.name === 'alarm_choice' && a.ts >= cut14) { const k = choiceKey(a.p); answers14[k] = (answers14[k] || 0) + 1; }
        const goneMs = utcMs(u?.push_unreachable_at);
        const isGone = u?.suspected_uninstall === true || (Number.isFinite(goneMs) && (!Number.isFinite(lastActiveMs) || goneMs > lastActiveMs));
        people.push({
          e: NEVER_NAMED.has(e) ? '(not named)' : e,
          joined: iso(firstMs),
          last_seen: iso(lastMs),
          last_opened: iso(lastActiveMs),
          days_around_last_7: daysIn(cut7, nowMs + H),
          days_around_prior_7: daysIn(cut14, cut7),
          days_around_15_to_28_ago: daysIn(cut28, cut14),
          days_opened_last_7: openDays(cut7, nowMs + H),
          days_opened_prior_7: openDays(cut14, cut7),
          made_last_14: mine.filter((a) => a.name === 'task_created' && a.ts >= cut14).length,
          done_last_14: mine.filter((a) => a.name === 'task_completed' && a.ts >= cut14).length,
          pushes_last_7: sent7.length,
          pushes_last_7_by_kind: kinds7,
          pushes_since_last_seen: sent.filter((x) => x.ts > lastMs).length,
          alarm_answers_last_14: answers14,
          errors_last_14: mine.filter((a) => a.name === 'app_error' && a.ts >= cut14).length,
          mode: u?.alarm_mode || null,
          notifications_allowed: u?.alarm_permissions?.notifications ?? null,
          build: u?.app_build || null,
          plat: u?.app_platform || null,
          gone: isGone,
          paused: u?.smart_nudge_paused_reason || null,
          helping: u?.smart_nudge_help_answer || null,
        });
      }
      people.sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)));

      // What the app records, by name, over the last 30 days (so nothing is
      // read into an event that isn't kept).
      const names: Record<string, number> = {};
      for (const ev of events) {
        const ms = utcMs(ev?.created_date);
        if (Number.isFinite(ms) && ms >= nowMs - 30 * D) names[String(ev?.event || '?')] = (names[String(ev?.event || '?')] || 0) + 1;
      }
      return Response.json({ success: true, as_of: iso(nowMs), weeks: table, people, event_names_last_30_days: names });
    }

    // One account's first week, event by event.
    if (oneEmail) {
      const list = [
        ...(acts[oneEmail] || []).map((a) => ({ ts: a.ts, what: a.name, page: a.page, sec: a.sec || undefined, sid: a.sid ? a.sid.slice(-4) : undefined, props: a.p })),
        ...(pushes[oneEmail] || []).map((x) => ({ ts: x.ts, what: `PUSH ${x.kind}`, out: x.out })),
      ].sort((a, b) => a.ts - b.ts);
      const first = list.length ? list[0].ts : utcMs(userBy[oneEmail]?.created_date);
      const u = userBy[oneEmail];
      return Response.json({
        success: true, email: oneEmail, first: iso(first),
        account: u ? { created: iso(utcMs(u.created_date)), last_active: iso(utcMs(u.last_active_at)), platform: u.app_platform || null, build: u.app_build || null, alarm_mode: u.alarm_mode || null, notifications_allowed: u.alarm_permissions?.notifications ?? null, push_unreachable_at: iso(utcMs(u.push_unreachable_at)), suspected_uninstall: u.suspected_uninstall === true } : 'no account on record (deleted)',
        timeline: list.filter((x) => x.ts - first < 7 * D).slice(0, 400).map((x) => ({ ...x, ts: iso(x.ts), h: r1((x.ts - first) / H) })),
      });
    }

    const rows: any[] = [];
    for (const e of emails) {
      const u = userBy[e];
      const mine = (acts[e] || []).sort((a, b) => a.ts - b.ts);
      const sent = (pushes[e] || []).sort((a, b) => a.ts - b.ts);
      const presentAt = mine.filter((a) => a.present).map((a) => a.ts);
      const createdMs = utcMs(u?.created_date);
      const lastActiveMs = utcMs(u?.last_active_at);
      const firstMs = Math.min(
        presentAt.length ? presentAt[0] : Infinity,
        Number.isFinite(createdMs) ? createdMs : Infinity,
      );
      if (!Number.isFinite(firstMs)) continue;
      if (sinceMs && firstMs < sinceMs) continue;
      // The account row is newer than their first event: it was made again later.
      const remade = Number.isFinite(createdMs) && presentAt.length > 0 && createdMs - presentAt[0] > D;
      if (Number.isFinite(lastActiveMs)) presentAt.push(lastActiveMs);
      presentAt.sort((a, b) => a - b);
      const lastMs = presentAt.length ? presentAt[presentAt.length - 1] : firstMs;

      // Visits: the app's own session ids, in order.
      const sessions: any[] = [];
      const bySid: Record<string, any> = {};
      for (const a of mine) {
        if (!a.inApp) continue;
        let s = bySid[a.sid];
        if (!s) { s = bySid[a.sid] = { start: a.ts, end: a.ts, sec: 0, beats: [], pages: [], made: 0, err: 0 }; sessions.push(s); }
        s.end = Math.max(s.end, a.ts);
        if (a.name === 'session_end') s.sec = Math.max(s.sec, a.sec);
        if (a.name === 'welcome_chat' && a.p?.beat && s.beats[s.beats.length - 1] !== a.p.beat) s.beats.push(String(a.p.beat));
        // The welcome asks the same questions as cards since Nov 15 2026
        // (WelcomeChat.jsx; those events carry ui: 'cards', the chat's carry none).
        if (a.name === 'welcome_chat' && a.p?.ui) s.ui = String(a.p.ui);
        if (a.name === 'page_view' && a.page && s.pages[s.pages.length - 1] !== a.page) s.pages.push(a.page);
        if (a.name === 'task_created') s.made++;
        if (a.name === 'app_error') s.err++;
      }
      for (const s of sessions) if (!s.sec) s.sec = Math.round((s.end - s.start) / 1000);
      const s1 = sessions[0] || null;
      const day0 = (ts: number) => ts - firstMs < D;
      const d0Sessions = sessions.filter((s) => day0(s.start));
      const count = (name: string, pred: (a: any) => boolean) => mine.filter((a) => a.name === name && pred(a)).length;
      const s1End = s1 ? s1.end : firstMs;
      const backSameDay = presentAt.some((ts) => ts - s1End >= 30 * 60 * 1000 && day0(ts));
      const days = [...new Set(presentAt.map((ts) => Math.floor((ts - firstMs) / D)))].sort((a, b) => a - b);
      // The way the industry counts "day 1": seen on the calendar day after
      // the day they joined, by their own clock.
      const tz = String(u?.timezone || 'America/Chicago');
      const day0Local = localDay(firstMs, tz);
      const localDays = [...new Set(presentAt.map((ts) => localDay(ts, tz) - day0Local))].sort((a, b) => a - b);
      const d0Push = sent.filter((x) => day0(x.ts));
      const kinds: Record<string, number> = {};
      for (const x of d0Push) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
      const goneMs = utcMs(u?.push_unreachable_at);
      const isGone = u?.suspected_uninstall === true || (Number.isFinite(goneMs) && (!Number.isFinite(lastActiveMs) || goneMs > lastActiveMs));
      const firstNobody = sent.find((x) => x.out === 'nobody');
      rows.push({
        e: NEVER_NAMED.has(e) ? '(not named)' : e,
        first: iso(firstMs),
        age_d: r1((nowMs - firstMs) / D),
        covered: firstMs >= EVENTS_START_MS,
        acct: u ? (remade ? 'remade' : 'yes') : 'deleted',
        plat: u?.app_platform || null,
        build: u?.app_build || null,
        mode: u?.alarm_mode || null,
        perm: u?.alarm_permissions?.notifications ?? null,
        s1_sec: s1 ? s1.sec : null,
        s1_beats: s1 ? s1.beats.join('>') : '',
        // 'cards' or 'chat': which welcome their first visit showed ('' = none on record).
        s1_welcome: s1 && s1.beats.length ? (s1.ui === 'cards' ? 'cards' : 'chat') : '',
        s1_made: s1 ? s1.made : 0,
        s1_pages: s1 ? s1.pages.slice(0, 8).join('>') : '',
        d0_visits: d0Sessions.length,
        d0_sec: d0Sessions.reduce((n, s) => n + s.sec, 0),
        d0_made: count('task_created', (a) => day0(a.ts)),
        d0_done: count('task_completed', (a) => day0(a.ts)),
        d0_err: count('app_error', (a) => day0(a.ts)),
        d0_alarm: count('alarm_choice', (a) => day0(a.ts)),
        back_same_day: backSameDay,
        days: days.slice(0, 14),
        n_days: days.length,
        next_day: localDays.includes(1),
        cal_days: localDays.slice(0, 14),
        last_h: r1((lastMs - firstMs) / H),
        all_made: count('task_created', () => true),
        all_done: count('task_completed', () => true),
        push_d0: d0Push.length,
        push_d0_kinds: kinds,
        push_d0_nobody: d0Push.filter((x) => x.out === 'nobody').length,
        push_after_last: sent.filter((x) => x.ts > lastMs).length,
        first_nobody_h: firstNobody ? r1((firstNobody.ts - firstMs) / H) : null,
        gone: isGone,
        gone_h: isGone && Number.isFinite(goneMs) ? r1((goneMs - firstMs) / H) : null,
        _first: firstMs, _last: lastMs, _days: days,
      });
    }
    rows.sort((a, b) => b._first - a._first);

    // Totals. "Came back" is judged only for accounts old enough to have had the chance.
    const covered = rows.filter((r) => r.covered);
    const old = (r: any, d: number) => nowMs - r._first >= d * D;
    const inWindow = (r: any, from: number, to: number) => r._days.some((d: number) => d >= from && d < to);
    const rate = (list: any[], pred: (r: any) => boolean) => ({ n: list.length, yes: list.filter(pred).length });
    const m2 = covered.filter((r) => old(r, 2));
    const m8 = covered.filter((r) => old(r, 8));
    const m15 = covered.filter((r) => old(r, 15));
    const backAfterDay0 = (r: any) => r._days.some((d: number) => d >= 1);
    const totals = {
      accounts_on_record: rows.length,
      first_day_on_record: covered.length,
      came_back_same_day_30min_later: rate(covered.filter((r) => old(r, 1)), (r) => r.back_same_day),
      seen_the_next_calendar_day: rate(m2, (r) => r.next_day),
      seen_in_hours_24_to_48: rate(m2, (r) => inWindow(r, 1, 2)),
      seen_any_time_after_first_24h: rate(m2, backAfterDay0),
      seen_day_2_to_7: rate(m8, (r) => inWindow(r, 2, 8)),
      seen_after_day_7: rate(m15, (r) => r._days.some((d: number) => d >= 7)),
      one_visit_only_ever: rate(m2, (r) => r.n_days <= 1 && !r.back_same_day),
      marked_uninstalled: rate(covered, (r) => r.gone),
      account_deleted: rate(covered, (r) => r.acct === 'deleted'),
    };
    // Of the accounts 2+ days old: how many came back after their first 24
    // hours, split by one thing at a time. A split is a count, not a cause.
    const split = (label: string, pred: (r: any) => boolean | null) => {
      const yes = m2.filter((r) => pred(r) === true);
      const no = m2.filter((r) => pred(r) === false);
      return { split: label, yes: { n: yes.length, came_back: yes.filter(backAfterDay0).length }, no: { n: no.length, came_back: no.filter(backAfterDay0).length } };
    };
    const splits = [
      split('made a task in the first visit', (r) => r.s1_made > 0),
      split('welcome chat reached its last step in the first visit', (r) => r.s1_beats.split('>').includes('done')),
      // Cards against the chat: did the welcome get finished, and did they come back?
      split('first visit showed the welcome as cards (yes) or as the chat (no)', (r) => (r.s1_welcome ? r.s1_welcome === 'cards' : null)),
      split('cards only: welcome reached its last step in the first visit', (r) => (r.s1_welcome === 'cards' ? r.s1_beats.split('>').includes('done') : null)),
      split('first visit lasted 2 minutes or more', (r) => (r.s1_sec === null ? null : r.s1_sec >= 120)),
      split('came back the same day, 30+ minutes later', (r) => r.back_same_day),
      split('finished a task in the first 24h', (r) => r.d0_done > 0),
      split('notifications allowed (as last checked)', (r) => (r.perm === null ? null : r.perm === true)),
      split('alarm style (not plain notifications)', (r) => (r.mode ? r.mode === 'alarm' : null)),
      split('an app error in the first 24h', (r) => r.d0_err > 0),
      split('got 3 or more pushes in the first 24h (accounts since Nov 1 only)', (r) => (r._first < Date.parse('2026-10-29T00:00:00Z') ? null : r.push_d0 >= 3)),
    ];
    // The same counts by when they joined. Small numbers: read them as counts.
    const cohorts = [
      ['Sep 19 - Oct 15', '2026-09-19', '2026-10-16'],
      ['Oct 16 - Oct 31', '2026-10-16', '2026-11-01'],
      ['Nov 1 - Nov 8', '2026-11-01', '2026-11-09'],
      ['Nov 9 on', '2026-11-09', '2027-01-01'],
    ].map(([label, from, to]) => {
      const list = covered.filter((r) => r._first >= Date.parse(`${from}T00:00:00Z`) && r._first < Date.parse(`${to}T00:00:00Z`));
      const two = list.filter((r) => old(r, 2));
      const eight = list.filter((r) => old(r, 8));
      return {
        joined: label, accounts: list.length,
        next_calendar_day: rate(two, (r) => r.next_day),
        any_time_after_first_24h: rate(two, backAfterDay0),
        back_within_days_1_to_7: rate(eight, (r) => inWindow(r, 1, 8)),
        made_no_task_first_24h: rate(list, (r) => r.d0_made === 0),
        notifications_not_allowed: rate(list, (r) => r.perm === false),
        marked_uninstalled: rate(list, (r) => r.gone),
      };
    });
    const s1Bucket = (sec: number | null) => (sec === null ? 'no visit on record' : sec < 30 ? 'under 30s' : sec < 120 ? '30s-2min' : sec < 600 ? '2-10min' : '10min+');
    const firstVisit: Record<string, { n: number; came_back: number }> = {};
    for (const r of m2) {
      const k = s1Bucket(r.s1_sec);
      firstVisit[k] ||= { n: 0, came_back: 0 };
      firstVisit[k].n++;
      if (backAfterDay0(r)) firstVisit[k].came_back++;
    }
    const lastBeat: Record<string, { n: number; came_back: number }> = {};
    for (const r of m2) {
      const beats = r.s1_beats ? r.s1_beats.split('>') : [];
      const k = beats.length ? beats[beats.length - 1] : 'no welcome chat step on record';
      lastBeat[k] ||= { n: 0, came_back: 0 };
      lastBeat[k].n++;
      if (backAfterDay0(r)) lastBeat[k].came_back++;
    }

    return Response.json({
      success: true,
      as_of: iso(nowMs),
      events_read: events.length,
      totals,
      cohorts,
      first_visit_length_vs_came_back: firstVisit,
      welcome_chat_last_step_in_first_visit_vs_came_back: lastBeat,
      splits,
      rows: rows.map(({ _first, _last, _days, ...r }) => r),
    });
  } catch (e) {
    console.error('[ownerFirstDays] failed:', e);
    return Response.json({ success: false, error: String((e as any)?.message || e) }, { status: 500 });
  }
});
