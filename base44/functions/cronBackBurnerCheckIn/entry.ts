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
import { isInQuietHours, resolveQuietHours, userTimeZone } from '../../shared/quietHours.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { listAll } from '../../shared/listAll.ts';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Sent during the afternoon/early evening — a "want to pick this back up?"
// question needs a moment when the day isn't already underway.
const SEND_FROM_HOUR = 14;
const SEND_TO_HOUR = 20;

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const now = new Date();

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
      const email = user?.email;
      if (!email) continue;

      const tasks = backBurnerByUser[email] || [];
      if (tasks.length === 0) continue;

      const last = user.last_backburner_checkin_at ? new Date(user.last_backburner_checkin_at).getTime() : 0;
      if (now.getTime() - last < WEEK_MS) continue;

      // The shared fallback when no timezone is saved (UTC put a US user's
      // "afternoon" send window in their morning).
      const timeZone = userTimeZone(user);
      const localHour = localHourIn(now, timeZone);
      if (localHour < SEND_FROM_HOUR || localHour >= SEND_TO_HOUR) continue;

      // Quiet hours default to ON; only an explicit "off" in Settings skips them.
      const quiet = resolveQuietHours(user);
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

    console.log(`[BACK BURNER] Done — ${sent} check-in(s) at ${now.toISOString()}`);
    return Response.json({ success: true, sent, results, at: now.toISOString() });
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