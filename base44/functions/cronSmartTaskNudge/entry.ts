// Smart daily task nudge — LLM-generated daily schedule.
//
// Instead of one nudge per hour (which floods the notification tray), the LLM
// generates a DAILY SCHEDULE of 3-5 well-timed nudges based on the user's tasks,
// their urgency, and the time of day. The schedule is stored on the user and
// the hourly cron only sends due nudges (no LLM call). The schedule is
// regenerated once per day, or when a task is marked urgent (dirty flag).
//
// This reduces LLM calls from ~12/day to ~1/day per user (huge credit savings)
// while providing smarter, less overwhelming notifications:
//   - 3-5 nudges per day instead of one-an-hour
//   - Check-in style for repeat nudges ("Have you done X yet?")
//   - Multiple-urgent handling ("multiple urgent tasks, pick one to start")

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { localMinutesOfDay, parseHHMM, isInQuietHours, adjustForQuietHours } from '../../shared/quietHours.ts';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();

    // 1. Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Get all tasks — group active smart-nudge tasks by recipient, track completed
    const allTasks = await base44.asServiceRole.entities.Task.list('-updated_date', 500);
    const tasksByUser: Record<string, any[]> = {};
    const completedTaskIds = new Set<string>();
    const silencedTaskIds = new Set<string>();

    // Recurring interval reminders (10min..every_other_day) are handled by the
    // refill cron with their own OneSignal notifications — exclude them so the
    // LLM doesn't ALSO nudge them (duplicate notifications). "once" and null are
    // fine: "once" marks a day-only/precise task whose actual nudges come from
    // the night-before + LLM day-of flow, not a recurring flood.
    const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
    const isSmartNudgeTask = (t: any) =>
      t.status === 'active' &&
      !t.silenced &&  // Back Burner: silenced tasks get no nudges
      !RECURRING_INTERVALS.has(t.reminder_interval) &&
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person && (
        t.day_only_task ||
        t.start_date ||  // multi-day task: LLM fits reminders inside the start→due window
        (!t.due_date && !t.event_time && !t.start_date && !t.next_reminder)
      );

    for (const task of allTasks) {
      const email = task.notification_recipient_email;
      if (!email) continue;
      if (isSmartNudgeTask(task)) {
        if (!tasksByUser[email]) tasksByUser[email] = [];
        tasksByUser[email].push(task);
      }
      if (task.status === 'completed') {
        completedTaskIds.add(task.id);
      }
      if (task.silenced) {
        silencedTaskIds.add(task.id);
      }
    }

    let nudgesSent = 0;
    let schedulesGenerated = 0;
    const results: any[] = [];

    for (const email of Object.keys(tasksByUser)) {
      const user = userMap[email];
      if (!user) continue;

      const timeZone = user.timezone || 'UTC';

      // Quiet hours — skip if the user is in their quiet window
      const quietEnabled = !!user.quiet_hours_enabled;
      const startMin = quietEnabled && user.quiet_hours_start ? parseHHMM(user.quiet_hours_start) : parseHHMM('21:00');
      const endMin = quietEnabled && user.quiet_hours_end ? parseHHMM(user.quiet_hours_end) : parseHHMM('08:00');
      if (isInQuietHours(now, startMin, endMin, timeZone)) continue;

      const todayStr = getLocalDateString(now, timeZone);

      // Check if schedule exists for today and not dirty
      const hasValidSchedule = user.smart_nudge_schedule_date === todayStr &&
                               !user.smart_nudge_schedule_dirty &&
                               user.smart_nudge_schedule?.length > 0;

      let schedule: any[] = user.smart_nudge_schedule || [];

      if (!hasValidSchedule) {
        // Generate new schedule (1 LLM call per day per user)
        const todaysTasks = tasksByUser[email].filter(t => {
          if (t.day_only_task) {
            const dateStr = t.due_date || t.next_reminder;
            if (!dateStr) return false;
            return isSameLocalDay(new Date(dateStr), now, timeZone);
          }
          // Multi-day task (start_date → due_date): only nudge if today falls
          // inside the working window. Before the start date or after the due
          // date, the user doesn't need to hear about it right now.
          if (t.start_date && t.due_date) {
            const today = getLocalDateString(now, timeZone);
            const startStr = getLocalDateString(new Date(t.start_date), timeZone);
            const dueStr = getLocalDateString(new Date(t.due_date), timeZone);
            return today >= startStr && today <= dueStr;
          }
          return true;
        });

        if (todaysTasks.length === 0) continue;

        // Get already-nudged task titles (from existing schedule entries with sent=true)
        const alreadyNudgedIds = schedule
          .filter((e: any) => e.sent && e.task_id)
          .map((e: any) => e.task_id);
        const alreadyNudgedTitles = todaysTasks
          .filter(t => alreadyNudgedIds.includes(t.id))
          .map(t => t.title);

        const localMin = localMinutesOfDay(now, timeZone);
        const newEntries = await generateDailySchedule(
          todaysTasks,
          alreadyNudgedTitles,
          localMin,
          timeZone,
          startMin,
          endMin
        );

        if (!newEntries || newEntries.length === 0) continue;

        // Merge: keep sent entries (for history), add new ones
        const sentEntries = schedule.filter((e: any) => e.sent);
        schedule = [...sentEntries, ...newEntries];

        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            smart_nudge_schedule: schedule,
            smart_nudge_schedule_date: todayStr,
            smart_nudge_schedule_dirty: false,
          });
          schedulesGenerated++;
          console.log(`[SMART NUDGE] Generated schedule for ${email}: ${newEntries.length} nudges`);
        } catch (e) {
          console.error(`[SMART NUDGE] Failed to store schedule for ${email}:`, e);
        }
      }

      // Send due nudges (no LLM call — just OneSignal)
      let updated = false;
      let lastSentTaskId: string | null = null;
      for (const entry of schedule) {
        if (entry.sent) continue;
        if (new Date(entry.send_at).getTime() > now.getTime()) continue; // not due yet

        // Skip if task is completed
        if (completedTaskIds.has(entry.task_id)) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          updated = true;
          continue;
        }

        // Skip if task is silenced (back burner) — mark as sent so it doesn't
        // fire before the dirty schedule regenerates without it.
        if (silencedTaskIds.has(entry.task_id)) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          updated = true;
          continue;
        }

        const sent = await sendNudgeNotification(email, entry.title, entry.body, entry.task_id);
        if (sent) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          updated = true;
          lastSentTaskId = entry.task_id;
          nudgesSent++;
          results.push({ email, title: entry.title, type: entry.type });
          console.log(`[SMART NUDGE] Sent to ${email}: "${entry.title}" (${entry.type})`);
        }
      }

      // Save updated schedule + last nudge in one call
      if (updated) {
        const updateData: any = { smart_nudge_schedule: schedule };
        if (lastSentTaskId) {
          updateData.last_smart_nudge_task_id = lastSentTaskId;
          updateData.last_smart_nudge_at = now.toISOString();
        }
        try {
          await base44.asServiceRole.entities.User.update(user.id, updateData);
        } catch (e) {
          console.error(`[SMART NUDGE] Failed to update schedule for ${email}:`, e);
        }
      }
    }

    console.log(`[SMART NUDGE] Done — ${nudgesSent} nudge(s) sent, ${schedulesGenerated} schedule(s) generated at ${now.toISOString()}`);
    return Response.json({ success: true, nudgesSent, schedulesGenerated, results, at: now.toISOString() });
  } catch (err) {
    console.error('[SMART NUDGE] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocalDateString(d: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

function isSameLocalDay(d1: Date, d2: Date, timeZone: string): boolean {
  return getLocalDateString(d1, timeZone) === getLocalDateString(d2, timeZone);
}

function formatTime(localMin: number): string {
  const h = Math.floor(localMin / 60);
  const m = localMin % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Correct time-of-day words in an LLM-generated nudge title so they match the
// actual send time — e.g. an "Evening Check-in" scheduled for 1:35 PM becomes
// "Afternoon Check-in". The LLM writes the title at schedule-generation time,
// but the nudge may fire hours later via delay_minutes.
function fixTitleTimeOfDay(title: string, sendAt: Date, timeZone: string): string {
  if (!title) return title;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false });
    const hour = parseInt(fmt.format(sendAt), 10);
    const correct = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    return title
      .replace(/\bMorning\b/g, correct)
      .replace(/\bAfternoon\b/g, correct)
      .replace(/\bEvening\b/g, correct);
  } catch {
    return title;
  }
}

async function generateDailySchedule(
  tasks: any[],
  alreadyNudgedTitles: string[],
  localMin: number,
  timeZone: string,
  quietStartMin: number,
  quietEndMin: number
): Promise<any[] | null> {
  const hour = Math.floor(localMin / 60);
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const timeStr = formatTime(localMin);
  const quietStartStr = formatTime(quietStartMin);
  const quietEndStr = formatTime(quietEndMin);

  const taskList = tasks.map((t, i) => {
    let type = t.day_only_task ? 'due today' : 'no due date';
    if (t.start_date && t.due_date) {
      type = `working window ${getLocalDateString(new Date(t.start_date), timeZone)} → ${getLocalDateString(new Date(t.due_date), timeZone)}`;
    }
    const nudged = alreadyNudgedTitles.includes(t.title) ? ' — ALREADY NUDGED TODAY' : '';
    return `${i + 1}. "${t.title}" (${type}, priority: ${t.urgency || 'medium'}, energy: ${t.energy_required || 'medium'}${nudged})`;
  }).join('\n');

  const urgentCount = tasks.filter(t => t.urgency === 'urgent').length;

  const prompt = `You are a supportive ADHD productivity coach — warm, encouraging, like a friend, never a clinician. Your job: create a notification schedule for the rest of today. NOT one per hour — think about when the user genuinely needs a nudge.

CURRENT CONTEXT:
- Current time: ${timeStr} (${timeOfDay})
- Timezone: ${timeZone}
- Quiet hours: ${quietStartStr} - ${quietEndStr} (don't schedule during these)

TASKS:
${taskList}

${alreadyNudgedTitles.length > 0 ? `TASKS ALREADY NUDGED TODAY (use check-in style for these — "Have you done X yet?"):\n${alreadyNudgedTitles.map(t => `- "${t}"`).join('\n')}\n` : ''}SCHEDULE GUIDELINES:
- Generate 3-5 notifications for the rest of today (NOT one per hour — fewer, smarter)
- Space them at natural transition points (e.g., late morning, early afternoon, late afternoon)
- For tasks ALREADY NUDGED: use a check-in style ("Have you done X yet?") — supportive, not shaming
- For URGENT tasks: surface them sooner with direct urgency ("Hey, this one's urgent — you've got this 💪")
${urgentCount >= 2 ? `- There are ${urgentCount} URGENT tasks. One notification should say "You have multiple urgent tasks — let's pick one to start with" and briefly mention them. Use task_index: 0 for this one.\n` : ''}- Morning (before noon): encourage easy wins to build momentum
- Afternoon (noon-5pm): keep momentum going
- Evening (after 5pm): surface the most urgent remaining tasks
- Multi-day tasks show a "working window" (start date → due date). Today is inside that window. Fit reminders by priority: a high/urgent multi-day task deserves real nudges; a low-priority one may only need one check-in, ideally later in the window.
- Don't waste notifications on low-priority tasks the user doesn't need to do right now. If only low-priority tasks remain, send at most ONE combined heads-up (e.g., "Hey, you've got a few low-priority things to get through when you have time") using task_index 0, rather than a nudge per task. Never skip a task entirely without acknowledging it at least once.
- Be supportive, never productivity-shame
- Each notification_body: ONE supportive sentence
- delay_minutes: minutes from now to send this nudge (e.g., 30 = 30 min from now, 120 = 2 hours from now)
- Don't schedule past quiet hours start (${quietStartStr})

Return ONLY valid JSON:
{
  "nudges": [
    {
      "task_index": <1-based index of the task, or 0 for a multiple_urgent message>,
      "delay_minutes": <minutes from now>,
      "title": "<2-6 words with emoji>",
      "body": "<one supportive sentence>",
      "type": "initial" | "check_in" | "multiple_urgent"
    }
  ]
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
      max_tokens: 400,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const nudges = parsed.nudges || [];

    // Convert to schedule entries
    const nowMs = Date.now();
    const fallbackTaskId = tasks.find(t => t.urgency === 'urgent')?.id || tasks[0]?.id || null;

    const entries = nudges.map((n: any) => {
      const task = n.task_index > 0 ? tasks[n.task_index - 1] : null;
      const taskId = task?.id || fallbackTaskId;
      const delayMs = Math.max(1, (n.delay_minutes || 30)) * 60 * 1000;
      let sendAt = new Date(nowMs + delayMs);

      // Adjust for quiet hours (don't send during quiet hours)
      sendAt = adjustForQuietHours(sendAt, quietStartMin, quietEndMin, timeZone);

      return {
        task_id: taskId,
        send_at: sendAt.toISOString(),
        title: fixTitleTimeOfDay(n.title || 'Task nudge', sendAt, timeZone),
        body: n.body || '',
        type: n.type || 'initial',
        sent: false,
        sent_at: null,
      };
    });

    return entries;
  } catch (e) {
    console.error('[SMART NUDGE] LLM error:', e);
    return null;
  }
}

async function sendNudgeNotification(
  email: string,
  title: string,
  body: string,
  taskId: string
): Promise<boolean> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restApiKey) return false;

  const payload: any = {
    app_id: appId,
    headings: { en: title },
    contents: { en: body },
    data: { screen: '/TaskNotification', taskId, type: 'smart_nudge' },
    include_external_user_ids: [email],
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
      console.error(`[SMART NUDGE] OneSignal error for ${email}:`, result);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[SMART NUDGE] Failed to send to ${email}:`, e);
    return false;
  }
}