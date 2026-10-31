// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Daily morning digest notification.
// Replaces the "9 AM collision" (N individual task notifications all firing at
// quiet-hours-end) with ONE friendly summary of the user's day. Runs every
// 30 minutes via a scheduled automation; for each user in the first hour after
// they woke up (when their quiet hours ended, or with "Notice when I wake up"
// on, when their phone was first unlocked; 8 AM with quiet hours off), it
// sends a single OneSignal push summarizing today's tasks. That hour is the
// summary's first claim (Anna, Oct 12 2026): Smart Reminders wait for it. Nothing on the
// list today means no digest at all (it used to send "your day is clear!",
// every morning, to people who had never made a task).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
// localDateKey is this file's own (below). Importing it too, as on Oct 12 2026 at
// 05:28 UTC, is a duplicate declaration and the function failed to start.
import { localMinutesOfDay, userTimeZone, theirDayKeyFor, wakeStartMs, resolveQuietHours } from '../../shared/quietHours.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { listAll, filterAll } from '../../shared/listAll.ts';
import { easeNow } from '../../shared/easeOff.ts';

const openai = lean(new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
}), { name: 'cronDailyDigest' });

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();

    // 1. Get all users (for timezone + quiet hours + de-dup tracking)
    const allUsers = await listAll(base44.asServiceRole.entities.User);
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Get all active non-birthday tasks, grouped by recipient email
    // EVERY active task, paged — not "the 500 most recently updated".
    const allTasks = await filterAll(base44.asServiceRole.entities.Task, { status: 'active' });
    const activeTasksByUser: Record<string, any[]> = {};
    for (const task of allTasks) {
      if (task.status !== 'active' || !task.notification_recipient_email) continue;
      if (task.classification === 'birthday') continue; // birthdays are a separate feature
      const email = task.notification_recipient_email;
      if (!activeTasksByUser[email]) activeTasksByUser[email] = [];
      activeTasksByUser[email].push(task);
    }

    // 3. Collect users who should get a digest:
    //    anyone with active tasks, OR anyone active in the last 30 days
    //    (their list is checked below; an empty day sends nothing)
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const digestEmails = new Set<string>();

    for (const email of Object.keys(activeTasksByUser)) digestEmails.add(email);
    for (const u of allUsers) {
      if (u && u.email && u.last_active_at) {
        if (new Date(u.last_active_at).getTime() > thirtyDaysAgo) {
          digestEmails.add(u.email);
        }
      }
    }

    // 4. For each user, check if it's their morning window and send the digest
    const digestsSent: any[] = [];

    for (const email of digestEmails) {
      const user = userMap[email];
      if (!user) continue;

      // Smart Reminders paused them after a week away (cronSmartTaskNudge,
      // Anna, Oct 30 2026): the summary stops with them until they're back.
      if (pausedForAway(user)) continue;

      const timeZone = userTimeZone(user);

      // The first hour after they woke up (shared/quietHours.wakeStartMs):
      // from when their quiet hours ended (quiet hours default to ON; turned
      // off, 8 AM), or with "Notice when I wake up" on, from when their phone
      // was first unlocked. Until it reports, nothing yet (at most 4 hours past
      // quiet hours end, 1 when the phone holds ADHDone back in the
      // background). Never inside quiet hours. 60 minutes with a 30-minute
      // cron: two tries.
      const wokeAt = wakeStartMs(user, now, timeZone);
      if (wokeAt == null) continue;
      const sinceWake = now.getTime() - wokeAt;
      if (sinceWake < 0 || sinceWake >= 60 * 60 * 1000) continue;

      // De-dup: one digest per day, keyed by their own day (it turns over in
      // the middle of their quiet hours and is named for the date they wake
      // up on), the same key Smart Reminders checks before it waits for this.
      const todayStr = theirDayKeyFor(user, now, timeZone);
      if (user.last_digest_date === todayStr) continue;

      // Get today's tasks
      const userTasks = activeTasksByUser[email] || [];
      // Tasks put off on 3 different days are on the eased plan
      // (shared/easeOff.ts, Anna, Oct 22 2026): the morning summary is where
      // they're always mentioned, so they lead the list and are named.
      const easedTasks = userTasks.filter((t: any) => !t.parent_task_id && !t.silenced && easeNow(t));
      const easedIds = new Set(easedTasks.map((t: any) => t.id));
      const todaysTasks = [...easedTasks, ...getTodaysTasks(userTasks, now, timeZone).filter((t: any) => !easedIds.has(t.id))];

      // Nothing on the list today: no digest. "Your day is clear — what else
      // can we tackle?" went out every single morning to people who had never
      // made a task, which reads as spam from an app they opened once.
      // Its turn is still over for today, so Smart Reminders stop waiting.
      if (todaysTasks.length === 0) {
        if (userTasks.length > 0) {
          try { await base44.asServiceRole.entities.User.update(user.id, { last_digest_date: todayStr }); } catch {}
        }
        continue;
      }

      // Claim today BEFORE sending. If this write fails (or the run is cut off
      // after the push goes out), the next 30-min run would otherwise re-send
      // the same digest — which is exactly the double notification users saw.
      try {
        await base44.asServiceRole.entities.User.update(user.id, { last_digest_date: todayStr });
      } catch (e) {
        console.error(`[DIGEST] Could not claim digest for ${email}, skipping send:`, e);
        continue;
      }

      // Send ledger: first claim (Anna, Oct 12 2026). Softer pushes don't hold
      // it back; only a reminder tied to a real moment within 5 minutes does,
      // and then the claim is released so the next run this hour retries.
      const gate = await ledgerCheck(base44, { email, kind: 'daily_digest', firstClaim: true });
      if (!gate.allowed) {
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_digest_date: user.last_digest_date || null });
        } catch {}
        continue;
      }

      // Generate + send the digest
      // The name they asked to be called. full_name is often an email handle
      // or a legal name nobody uses ("Good morning, shirarose823!").
      const firstName = String(user.preferred_name || '').trim() || (user.full_name || '').split(' ')[0] || 'friend';
      const message = await generateDigestMessage(todaysTasks, firstName, Math.floor(localMinutesOfDay(now, timeZone) / 60), easedTasks.slice(0, 4).map((t: any) => String(t.title || '')).filter(Boolean));
      const sent = await sendDigestNotification(email, user, message);

      if (sent) {
        await ledgerRecord(base44, { email, kind: 'daily_digest', source: 'cronDailyDigest', notificationId: typeof sent === 'string' ? sent : null, title: message.title });
        digestsSent.push({ email, taskCount: todaysTasks.length });
      } else {
        // Release the claim so a later run today can retry.
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_digest_date: user.last_digest_date || null });
        } catch {}
      }
    }

    console.log(`[DIGEST] Sent ${digestsSent.length} digest(s) at ${now.toISOString()}`);

    // 5. The evening check-in push (Anna, Oct 30 2026: the evening card AND a
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
      digestsSent,
      count: digestsSent.length,
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

const WIN_ASK_TITLE = 'How did you feel today?';
const WIN_ASK_BODY = 'Tap to check in and save one win, big or small.';

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
      // Can't check the mood either: don't ask (same as the win check).
      console.error(`[DIGEST] Mood check failed for ${email}:`, (e as any)?.message || e);
      continue;
    }
    if (haveOne) continue;

    const gate = await ledgerCheck(base44, { email, kind: 'motivation' });
    if (!gate.allowed) continue;

    // Claim the day before sending, so a second run in the hour can't repeat it.
    try {
      await base44.asServiceRole.entities.User.update(user.id, { win_ask_date: dayKey });
    } catch (e) {
      console.error(`[DIGEST] Could not claim the win ask for ${email}:`, e);
      continue;
    }
    const id = await sendWinAsk(email);
    if (id) {
      await ledgerRecord(base44, { email, kind: 'motivation', source: 'cronDailyDigest', notificationId: id, title: WIN_ASK_TITLE });
      sent += 1;
    } else {
      try { await base44.asServiceRole.entities.User.update(user.id, { win_ask_date: user.win_ask_date || null }); } catch {}
    }
  }
  console.log(`[DIGEST] Evening win asks sent: ${sent}`);
  return sent;
}

async function sendWinAsk(email: string): Promise<string | false> {
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
        headings: { en: WIN_ASK_TITLE },
        contents: { en: WIN_ASK_BODY },
        data: { type: 'win_ask', screen: '/Home?win=1' },
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

// ── Helper: exactly what the Tasks page shows under "Today" ──────────────────
// Every active top-level task that isn't on the back burner and isn't a
// birthday, whose day (its start date, else its due date, else its next
// reminder) is today or already past, plus every task with no date at all,
// which sits under Today too ("remind me to take my pills" means today). Same
// rule as TaskSections.categorizeTask, in the user's own timezone. The digest
// used to count only tasks dated today, so someone whose list was all
// no-date tasks was told their day was clear.
function getTodaysTasks(tasks: any[], now: Date, timeZone: string): any[] {
  const todayKey = localDateKey(now, timeZone);
  return tasks.filter(task => {
    if (task.parent_task_id) return false;
    if (task.silenced) return false;
    if (task.birthday_person || task.classification === 'birthday') return false;
    const dateStr = task.start_date || task.due_date || task.next_reminder;
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return localDateKey(d, timeZone) <= todayKey;
  });
}

// YYYY-MM-DD in the user's timezone, so dates compare as plain strings.
function localDateKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function isSameLocalDay(d1: Date, d2: Date, timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p1: Record<string, string> = {};
  for (const part of fmt.formatToParts(d1)) p1[part.type] = part.value;
  const p2: Record<string, string> = {};
  for (const part of fmt.formatToParts(d2)) p2[part.type] = part.value;
  return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
}

// ── Helper: LLM-generated friendly digest message (with template fallback) ───
// It goes out when they wake up: their morning, which for someone who
// sleeps days is 4 PM. "Good morning" at 4 PM is odd, so outside clock morning
// it's "Rise and shine" (Anna, Oct 12 2026).
async function generateDigestMessage(tasks: any[], firstName: string, localHour: number, mustName: string[] = []): Promise<{ title: string; body: string }> {
  const clockMorning = localHour >= 4 && localHour < 12;
  const title = clockMorning ? `☀️ Good morning, ${firstName}!` : `✨ Rise and shine, ${firstName}!`;

  if (tasks.length === 0) {
    return {
      title,
      body: `Looks like your day is clear! Perfect time to get ahead — what else can we tackle today? 🚀`
    };
  }

  const taskList = tasks.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        {
          role: 'system',
          content: `You are a supportive ADHD productivity companion with a warm, friendly tone — like a supportive friend, never a clinician. Generate a short (1-2 sentences, under 180 characters) start-of-day digest notification body that summarizes the user's tasks for today. It is sent when they wake up, which is ${clockMorning ? 'in the morning' : `not morning on the clock (it's ${localHour > 12 ? localHour - 12 : localHour || 12} ${localHour >= 12 ? 'PM' : 'AM'} where they are; they keep different hours)`}, so never say "morning" unless it is morning. Be encouraging and non-shaming. Use the user's first name naturally.

CRITICAL: keep every concrete detail from each task title exactly as written — store names, places, people, items (e.g. "from Costco", "at Martin's house"). Never drop, merge, or paraphrase those away; they are the whole point of the reminder. Shorten your own words, never the task's details.

Return only the notification body text, nothing else.`
        },
        {
          role: 'user',
          content: `User's first name: ${firstName}\nTasks for today (${tasks.length} total):\n${taskList}${mustName.length ? `\n\nThey keep putting these off, so this summary is where they get mentioned now. Name each one in the message, lightly and without guilt (it can run up to 240 characters to fit them):\n${mustName.map((n) => `- ${n}`).join('\n')}` : ''}\n\nGenerate a friendly start-of-day digest notification body.`
        }
      ],
      reasoning_effort: 'low',
      max_completion_tokens: 2000,
    });

    const body = response.choices[0]?.message?.content?.trim() ||
      `You've got ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} on your plate today. You've got this! 💪`;

    return { title, body };
  } catch (e) {
    console.error('[DIGEST] LLM error, using fallback:', e);
    return {
      title,
      body: `You've got ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} on your plate today. You've got this! 💪`
    };
  }
}

// ── Helper: send the digest push via OneSignal (immediate, not scheduled) ─────
async function sendDigestNotification(email: string, user: any, message: { title: string; body: string }): Promise<string | false> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

  if (!appId || !restApiKey) {
    console.error('[DIGEST] Missing OneSignal credentials');
    return false;
  }

  // HARD RULE: target by external id (the user's email) only. Never player ids.
  const payload: any = {
    app_id: appId,
    include_external_user_ids: [email],
    headings: { en: message.title },
    contents: { en: message.body },
    data: { screen: '/Tasks', type: 'daily_digest' },
    channel_for_external_user_ids: 'push',
  };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || result.errors) {
      console.error(`[DIGEST] OneSignal error for ${email}:`, result);
      return false;
    }

    // OneSignal's answer no longer carries a recipient count (it read "0
    // recipients" for pushes that reached the phone, Oct 16 2026); the id is
    // what the debug look-up ({ os: { id } }) takes to see what it reached.
    console.log(`[DIGEST] Sent to ${email}: ${result.id || 'no id'}`);
    return result.id || 'sent';
  } catch (e) {
    console.error(`[DIGEST] Failed to send to ${email}:`, e);
    return false;
  }
}