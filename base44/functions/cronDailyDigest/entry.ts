// Daily morning digest notification.
// Replaces the "9 AM collision" (N individual task notifications all firing at
// quiet-hours-end) with ONE friendly summary of the user's day. Runs every
// 30 minutes via a scheduled automation; for each user whose local time is
// within their morning window (quiet_hours_end ± 30 min, or 8 AM default),
// it sends a single OneSignal push summarizing today's tasks — or a
// motivational "your day is clear!" message if there are none.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { localMinutesOfDay, parseHHMM } from '../../shared/quietHours.ts';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Get all users (for timezone + quiet hours + de-dup tracking)
    const allUsers = await base44.asServiceRole.entities.User.list();
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Get all active non-birthday tasks, grouped by recipient email
    const allTasks = await base44.asServiceRole.entities.Task.list('-updated_date', 500);
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
    //    (so users with zero tasks still get the "clear day!" nudge)
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

      // De-dup: only one digest per day per user
      if (user.last_digest_date === todayStr) continue;

      const timeZone = user.timezone || 'America/Chicago';
      const quietEnabled = !!user.quiet_hours_enabled;
      const endMin = quietEnabled && user.quiet_hours_end
        ? parseHHMM(user.quiet_hours_end)
        : parseHHMM('08:00');

      // Morning window: [endMin, endMin + 60) in the user's local time.
      // 60-min window with a 30-min cron ensures we never miss the slot.
      const localMin = localMinutesOfDay(now, timeZone);
      if (localMin < endMin || localMin >= endMin + 60) continue;

      // Get today's tasks
      const userTasks = activeTasksByUser[email] || [];
      const todaysTasks = getTodaysTasks(userTasks, now, timeZone);

      // Generate + send the digest
      const firstName = (user.full_name || '').split(' ')[0] || 'friend';
      const message = await generateDigestMessage(todaysTasks, firstName);
      const sent = await sendDigestNotification(email, user, message);

      if (sent) {
        try {
          await base44.asServiceRole.entities.User.update(user.id, { last_digest_date: todayStr });
        } catch (e) {
          console.error(`[DIGEST] Failed to update last_digest_date for ${email}:`, e);
        }
        digestsSent.push({ email, taskCount: todaysTasks.length });
      }
    }

    console.log(`[DIGEST] Sent ${digestsSent.length} digest(s) at ${now.toISOString()}`);
    return Response.json({
      success: true,
      digestsSent,
      count: digestsSent.length,
      at: now.toISOString()
    });
  } catch (err) {
    console.error('[DIGEST] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

// ── Helper: filter tasks relevant to "today" (in the user's timezone) ──────────
function getTodaysTasks(tasks: any[], now: Date, timeZone: string): any[] {
  return tasks.filter(task => {
    // Recurring tasks — they'll remind throughout the day, so always relevant
    if (task.reminder_interval && task.reminder_interval !== 'once') return true;

    // One-time tasks — relevant if due_date or next_reminder falls on today
    const dateStr = task.due_date || task.next_reminder;
    if (!dateStr) return false;
    return isSameLocalDay(new Date(dateStr), now, timeZone);
  });
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
async function generateDigestMessage(tasks: any[], firstName: string): Promise<{ title: string; body: string }> {
  const title = `☀️ Good morning, ${firstName}!`;

  if (tasks.length === 0) {
    return {
      title,
      body: `Looks like your day is clear! Perfect time to get ahead — what else can we tackle today? 🚀`
    };
  }

  const taskList = tasks.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a supportive ADHD productivity companion with a warm, friendly tone — like a supportive friend, never a clinician. Generate a short (1-2 sentences, under 150 characters) morning digest notification body that summarizes the user's tasks for today. Be encouraging and non-shaming. Use the user's first name naturally. Return only the notification body text, nothing else.`
        },
        {
          role: 'user',
          content: `User's first name: ${firstName}\nTasks for today (${tasks.length} total):\n${taskList}\n\nGenerate a friendly morning digest notification body.`
        }
      ],
      max_tokens: 100,
      temperature: 0.7,
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
async function sendDigestNotification(email: string, user: any, message: { title: string; body: string }): Promise<boolean> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

  if (!appId || !restApiKey) {
    console.error('[DIGEST] Missing OneSignal credentials');
    return false;
  }

  const playerIds = user?.onesignal_player_ids || [];

  const payload: any = {
    app_id: appId,
    headings: { en: message.title },
    contents: { en: message.body },
    data: { screen: '/Tasks', type: 'daily_digest' },
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
      console.error(`[DIGEST] OneSignal error for ${email}:`, result);
      return false;
    }

    console.log(`[DIGEST] Sent to ${email}: ${result.recipients || 0} recipients`);
    return true;
  } catch (e) {
    console.error(`[DIGEST] Failed to send to ${email}:`, e);
    return false;
  }
}