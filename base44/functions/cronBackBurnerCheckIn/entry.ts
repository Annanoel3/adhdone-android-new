// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Weekly Back Burner check-in.
//
// Back-burnered tasks are deliberately silent — that's the point. But "silent
// forever" is how a thing quietly stops existing. Once a week the LLM looks at
// the user's Back Burner, picks the ONE task most worth reconsidering, and sends
// a single low-pressure push with a small suggestion for how to restart it.
//
// Runs daily but only acts when 7+ days have passed since that user's last
// check-in, so the send lands at a sane local hour instead of a fixed UTC one.
// It never changes a task — the user decides whether to bring it back.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { isInQuietHours, resolveQuietHours, userTimeZone, localMinutesOfDay } from '../../shared/quietHours.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { listAll } from '../../shared/listAll.ts';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Sent during the afternoon/early evening — a "want to pick this back up?"
// question needs a moment when the day isn't already underway. Their own
// afternoon: 6 to 12 hours after their quiet hours end (2 PM to 8 PM for the
// usual 8 AM). It was a fixed 2 PM to 8 PM, which is bedtime for someone who
// sleeps days, and never came at all for someone asleep through it (Oct 12 2026).
const SEND_FROM_MIN_AFTER_WAKE = 6 * 60;
const SEND_TO_MIN_AFTER_WAKE = 12 * 60;

// COME BACK (Anna, Oct 16 2026). Someone with nothing on their list gets
// nothing at all from ADHDone (no summary, no Smart Reminders, no check-in), so
// after 3 days without opening the app they get one push, another at 7, and a
// last one at 14. "Last one from us" never comes sooner than two weeks ("after
// 1 short week is annoying… impatient and desperate"). The day-3 lines take
// turns, a different one each time someone drifts away. Tapping one opens Add
// Task. The count starts over each time they open the app. Anyone with a task
// still open (Back Burner included) hears from the app another way and gets
// none of these. Same afternoon window and quiet hours as the check-in.
//
// Day 2 for someone new (Anna, Nov 2 2026: "It's important to bring them back
// day 2"): an account under a week old gets its very FIRST come-back the
// afternoon of the day after it was last opened (their own calendar day, and
// at least 12 hours away), not on day 3; later absences go back to day 3. Vega signed up Sun Nov 1, added nothing, and
// would have heard nothing until Wed Nov 4. The next two keep their days (7
// and 14) and spacing, so it's still three pushes in all.
const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_MS = 7 * DAY_MS;
const NEW_FIRST_AWAY_MS = 12 * 60 * 60 * 1000;
const localDayKey = (d: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
const COMEBACK_STEPS = [
  {
    day: 3,
    lines: [
      { title: 'Brain getting crowded?', body: 'Toss one thing in here and let ADHDone do the remembering.' },
      { title: 'Your list is empty', body: "Either you're crushing it or life got busy. Either way, ADHDone's here when you need it.", emptyOnly: true },
      { title: "Anything you're trying to remember?", body: 'Tell ADHDone and stop carrying it in your head.' },
    ],
  },
  { day: 7, lines: [{ title: 'No pressure, just a door left open', body: "Say it or type it when you're ready. We'll handle the reminders." }] },
  { day: 14, lines: [{ title: 'Last one from us, promise', body: "Whenever something pops into your head, ADHDone's ready to hold onto it." }] },
];

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'cronBackBurnerCheckIn' });
    const now = new Date();

    // { "previewComeback": true } from an admin (Test Function): who is due a
    // come-back push and whether now is in their window. Sends nothing, saves
    // nothing, skips the Back Burner check-ins.
    const body: any = await req.json().catch(() => ({}));
    const previewComeback = body?.previewComeback === true;
    if (previewComeback) {
      const me = await base44.auth.me().catch(() => null);
      if (me?.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const preview: any[] = [];

    const allUsers = await listAll(base44.asServiceRole.entities.User);
    const allTasks = await listAll(base44.asServiceRole.entities.Task);

    // Back Burner = silenced, still active, not a sub-task, not an event/birthday.
    const backBurnerByUser: Record<string, any[]> = {};
    for (const task of allTasks) {
      const email = task.notification_recipient_email;
      if (!email) continue;
      if (!task.silenced) continue;
      if (task.status !== 'active') continue;
      if (task.parent_task_id) continue;
      if (task.classification === 'event' || task.classification === 'birthday' || task.birthday_person) continue;
      if (!backBurnerByUser[email]) backBurnerByUser[email] = [];
      backBurnerByUser[email].push(task);
    }

    let sent = 0;
    const results: any[] = [];

    for (const user of allUsers) {
      if (previewComeback) break;
      const email = user?.email;
      if (!email) continue;

      const tasks = backBurnerByUser[email] || [];
      if (tasks.length === 0) continue;

      const last = user.last_backburner_checkin_at ? new Date(user.last_backburner_checkin_at).getTime() : 0;
      if (now.getTime() - last < WEEK_MS) continue;

      // The shared fallback when no timezone is saved (UTC put a US user's
      // "afternoon" send window in their morning).
      const timeZone = userTimeZone(user);
      // Quiet hours default to ON; only an explicit "off" in Settings skips them.
      // Their times still say when the person's day starts, either way.
      const quiet = resolveQuietHours(user);
      const sinceWake = (localMinutesOfDay(now, timeZone) - quiet.endMin + 24 * 60) % (24 * 60);
      if (sinceWake < SEND_FROM_MIN_AFTER_WAKE || sinceWake >= SEND_TO_MIN_AFTER_WAKE) continue;

      if (quiet.enabled && isInQuietHours(now, quiet.startMin, quiet.endMin, timeZone)) continue;

      // Don't repeat last week's pick unless it's the only thing back there.
      const pool = tasks.length > 1 && user.last_backburner_task_id
        ? tasks.filter((t) => t.id !== user.last_backburner_task_id)
        : tasks;

      const pick = await choosePick(openai, pool, tasks.length, user.about_me || '', now);
      if (!pick) continue;

      const gate = await ledgerCheck(base44, { email, taskId: pick.task.id, kind: 'smart_nudge' });
      if (!gate.allowed) continue;

      const notificationId = await sendPush(email, pick.title, pick.body, pick.task.id);
      if (!notificationId) continue;

      await ledgerRecord(base44, {
        email,
        taskId: pick.task.id,
        kind: 'smart_nudge',
        source: 'cronBackBurnerCheckIn',
        notificationId,
        title: pick.title,
      });

      try {
        await base44.asServiceRole.entities.User.update(user.id, {
          last_backburner_checkin_at: now.toISOString(),
          last_backburner_task_id: pick.task.id,
        });
      } catch (e) {
        console.error(`[BACK BURNER] Could not record check-in for ${email}:`, e);
      }

      sent++;
      results.push({ email, task: pick.task.title, title: pick.title });
      console.log(`[BACK BURNER] Sent to ${email}: "${pick.title}" about "${pick.task.title}"`);
    }

    // ── Come back (see COMEBACK_STEPS) ────────────────────────────────────
    let comebacks = 0;
    try {
      // Birthdays don't count as something open: they only speak up on the
      // day, so someone whose list is only birthdays heard nothing at all and
      // got no come-back push either (Tricia, Nov 1 2026: two birthdays saved
      // Oct 28-29, nothing from the app until Nov 7; Anna: "How do we pull
      // back tricia"). They get these, minus "Your list is empty".
      const isBirthday = (t: any) => t?.classification === 'birthday' || !!t?.birthday_person;
      const openFor = new Set<string>();
      const birthdaysOnly = new Set<string>();
      for (const t of allTasks) {
        if (t?.status !== 'active') continue;
        const who = [t.created_by, t.notification_recipient_email].filter(Boolean).map((x: any) => String(x).toLowerCase());
        if (isBirthday(t)) { for (const w of who) birthdaysOnly.add(w); continue; }
        for (const w of who) openFor.add(w);
      }
      const ms = (v: any) => { const n = Date.parse(String(v || '')); return Number.isFinite(n) ? n : NaN; };
      for (const user of allUsers) {
        const email = user?.email;
        if (!email || openFor.has(String(email).toLowerCase())) continue;
        if (user.alarm_permissions?.notifications === false) continue;
        const seenIso = user.last_active_at || user.signed_up_at || user.created_date;
        const seen = ms(seenIso);
        if (!Number.isFinite(seen)) continue;
        // OneSignal said nothing reaches this phone (cronSmartTaskNudge), and
        // they haven't been back since.
        const unreachable = ms(user.push_unreachable_at);
        if (Number.isFinite(unreachable) && unreachable > seen) continue;
        const sameAbsence = String(user.comeback_from || '') === String(seenIso);
        const step = sameAbsence ? Math.max(0, Number(user.comeback_step) || 0) : 0;
        const next = COMEBACK_STEPS[step];
        if (!next) continue;
        const away = now.getTime() - seen;
        const timeZone = userTimeZone(user);
        const created = ms(user.signed_up_at || user.created_date);
        // Only an account's very first come-back comes early (comeback_round
        // counts absences that got one), so someone new who opens the app
        // most days without adding anything isn't pinged every next afternoon.
        const isNew = Number.isFinite(created) && now.getTime() - created < NEW_ACCOUNT_MS
          && !(Number(user.comeback_round) > 0);
        // New account, first push of this absence: the next day of theirs.
        const due = step === 0 && isNew
          ? away >= NEW_FIRST_AWAY_MS && localDayKey(now, timeZone) > localDayKey(new Date(seen), timeZone)
          : away >= next.day * DAY_MS;
        if (previewComeback && (due || isNew)) {
          const q = resolveQuietHours(user);
          const sw = (localMinutesOfDay(now, timeZone) - q.endMin + 24 * 60) % (24 * 60);
          preview.push({
            email, step, newAccount: isNew, due,
            hoursAway: Math.round(away / 3600000),
            inWindowNow: sw >= SEND_FROM_MIN_AFTER_WAKE && sw < SEND_TO_MIN_AFTER_WAKE && !(q.enabled && isInQuietHours(now, q.startMin, q.endMin, timeZone)),
            timeZone,
          });
          continue;
        }
        if (!due) continue;
        // Steps keep their spacing even for someone who's been gone a while:
        // 4 days after the first, 7 after the second.
        if (step > 0) {
          const lastAt = ms(user.comeback_last_at);
          const gap = (next.day - COMEBACK_STEPS[step - 1].day) * DAY_MS;
          if (Number.isFinite(lastAt) && now.getTime() - lastAt < gap) continue;
        }
        const quiet = resolveQuietHours(user);
        const sinceWake = (localMinutesOfDay(now, timeZone) - quiet.endMin + 24 * 60) % (24 * 60);
        if (sinceWake < SEND_FROM_MIN_AFTER_WAKE || sinceWake >= SEND_TO_MIN_AFTER_WAKE) continue;
        if (quiet.enabled && isInQuietHours(now, quiet.startMin, quiet.endMin, timeZone)) continue;
        const gate = await ledgerCheck(base44, { email, kind: 'general' });
        if (!gate.allowed) continue;

        const round = Math.max(0, Number(user.comeback_round) || 0) + (step === 0 ? 1 : 0);
        const hasBirthdays = birthdaysOnly.has(String(email).toLowerCase());
        const usable = next.lines.filter((l: any) => !(hasBirthdays && l.emptyOnly));
        const line = usable[(round - 1 + usable.length) % usable.length];
        const outcome = await sendComeback(email, line.title, line.body);
        const fields: Record<string, any> = { comeback_from: seenIso, comeback_round: round, comeback_last_at: now.toISOString() };
        if (outcome === 'unsubscribed') {
          // Nothing reaches this phone: no more this time away.
          fields.comeback_step = COMEBACK_STEPS.length;
        } else if (outcome) {
          fields.comeback_step = step + 1;
          await ledgerRecord(base44, { email, kind: 'general', source: 'comeback', notificationId: outcome, title: line.title });
          comebacks++;
          console.log(`[COME BACK] ${email}: day ${next.day} "${line.title}" (${Math.round(away / DAY_MS)} days away)`);
        } else {
          continue; // not sent; tried again on a later run
        }
        await base44.asServiceRole.entities.User.update(user.id, fields)
          .catch((e: any) => console.error(`[COME BACK] Could not record for ${email}:`, e?.message || e));
      }
    } catch (e) {
      console.error('[COME BACK] pass failed:', e);
    }

    if (previewComeback) return Response.json({ preview, at: now.toISOString() });
    console.log(`[BACK BURNER] Done — ${sent} check-in(s), ${comebacks} come-back push(es) at ${now.toISOString()}`);
    return Response.json({ success: true, sent, comebacks, results, at: now.toISOString() });
  } catch (err) {
    console.error('[BACK BURNER] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

function localHourIn(d: Date, timeZone: string): number {
  try {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(d), 10);
  } catch {
    return d.getUTCHours();
  }
}

function daysSince(iso: string, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

async function choosePick(
  openai: any,
  pool: any[],
  totalCount: number,
  aboutMe: string,
  now: Date
): Promise<{ task: any; title: string; body: string } | null> {
  if (pool.length === 0) return null;

  const taskList = pool.map((t, i) => {
    const parked = daysSince(t.updated_date || t.created_date, now);
    const pushes = (t.due_date_pushes || 0) > 0 ? `, pushed ${t.due_date_pushes}x before` : '';
    const priority = t.pre_backburner_urgency || t.urgency || 'medium';
    const desc = (t.description || t.notes || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    return `${i + 1}. "${t.title}"${desc ? ` — ${desc}` : ''} (parked ~${parked} days, priority before parking: ${priority}, energy: ${t.energy_required || 'medium'}${pushes})`;
  }).join('\n');

  const prompt = `The user has a "Back Burner" — tasks they deliberately silenced because they weren't a priority right then. Nothing back there nags them. Once a week you check in about exactly ONE of them.

They have ${totalCount} task(s) on the Back Burner.
${aboutMe.trim() ? `\nABOUT THEM, in their own words: ${aboutMe.trim()}\nUse this only to judge what a task really involves and how much it matters to THEM. Never quote it back at them.\n` : ''}
BACK BURNER:
${taskList}

Pick the ONE task most worth reconsidering right now. Favour things that have been parked a while, that were a real priority before being parked, or that get harder/more expensive the longer they wait. Skip anything that clearly no longer matters.

Then write a single notification:
- It is a QUESTION, not an instruction. They chose to park this; the answer "still not now" must feel completely fine.
- Include ONE concrete, tiny suggestion for restarting it — the smallest possible first step (a 5-minute version, one phone call, one drawer, finding the one document). Never suggest doing the whole thing.
- Warm and plain, like a friend who remembered. Never shame, never mention how long it's been in a way that stings, never say "you should" or "you need to".
- Never imply they've made progress on it. It's been sitting.

Return ONLY valid JSON:
{
  "task_index": <1-based index of the task you picked>,
  "title": "<2-6 words, may include one emoji that reflects only what the task literally says — a proper name or ambiguous subject gets a neutral emoji (📌 🔔 ✨)>",
  "body": "<one or two short sentences: the question plus the tiny first step>"
}

If nothing back there is genuinely worth raising this week, return {"task_index": 0}.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: 'You are an ADHD productivity companion. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      max_completion_tokens: 2000,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const idx = Number(parsed.task_index || 0);
    if (!idx || idx < 1 || idx > pool.length) return null;
    if (!parsed.title || !parsed.body) return null;
    return { task: pool[idx - 1], title: parsed.title, body: parsed.body };
  } catch (e) {
    console.error('[BACK BURNER] LLM error:', e);
    return null;
  }
}

// A come-back push (see COMEBACK_STEPS): opens Add Task when tapped. Normal
// priority, a 2-hour lifetime: nothing here is tied to a minute, and a short
// life keeps OneSignal from putting it back on the screen later.
async function sendComeback(email: string, title: string, body: string): Promise<string | false | 'unsubscribed'> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return false;
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify({
        app_id: appId,
        headings: { en: title },
        contents: { en: body },
        data: { type: 'comeback', screen: '/AddTask' },
        include_external_user_ids: [email],
        channel_for_external_user_ids: 'push',
        ttl: 2 * 60 * 60,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.errors) {
      console.error(`[COME BACK] OneSignal error for ${email}:`, result);
      const errs = Array.isArray(result?.errors) ? result.errors.map(String) : [];
      return errs.some((e: string) => /not subscribed/i.test(e)) ? 'unsubscribed' : false;
    }
    return result.id || 'sent';
  } catch (e) {
    console.error(`[COME BACK] Failed to send to ${email}:`, e);
    return false;
  }
}

async function sendPush(email: string, title: string, body: string, taskId: string): Promise<string | false> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return false;

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify({
        app_id: appId,
        headings: { en: title },
        contents: { en: body },
        data: { screen: '/TaskNotification', taskId, type: 'backburner_checkin' },
        include_external_user_ids: [email],
        channel_for_external_user_ids: 'push',
        // High priority with a 30-minute lifetime, like Smart Reminders'
        // nudges: OneSignal's app puts recent pushes back on screen each time
        // the app starts fresh for as long as they live (3 days by default),
        // and Anna's 7:02 PM "App for Juli" check-in came back at 7:54 PM on
        // Oct 14 2026. High priority so a sleeping phone still gets it in time.
        priority: 10,
        ttl: 30 * 60,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.errors) {
      console.error(`[BACK BURNER] OneSignal error for ${email}:`, result);
      return false;
    }
    return result.id || 'sent';
  } catch (e) {
    console.error(`[BACK BURNER] Failed to send to ${email}:`, e);
    return false;
  }
}