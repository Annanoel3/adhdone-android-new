// Smart daily task nudge — fully autonomous LLM-generated daily reminder schedule.
//
// The LLM acts as a personal assistant to a disorganized ADHD boss: it sees the
// FULL task list (everything that isn't an event, birthday, explicit recurring
// interval, or one-time precise task), looks at the week ahead, and intelligently
// decides what to surface TODAY, when, and what to say. No caps, no rigid
// formulas — the LLM decides count, timing, spacing, and which tasks to nudge.
//
// Regeneration: once per day (or when the dirty flag is set by onTaskUpdate on
// task create / urgency change / silence / reactivate). The hourly cron only
// SENDS due entries in real-time — no pre-scheduled OneSignal pushes, so a task
// completed mid-day never gets a ghost notification (the send-time check skips
// completed/silenced tasks).

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

    // 2. Get all tasks — group smart-nudge tasks by recipient, track completed/silenced
    const allTasks = await base44.asServiceRole.entities.Task.list('-updated_date', 500);
    const tasksByUser: Record<string, any[]> = {};
    const completedTaskIds = new Set<string>();
    const silencedTaskIds = new Set<string>();

    // Explicit recurring intervals (10min..every_other_day, including 2hours/4hours
    // when the user explicitly asked "every 2 hours") are handled by the refill cron
    // with their own OneSignal notifications — exclude them so the LLM doesn't ALSO
    // nudge them (duplicate notifications). "once" = one-time precise (own flow).
    // Events, birthdays, and day-only-night-before are also excluded.
    const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
    const isSmartNudgeTask = (t: any) =>
      t.status === 'active' &&
      !t.silenced &&
      !t.parent_task_id && // sub-tasks are context for their parent, not independent nudges
      !t.reminder_interval && // null only — "once" and recurring have their own flows
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person;

    // Sub-task map: parent_id → [sub-tasks]. Sub-tasks are NOT nudged
    // independently — they're context for the parent task's wording so the LLM
    // can acknowledge where the user is in a multi-step task (e.g. "you're
    // stuck on the dryer part of laundry").
    const subtasksByParent: Record<string, any[]> = {};
    for (const task of allTasks) {
      if (task.parent_task_id) {
        if (!subtasksByParent[task.parent_task_id]) subtasksByParent[task.parent_task_id] = [];
        subtasksByParent[task.parent_task_id].push(task);
      }
    }

    // Track completed/silenced IDs BEFORE the email guard — onTaskUpdate clears
    // notification_recipient_email on completion, so a completed task has no email
    // and would be skipped here, leaving completedTaskIds empty and letting
    // pre-scheduled smart nudges fire for tasks the user already finished.
    for (const task of allTasks) {
      if (task.status === 'completed') {
        completedTaskIds.add(task.id);
      }
      if (task.silenced) {
        silencedTaskIds.add(task.id);
      }
      const email = task.notification_recipient_email;
      if (!email) continue;
      if (isSmartNudgeTask(task)) {
        if (!tasksByUser[email]) tasksByUser[email] = [];
        tasksByUser[email].push(task);
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

      // Regenerate once per day, or when dirty (new task, urgency change, silence/reactivate)
      const hasValidSchedule = user.smart_nudge_schedule_date === todayStr &&
                               !user.smart_nudge_schedule_dirty &&
                               user.smart_nudge_schedule?.length > 0;

      let schedule: any[] = user.smart_nudge_schedule || [];

      if (!hasValidSchedule) {
        const allUserTasks = tasksByUser[email];

        // Get already-nudged task titles (from existing schedule entries with sent=true)
        const alreadyNudgedIds = schedule
          .filter((e: any) => e.sent && e.task_id)
          .map((e: any) => e.task_id);
        const alreadyNudgedTitles = allUserTasks
          .filter(t => alreadyNudgedIds.includes(t.id))
          .map(t => t.title);

        const localMin = localMinutesOfDay(now, timeZone);
        const newEntries = await generateDailySchedule(
          allUserTasks,
          alreadyNudgedTitles,
          localMin,
          timeZone,
          startMin,
          endMin,
          subtasksByParent
        );

        if (!newEntries || newEntries.length === 0) continue;

        // Merge: keep sent entries (for history/dedup), add new ones
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

      // Send due nudges in real-time (no LLM call — just OneSignal)
      let updated = false;
      let lastSentTaskId: string | null = null;
      for (const entry of schedule) {
        if (entry.sent) continue;
        if (new Date(entry.send_at).getTime() > now.getTime()) continue; // not due yet

        // Skip if task is completed (ghost-notification guard)
        if (completedTaskIds.has(entry.task_id)) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'completed';
          updated = true;
          continue;
        }

        // Skip if task is silenced (back burner)
        if (silencedTaskIds.has(entry.task_id)) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'silenced';
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

function formatDateShort(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function daysUntil(iso: string, now: Date, timeZone: string): number {
  try {
    const target = new Date(iso);
    const targetStr = getLocalDateString(target, timeZone);
    const nowStr = getLocalDateString(now, timeZone);
    const t = new Date(targetStr + 'T00:00:00');
    const n = new Date(nowStr + 'T00:00:00');
    return Math.round((t.getTime() - n.getTime()) / (24 * 60 * 60 * 1000));
  } catch {
    return NaN;
  }
}

// Correct time-of-day words in an LLM-generated nudge title so they match the
// actual send time.
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
  quietEndMin: number,
  subtasksByParent: Record<string, any[]>
): Promise<any[] | null> {
  const hour = Math.floor(localMin / 60);
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const timeStr = formatTime(localMin);
  const quietStartStr = formatTime(quietStartMin);
  const quietEndStr = formatTime(quietEndMin);
  const now = new Date();

  // Build the full task list for the LLM — every task with its metadata so the
  // LLM can see the week ahead and decide what's relevant today.
  const taskList = tasks.map((t, i) => {
    let dueInfo = 'no due date';
    if (t.due_date) {
      const days = daysUntil(t.due_date, now, timeZone);
      if (t.day_only_task) {
        dueInfo = days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : days > 0 ? `due in ${days} days (${formatDateShort(t.due_date, timeZone)})` : `OVERDUE by ${Math.abs(days)} day(s)`;
      } else {
        dueInfo = days === 0 ? 'deadline today' : days === 1 ? 'deadline tomorrow' : days > 0 ? `deadline in ${days} days (${formatDateShort(t.due_date, timeZone)})` : `OVERDUE by ${Math.abs(days)} day(s)`;
      }
    }
    let windowInfo = '';
    if (t.start_date && t.due_date) {
      windowInfo = ` [working window: ${formatDateShort(t.start_date, timeZone)} → ${formatDateShort(t.due_date, timeZone)}]`;
    }
    const nudged = alreadyNudgedTitles.includes(t.title) ? ' — ALREADY NUDGED TODAY' : '';
    // Due-date push count — lets the LLM spot chronically postponed tasks and
    // suggest breaking them down or acknowledging the avoidance pattern.
    const pushInfo = (t.due_date_pushes || 0) > 0 ? `, pushed ${t.due_date_pushes}x` : '';
    // Sub-task progress — lets the LLM acknowledge where the user is in a
    // multi-step task (e.g. "you've got the laundry going — don't forget to
    // move it to the dryer"). Only sub-tasks that belong to THIS parent.
    const subs = (subtasksByParent[t.id] || []).sort((a: any, b: any) => (a.subtask_order || 0) - (b.subtask_order || 0));
    let subInfo = '';
    if (subs.length > 0) {
      const done = subs.filter((s: any) => s.status === 'completed');
      const remaining = subs.filter((s: any) => s.status !== 'completed');
      const steps = subs.map((s: any) => s.status === 'completed' ? `✓${s.title}` : `○${s.title}`).join(', ');
      subInfo = ` [${done.length}/${subs.length} steps done: ${steps}]`;
    }
    return `${i + 1}. "${t.title}" (${dueInfo}${windowInfo}, priority: ${t.urgency || 'medium'}, energy: ${t.energy_required || 'medium'}${pushInfo}${nudged}${subInfo})`;
  }).join('\n');

  const urgentCount = tasks.filter(t => t.urgency === 'urgent').length;

  const prompt = `You are the personal assistant to a brilliant but disorganized ADHD boss. Your job: look at their full task list and decide what reminders they need TODAY — what to surface, when, and what to say.

You're not annoying. You don't flood them. You make sure everything gets done and all deadlines are met. You intelligently figure out what to bring in front of them and when — like a great assistant who knows when to push and when to back off.

CURRENT CONTEXT:
- Current time: ${timeStr} (${timeOfDay})
- Timezone: ${timeZone}
- Quiet hours: ${quietStartStr} - ${quietEndStr} (never schedule during these)

FULL TASK LIST (you decide what's relevant today — you have the week ahead):
${taskList}
${alreadyNudgedTitles.length > 0 ? `\nTASKS ALREADY NUDGED TODAY (use check-in style — "Have you done X yet?"):\n${alreadyNudgedTitles.map(t => `- "${t}"`).join('\n')}\n` : ''}
YOUR APPROACH:
- You can see the whole week. Plan TODAY's reminders — what to surface, when, what to say.
- MEET ALL DEADLINES: if something is due today or tomorrow, it must be surfaced. If something is overdue, surface it with urgency.
- DON'T LET THINGS SNEAK UP: if a deadline is 2-3 days out and the task is high-priority, a heads-up today is smart. If it's a week+ out, hold off unless it's urgent.
- NOT EVERY TASK NEEDS A NUDGE TODAY: a low-priority task with no deadline can wait. Use judgment — you're the assistant, you decide what matters now.
- DON'T BE ANNOYING: fewer, well-timed, meaningful nudges. Not one per hour. Not one per task. If only low-priority stuff remains, ONE combined heads-up is better than a nudge per task.
- For tasks ALREADY NUDGED: check-in style ("Have you done X yet?") — supportive, never shaming.
- For URGENT tasks: surface them with direct urgency ("Hey, this one's urgent — you've got this 💪").
${urgentCount >= 2 ? `- There are ${urgentCount} URGENT tasks. Consider one notification that says "You have multiple urgent tasks — let's pick one to start" and briefly mention them (task_index: 0).\n` : ''}- Morning (before noon): encourage easy wins to build momentum.
- Afternoon (noon-5pm): keep momentum going.
- Evening (after 5pm): surface the most urgent remaining tasks.
- Each notification body: ONE supportive sentence. Warm, like a friend. Never productivity-shame. Never say "you should" or "you need to".
- SUB-TASK PROGRESS: when a task shows step progress (✓/○), use it to acknowledge where they are — e.g. "you've got the laundry going — don't forget to move it to the dryer" or "great progress on printing — just the label left to ship". Never list every step; just acknowledge the current spot naturally.
- PUSHED TASKS: when a task shows "pushed Nx" (the user moved its due date later N times), it's being avoided. Don't shame — gently name it: "this one's been bumped a few times — want to break it into a tiny first step?" or "no rush, but this keeps getting pushed — is it still something you actually want to do?" Higher push counts deserve more attention but never guilt.
- delay_minutes: minutes from NOW to send this nudge (e.g., 30 = 30 min from now, 120 = 2 hours from now).
- Don't schedule past quiet hours start (${quietStartStr}).
- You decide HOW MANY nudges. There's no cap, no formula. Use your judgment — some days need 2, some need 6.

Return ONLY valid JSON:
{
  "nudges": [
    {
      "task_index": <1-based index of the task, or 0 for a combined/multiple-urgent message>,
      "delay_minutes": <minutes from now>,
      "title": "<2-6 words with emoji>",
      "body": "<one supportive sentence>",
      "rationale": "<one short phrase: why this nudge, why this time>"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an ADHD productivity companion — a personal assistant to a disorganized but brilliant boss. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 600,
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
        rationale: n.rationale || '',
        sent: false,
        sent_at: null,
      };
    }).filter((e: any) => new Date(e.send_at).getTime() > nowMs); // drop any that landed in the past

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