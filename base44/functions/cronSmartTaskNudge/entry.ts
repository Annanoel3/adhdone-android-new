// Smart hourly task nudge for day-only tasks.
//
// Replaces the old per-task hourly notification flood (N day-only tasks due the
// same day = N notifications every hour) with a SINGLE, LLM-curated notification.
// The LLM looks at ALL the user's due-today day-only tasks and picks ONE to
// surface right now, with a context-aware message:
//   - Morning → pick an easy win to build momentum
//   - Afternoon → keep momentum going
//   - Evening → surface the most urgent remaining task
//   - Urgent → "I'll keep reminding you until it's done"
//
// This prevents the notification flood that causes ADHD paralysis — the user
// sees ONE supportive nudge instead of a wall of 8 task reminders.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { localMinutesOfDay, parseHHMM, isInQuietHours } from '../../shared/quietHours.ts';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();

    // 1. Get all users (for timezone, quiet hours, dedup tracking, player IDs)
    const allUsers = await base44.asServiceRole.entities.User.list();
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Get all tasks — group active day-only tasks by recipient, and count
    //    completed-today tasks per user (for celebration context in the prompt)
    const allTasks = await base44.asServiceRole.entities.Task.list('-updated_date', 500);
    const smartNudgeByUser: Record<string, any[]> = {};
    const completedTodayByUser: Record<string, number> = {};

    // Smart nudge pool: day-only tasks (due today) + no-due-date tasks (always in pool).
    // Birthdays, events, and multi-day tasks keep their own reminder systems.
    const isSmartNudgeTask = (t: any) =>
      t.status === 'active' &&
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person && (
        t.day_only_task ||
        (!t.due_date && !t.event_time && !t.start_date)
      );

    for (const task of allTasks) {
      const email = task.notification_recipient_email;
      if (!email) continue;

      if (isSmartNudgeTask(task)) {
        if (!smartNudgeByUser[email]) smartNudgeByUser[email] = [];
        smartNudgeByUser[email].push(task);
      } else if (task.status === 'completed' && task.completed_at) {
        if (isSameLocalDay(new Date(task.completed_at), now, userMap[email]?.timezone || 'UTC')) {
          completedTodayByUser[email] = (completedTodayByUser[email] || 0) + 1;
        }
      }
    }

    let nudgesSent = 0;
    const results: any[] = [];

    for (const email of Object.keys(smartNudgeByUser)) {
      const user = userMap[email];
      if (!user) continue;

      const timeZone = user.timezone || 'UTC';

      // Quiet hours — skip if the user is in their quiet window. Default to
      // 9 PM – 8 AM if the user hasn't configured quiet hours (no late nudges).
      const quietEnabled = !!user.quiet_hours_enabled;
      const startMin = quietEnabled && user.quiet_hours_start ? parseHHMM(user.quiet_hours_start) : parseHHMM('21:00');
      const endMin = quietEnabled && user.quiet_hours_end ? parseHHMM(user.quiet_hours_end) : parseHHMM('08:00');
      if (isInQuietHours(now, startMin, endMin, timeZone)) continue;

      // Dedup: skip if we nudged this user within the last 45 minutes
      if (user.last_smart_nudge_at) {
        const lastNudge = new Date(user.last_smart_nudge_at).getTime();
        if (now.getTime() - lastNudge < 45 * 60 * 1000) continue;
      }

      // Day-only tasks: include only if due today. No-due-date tasks: always in pool.
      const todaysTasks = smartNudgeByUser[email].filter(t => {
        if (t.day_only_task) {
          const dateStr = t.due_date || t.next_reminder;
          if (!dateStr) return false;
          return isSameLocalDay(new Date(dateStr), now, timeZone);
        }
        return true; // no due date — always eligible
      });

      if (todaysTasks.length === 0) continue;

      const localMin = localMinutesOfDay(now, timeZone);
      const completedToday = completedTodayByUser[email] || 0;
      const lastNudgeTitle = user.last_smart_nudge_task_id
        ? (todaysTasks.find(t => t.id === user.last_smart_nudge_task_id)?.title || null)
        : null;

      // Ask the LLM to pick ONE task + write a supportive message
      const nudge = await generateSmartNudge(todaysTasks, completedToday, localMin, lastNudgeTitle);
      if (!nudge || nudge.task_index == null) continue;

      const chosenTask = todaysTasks[nudge.task_index - 1];
      if (!chosenTask) continue;

      const sent = await sendNudgeNotification(email, user, nudge, chosenTask.id);
      if (sent) {
        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            last_smart_nudge_task_id: chosenTask.id,
            last_smart_nudge_at: now.toISOString(),
          });
        } catch (e) {
          console.error(`[SMART NUDGE] Failed to update user ${email}:`, e);
        }
        nudgesSent++;
        results.push({ email, taskTitle: chosenTask.title, title: nudge.notification_title });
        console.log(`[SMART NUDGE] Sent to ${email}: "${nudge.notification_title}" for "${chosenTask.title}"`);
      }
    }

    console.log(`[SMART NUDGE] Done — ${nudgesSent} nudge(s) sent at ${now.toISOString()}`);
    return Response.json({ success: true, nudgesSent, results, at: now.toISOString() });
  } catch (err) {
    console.error('[SMART NUDGE] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSameLocalDay(d1: Date, d2: Date, timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p1: Record<string, string> = {};
  for (const part of fmt.formatToParts(d1)) p1[part.type] = part.value;
  const p2: Record<string, string> = {};
  for (const part of fmt.formatToParts(d2)) p2[part.type] = part.value;
  return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
}

function formatTime(localMin: number): string {
  const h = Math.floor(localMin / 60);
  const m = localMin % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function generateSmartNudge(
  tasks: any[],
  completedToday: number,
  localMin: number,
  lastNudgeTitle: string | null
): Promise<{ task_index: number; notification_title: string; notification_body: string } | null> {
  const hour = Math.floor(localMin / 60);
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const timeStr = formatTime(localMin);

  const taskList = tasks.map((t, i) => {
    const type = t.day_only_task ? 'due today' : 'no due date';
    return `${i + 1}. "${t.title}" (${type}, priority: ${t.urgency || 'medium'}, energy: ${t.energy_required || 'medium'})`;
  }).join('\n');

  const prompt = `You are a supportive ADHD productivity companion — warm, encouraging, like a friend, never a clinician. Your job: pick ONE task to gently nudge the user about right now, and write a short, supportive notification.

CURRENT CONTEXT:
- Time of day: ${timeStr} (${timeOfDay})
- Tasks completed today: ${completedToday}
${lastNudgeTitle ? `- Last task you nudged about: "${lastNudgeTitle}" (avoid repeating unless it's urgent)` : ''}

TASKS DUE TODAY (not yet completed):
${taskList}

HOW TO CHOOSE THE TASK:
- "due today" tasks take priority over "no due date" tasks — a deadline is approaching.
- Morning (before noon): Pick something EASY (low energy) to build momentum. A quick win sets a positive tone for the day.
- Afternoon (noon-5pm): Pick something important that keeps momentum going.
- Evening (after 5pm): Pick the most urgent remaining task, or something quick that can still get done today.
- URGENT tasks: Always surface these with appropriate urgency, regardless of time of day. Let them know it's urgent and you'll keep reminding them until it's done.
- "no due date" tasks: only pick these when there are no "due today" tasks left, or when it's a quick easy win to build momentum.
- If there's only ONE task left, nudge about that one.
- Avoid picking the same task you nudged about last time (unless it's urgent).

MESSAGE GUIDELINES:
- notification_title: 2-6 words, include a relevant emoji, reference the task naturally.
- notification_body: ONE supportive sentence. Warm, non-shaming. Never productivity-shame.
- For easy tasks: frame it as a quick win ("This one's quick — knock it out and feel great! ✨")
- For urgent tasks: be direct but kind ("Hey, this one's urgent. I'll keep reminding you until it's done — you've got this. 💪")
- For morning: encourage starting with an easy win ("Start your day with this one! 🌅")
- If they've completed tasks today, briefly celebrate that momentum.
- NEVER list all the tasks. NEVER say "you have X tasks." Focus only on the ONE chosen task.

Return ONLY valid JSON:
{
  "task_index": <1-based index of the chosen task>,
  "notification_title": "<short title with emoji, 2-6 words>",
  "notification_body": "<one supportive sentence>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an ADHD productivity companion. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 150,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (e) {
    console.error('[SMART NUDGE] LLM error:', e);
    return null;
  }
}

async function sendNudgeNotification(
  email: string,
  user: any,
  nudge: { notification_title: string; notification_body: string },
  taskId: string
): Promise<boolean> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return false;

  const playerIds = user?.onesignal_player_ids || [];
  const payload: any = {
    app_id: appId,
    headings: { en: nudge.notification_title },
    contents: { en: nudge.notification_body },
    data: { screen: '/TaskNotification', taskId, type: 'smart_nudge' },
    channel_for_external_user_ids: 'push',
  };

  if (playerIds.length > 0) {
    payload.include_player_ids = playerIds;
  } else {
    payload.include_external_user_ids = [email];
  }

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
      console.error(`[SMART NUDGE] OneSignal error for ${email}:`, result);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[SMART NUDGE] Failed to send to ${email}:`, e);
    return false;
  }
}