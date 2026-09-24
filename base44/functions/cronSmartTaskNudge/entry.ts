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
import { getProximity, formatProximityNotes } from '../../shared/mapsDistance.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { listAll } from '../../shared/listAll.ts';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();

    // 1. Get all users
    const allUsers = await listAll(base44.asServiceRole.entities.User);
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Get all tasks — group smart-nudge tasks by recipient, track completed/silenced
    // EVERY task, paged — not "the 500 most recently updated". Completed tasks
    // are needed too (completedTaskIds below), so this is not filtered to active.
    const allTasks = await listAll(base44.asServiceRole.entities.Task);
    const taskById = new Map<string, any>();
    for (const t of allTasks) if (t && t.id) taskById.set(t.id, t);
    const tasksByUser: Record<string, any[]> = {};
    // Today's fixed appointments/events per user — NOT nudged (they have their own
    // reminder flow), but given to the LLM as context so it can suggest batching
    // errands around a trip the user is already making.
    const eventsByUser: Record<string, any[]> = {};
    const completedTaskIds = new Set<string>();
    const silencedTaskIds = new Set<string>();

    // Explicit recurring intervals (10min..every_other_day, including 2hours/4hours
    // when the user explicitly asked "every 2 hours") are handled by the refill cron
    // with their own OneSignal notifications — exclude them so the LLM doesn't ALSO
    // nudge them (duplicate notifications). "once" = one-time precise (own flow).
    // Events, birthdays, and day-only-night-before are also excluded.
    const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
    // Smart nudges own everything EXCEPT three things: birthdays, events, and a
    // task pinned to a specific clock time. A DAY-ONLY task ("do X tomorrow")
    // has no time — it is exactly what smart nudges are for, even though the
    // capture pipeline stores it with reminder_interval 'once'. Requiring a
    // null interval silently excluded every day-only task from the pool.
    const isSmartNudgeTask = (t: any) =>
      t.status === 'active' &&
      !t.silenced &&
      !t.parent_task_id && // sub-tasks are context for their parent, not independent nudges
      !RECURRING_INTERVALS.has(t.reminder_interval) && // explicit intervals have their own refill flow
      // A 'once' task is only excluded when it really IS pinned to a clock time.
      // A timeless 'once' task (no day-only flag, no reminder time, no event
      // time) has nothing booked for it, so excluding it left it with no
      // sender at all — those belong in the nudge pool.
      // Pinned while its reminder time is still ahead; once that time has
      // passed and it isn't done, it's overdue and the nudges take it over.
      // (That hand-off used to happen by wiping next_reminder after the time
      // passed, which erased the task's time — the date now stays.)
      !(t.reminder_interval === 'once' && !t.day_only_task &&
        ((t.next_reminder && new Date(t.next_reminder).getTime() > now.getTime()) || t.event_time)) &&
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
      if (
        task.status === 'active' &&
        !task.silenced &&
        !task.parent_task_id &&
        task.classification === 'event' &&
        (task.event_time || task.next_reminder)
      ) {
        if (!eventsByUser[email]) eventsByUser[email] = [];
        eventsByUser[email].push(task);
      }
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
      // Quiet hours are PER USER. If the user hasn't turned them on, there is no
      // quiet window at all — a 0/0 window makes isInQuietHours/adjustForQuietHours
      // no-ops, so someone who works until midnight still gets same-day nudges.
      const quietEnabled = !!user.quiet_hours_enabled;
      const startMin = quietEnabled ? parseHHMM(user.quiet_hours_start || '22:00') : 0;
      const endMin = quietEnabled ? parseHHMM(user.quiet_hours_end || '08:00') : 0;
      if (isInQuietHours(now, startMin, endMin, timeZone)) continue;

      const todayStr = getLocalDateString(now, timeZone);

      // Regenerate once per day, or when dirty (new task, urgency change, silence/reactivate)
      const hasValidSchedule = user.smart_nudge_schedule_date === todayStr &&
                               !user.smart_nudge_schedule_dirty &&
                               user.smart_nudge_schedule?.length > 0;

      let schedule: any[] = user.smart_nudge_schedule || [];

      // A second look. The day's plan is made once, so when every nudge in it
      // has gone out and a task it nudged is still open, nothing else came for
      // the rest of the day — the planner never found out its nudge didn't do
      // the job (a new user's "take my Zoloft" got one morning nudge, then
      // silence). So once today's plan has run out, a task it nudged is still
      // open, the last nudge was at least 3 hours ago and there's an hour or
      // more before quiet hours, the planner is asked again. It sees those
      // tasks as already nudged and decides for itself whether a check-in is
      // worth it. At most once every 3 hours.
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      const todaysEntries = schedule.filter((e: any) =>
        e.send_at && getLocalDateString(new Date(e.send_at), timeZone) === todayStr);
      const openTaskIds = new Set(tasksByUser[email].map((t: any) => t.id));
      const planRanOut = todaysEntries.length > 0 && todaysEntries.every((e: any) => e.sent);
      const nudgedStillOpen = todaysEntries.some((e: any) =>
        e.sent && !e.skipped_reason &&
        ((e.task_ids && e.task_ids.length) ? e.task_ids : [e.task_id]).some((id: string) => id && openTaskIds.has(id)));
      const lastSentMs = Math.max(0, ...todaysEntries
        .filter((e: any) => e.sent_at && !e.skipped_reason)
        .map((e: any) => Date.parse(e.sent_at) || 0));
      const lastPlannedMs = Date.parse(user.smart_nudge_planned_at || '') || 0;
      const nowLocalMin = localMinutesOfDay(now, timeZone);
      const minsBeforeQuiet = (startMin !== endMin && startMin > nowLocalMin)
        ? startMin - nowLocalMin
        : 24 * 60 - nowLocalMin;
      const secondLook = hasValidSchedule && planRanOut && nudgedStillOpen &&
        now.getTime() - lastSentMs >= THREE_HOURS &&
        now.getTime() - lastPlannedMs >= THREE_HOURS &&
        minsBeforeQuiet >= 60;

      if (!hasValidSchedule || secondLook) {
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
          subtasksByParent,
          (eventsByUser[email] || []).filter(e =>
            isSameLocalDay(new Date(e.event_time || e.next_reminder), now, timeZone)
          ),
          getHomeOrigin(user),
          user.about_me || '',
          user.commute_avoid_tolls === true
        );

        if (!newEntries || newEntries.length === 0) {
          // Nothing more today: note the look so it isn't asked again every run.
          if (secondLook) {
            try {
              await base44.asServiceRole.entities.User.update(user.id, { smart_nudge_planned_at: now.toISOString() });
            } catch (e) {
              console.error(`[SMART NUDGE] Failed to note second look for ${email}:`, e);
            }
          }
          continue;
        }

        // Merge: keep sent entries (for history/dedup), add new ones
        const sentEntries = schedule.filter((e: any) => e.sent);
        schedule = [...sentEntries, ...newEntries];

        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            smart_nudge_schedule: schedule,
            smart_nudge_schedule_date: todayStr,
            smart_nudge_schedule_dirty: false,
            smart_nudge_planned_at: now.toISOString(),
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

        // Ghost-notification guard. A nudge can reference SEVERAL tasks (a
        // combined "recycling and dishes" message), so validate every task the
        // wording names — not just the one we deep-link to. If any of them is
        // already done or back-burnered, the message is stale and would tell
        // the user to do something they finished hours ago.
        const referencedIds: string[] = (entry.task_ids && entry.task_ids.length)
          ? entry.task_ids
          : (entry.task_id ? [entry.task_id] : []);

        if (referencedIds.some((id: string) => completedTaskIds.has(id))) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'completed';
          updated = true;
          continue;
        }

        if (referencedIds.some((id: string) => silencedTaskIds.has(id))) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'silenced';
          updated = true;
          continue;
        }

        // Send ledger: if another push (a pre-booked reminder, the digest, a
        // text follow-up) lands within ~20 min, hold this nudge for the next
        // run rather than stacking two notifications.
        const gate = await ledgerCheck(base44, { email, taskId: entry.task_id, kind: 'smart_nudge' });
        if (!gate.allowed) {
          console.log(`[SMART NUDGE] Held nudge for ${email} (${gate.reason}) — will retry next run`);
          break;
        }

        // Which nudges ring OUT LOUD on a phone set to full-screen reminders
        // (the push asks to ring on arrival, like the commute "leave now"):
        // a task due today; every day of a working window (start → due); every
        // nudge about a task with NO date at all (there is no "day it's about",
        // so each nudge is a do-it-now — the priority decides how often it is
        // nudged, not how loud); and any high-priority or urgent dated task
        // that isn't pinned to a later day — a deadline's run-up or an overdue
        // task. A heads-up about a task tied to a later day stays a regular
        // notification. Same rule as the app's own alarm list
        // (widgetBridge.ringsOutLoud).
        const nudgedTask = entry.task_id ? taskById.get(entry.task_id) : null;
        const alarmStyle = nudgedTask
          ? (nudgedTask.alert_style === 'alarm' || (nudgedTask.alert_style !== 'notification' && user.alarm_mode === 'alarm'))
          : false;
        let ringsOutLoud = false;
        if (nudgedTask && alarmStyle) {
          const due = nudgedTask.due_date ? new Date(nudgedTask.due_date) : null;
          const dueToday = !!(due && isSameLocalDay(due, now, timeZone));
          const start = nudgedTask.start_date ? new Date(nudgedTask.start_date) : null;
          const inWindow = !!(start && due && start.getTime() <= now.getTime() && now.getTime() <= due.getTime());
          const pressing = nudgedTask.urgency === 'high' || nudgedTask.urgency === 'urgent';
          // "By Friday" is a deadline; a task pinned to a clock time is a moment.
          const isDeadline = nudgedTask.deadline_style === 'by' || (!!due && !nudgedTask.event_time && nudgedTask.reminder_interval !== 'once');
          // Tied to one later day ("on Friday"): nothing to do until then, so
          // its earlier heads-ups stay pushes whatever the priority.
          const pinnedLater = !!due && !isDeadline && !dueToday && due.getTime() > now.getTime();
          const noDate = !due && !nudgedTask.event_time;
          ringsOutLoud = dueToday || inWindow || noDate || (pressing && !pinnedLater);
        }
        const sent = await sendNudgeNotification(email, entry.title, entry.body, entry.task_id, ringsOutLoud);
        if (sent) {
          await ledgerRecord(base44, { email, taskId: entry.task_id, kind: 'smart_nudge', source: 'cronSmartTaskNudge', notificationId: sent, title: entry.title });
          entry.sent = true;
          entry.sent_at = now.toISOString();
          updated = true;
          lastSentTaskId = entry.task_id;
          nudgesSent++;
          results.push({ email, title: entry.title, type: entry.type });
          console.log(`[SMART NUDGE] Sent to ${email}: "${entry.title}" (${entry.type})`);
          // ONE nudge per user per run. Two notifications arriving in the same
          // minute is exactly the flood this system exists to prevent — any
          // other due entries wait for the next run instead of stacking.
          break;
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
    // Also swap a mismatched time-of-day emoji ("Afternoon Chores 🌙") to match.
    const correctEmoji = hour < 12 ? '🌅' : hour < 17 ? '☀️' : '🌙';
    return title
      .replace(/\bMorning\b/g, correct)
      .replace(/\bAfternoon\b/g, correct)
      .replace(/\bEvening\b/g, correct)
      .replace(/🌅|🌄|🌞|☀️|🌇|🌆|🌙|🌜|🌛|🌚/g, correctEmoji);
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
  subtasksByParent: Record<string, any[]>,
  todaysEvents: any[] = [],
  homeOrigin: string = '',
  aboutMe: string = '',
  // The user's toll answer from Places: errand distances are measured the
  // same way their commute is, on toll-free routes when they said so.
  avoidTolls: boolean = false
): Promise<any[] | null> {
  const hour = Math.floor(localMin / 60);
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const timeStr = formatTime(localMin);
  // A 0/0 window means the user has quiet hours turned OFF — the day runs to midnight.
  const noQuietHours = quietStartMin === quietEndMin;
  const quietStartStr = formatTime(quietStartMin);
  const quietEndStr = formatTime(quietEndMin);
  const cutoffLabel = noQuietHours ? 'midnight' : `quiet hours (${quietStartStr})`;
  const now = new Date();

  // Build the full task list for the LLM — every task with its metadata so the
  // LLM can see the week ahead and decide what's relevant today.
  // How much of today is left before quiet hours — a due-today task at 8 PM
  // with quiet hours at 9 PM has ONE hour, not "the rest of the day".
  const minsLeftToday = Math.max(0, (quietStartMin > localMin ? quietStartMin : 24 * 60) - localMin);
  const hoursLeftStr = minsLeftToday < 60 ? `${minsLeftToday} minutes` : `${Math.round(minsLeftToday / 60 * 10) / 10} hours`;

  // Hard filter, not a prompt instruction: a day-tied task ("do X on Nov 1")
  // cannot be acted on early, so it must never reach the LLM until the night
  // before. The prompt said as much and the model still nudged a form that
  // wasn't due for two months — so this is enforced in code now.
  const nudgeable = tasks.filter((t) => {
    if (!t.due_date || !t.day_only_task) return true;
    if (t.deadline_style === 'by') return true; // deadlines get runway
    const days = daysUntil(t.due_date, now, timeZone);
    return !(Number.isFinite(days) && days > 1);
  });
  if (nudgeable.length === 0) return [];
  tasks = nudgeable;

  // The already-nudged list is a SECOND way a task reaches the LLM, and it was
  // built from the unfiltered list — so a task the filter just excluded came
  // back in as "check in on this one" and got re-nudged every regeneration.
  // Only tasks still in the nudgeable pool may appear there.
  alreadyNudgedTitles = alreadyNudgedTitles.filter((title) =>
    tasks.some((t) => t.title === title)
  );

  const taskList = tasks.map((t, i) => {
    let dueInfo = 'no due date';
    if (t.due_date) {
      const days = daysUntil(t.due_date, now, timeZone);
      if (days === 0) {
        dueInfo = `⚠️ DUE TODAY — only ${hoursLeftStr} left before ${cutoffLabel}. Must be nudged in this window.`;
      } else
      if (t.day_only_task && t.deadline_style === 'by') {
        // DEADLINE: the work can happen any time before this date, so lead-up
        // nudges are appropriate and expected.
        dueInfo = days === 0 ? 'DEADLINE: must be finished TODAY' : days === 1 ? 'DEADLINE: must be finished by tomorrow' : days > 0 ? `DEADLINE in ${days} days (${formatDateShort(t.due_date, timeZone)}) — can be worked on any time before then` : `OVERDUE by ${Math.abs(days)} day(s)`;
      } else if (t.day_only_task) {
        // "ON that day": nothing can be done sooner — do not nudge early.
        dueInfo = days === 0 ? 'HAPPENS TODAY (tied to today only)' : days === 1 ? 'happens TOMORROW (tied to that day — do not nudge before then except a night-before heads-up)' : days > 0 ? `happens in ${days} days on ${formatDateShort(t.due_date, timeZone)} (tied to that specific day — cannot be done sooner)` : `OVERDUE by ${Math.abs(days)} day(s)`;
      } else {
        // A plain due date is a DEADLINE too — the work can start any time
        // before it — so label it the same way the day-only deadlines are
        // labelled, or the runway rules below never applied to it.
        dueInfo = days === 0 ? 'DEADLINE: must be finished TODAY' : days === 1 ? 'DEADLINE: must be finished by tomorrow' : days > 0 ? `DEADLINE in ${days} days (${formatDateShort(t.due_date, timeZone)}) — can be worked on any time before then` : `OVERDUE by ${Math.abs(days)} day(s)`;
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
    const desc = (t.description || t.notes || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    const descInfo = desc ? ` — ${desc}` : '';
    // Location is only ever present when the user explicitly entered one.
    const loc = (t.location || '').trim();
    const locInfo = loc ? `, LOCATION: ${loc}` : '';
    // The boss's own instruction about reminding this one, when they gave one.
    const wish = String(t.reminder_wish || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const wishInfo = wish ? `, REMINDER WISH: "${wish}"` : '';
    return `${i + 1}. "${t.title}"${descInfo} (${dueInfo}${windowInfo}, priority: ${t.urgency || 'medium'}, energy: ${t.energy_required || 'medium'}${locInfo}${pushInfo}${wishInfo}${nudged}${subInfo})`;
  }).join('\n');

  const urgentCount = tasks.filter(t => t.urgency === 'urgent').length;

  // Measured driving distances between the locations the user explicitly typed
  // in. Without this the LLM can only ask "if these are near each other…";
  // with it, it can say whether they actually are.
  // Today's appointments count too: an errand near a place the user is already
  // driving to is the strongest same-trip suggestion there is, so event
  // locations go into the same matrix as task locations.
  // Only appointments at a normal errand hour (8 AM – 6 PM local) can anchor a
  // "stop by on the way" suggestion — nobody wants to be told to grab cat food
  // on the way to a 9 PM event.
  const eventLocalHour = (e: any) => {
    const when = e.event_time || e.next_reminder;
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(new Date(when)), 10);
    } catch { return -1; }
  };
  const isErrandFriendly = (e: any) => { const h = eventLocalHour(e); return h >= 8 && h < 18; };

  let proximityNotes = '';
  const located = [...tasks, ...todaysEvents.filter(isErrandFriendly)]
    .map(t => (t.location || '').trim())
    .filter(Boolean);
  if (located.length >= 2 || (located.length === 1 && homeOrigin)) {
    const prox = await getProximity(located, homeOrigin, null, { avoidTolls });
    proximityNotes = formatProximityNotes(prox);
  }

  // Fixed appointments today — context only, never nudged here.
  const eventList = todaysEvents.map((e) => {
    const when = e.event_time || e.next_reminder;
    let t = '';
    try {
      t = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(when));
    } catch { t = ''; }
    const loc = (e.location || '').trim();
    const offHours = loc && !isErrandFriendly(e) ? ' — OFF-HOURS: never pair an errand with this one' : '';
    return `- "${e.title}" at ${t}${loc ? `, LOCATION: ${loc}` : ''}${offHours}`;
  }).join('\n');

  const prompt = `You are the personal assistant to a brilliant but disorganized ADHD boss. Your job: look at their full task list and decide what reminders they need TODAY — what to surface, when, and what to say.

You're not annoying. You don't flood them. You make sure everything gets done and all deadlines are met. You intelligently figure out what to bring in front of them and when — like a great assistant who knows when to push and when to back off.

CURRENT CONTEXT:
- Current time: ${timeStr} (${timeOfDay})
- Timezone: ${timeZone}
${aboutMe.trim() ? `- ABOUT YOUR BOSS, in their own words: ${aboutMe.trim()}\n  Use this only to judge what a task really involves and how much it matters to THEM. Never quote it back at them in a notification.\n` : ''}- Quiet hours: ${noQuietHours ? 'NONE — this user has quiet hours turned off and is often up until around midnight, so late-evening nudges are welcome' : `${quietStartStr} - ${quietEndStr} (never schedule during these)`}

FULL TASK LIST (you decide what's relevant today — you have the week ahead):
${taskList}
${eventList ? `\nFIXED APPOINTMENTS TODAY (context only — do NOT nudge these, they have their own reminders):\n${eventList}\n` : ''}${proximityNotes ? `\n${proximityNotes}\n` : ''}${alreadyNudgedTitles.length > 0 ? `\nTASKS ALREADY NUDGED TODAY (use check-in style — "Have you done X yet?"):\n${alreadyNudgedTitles.map(t => `- "${t}"`).join('\n')}\n` : ''}
YOUR APPROACH:
- A REMINDER WISH on a task is the boss's own instruction about how, when or how often to nudge THAT task ("keep reminding me until I finish", "just once", "don't bug me before noon", "only on weekdays"). Obey it over every rule below for that task: it sets the count, the spacing and the earliest hour. Where the wish is silent, the rules below apply.
- You can see the whole week. Plan TODAY's reminders — what to surface, when, what to say.
- MEET ALL DEADLINES: if something is due today or tomorrow, it must be surfaced. If something is overdue, surface it with urgency.
- DUE TODAY IS NON-NEGOTIABLE: every "DUE TODAY" task gets a nudge, and its FIRST nudge lands within the next 30-60 minutes — the boss said it has to happen today, so the window is closing whether the task is dishes or taxes. If less than 2 hours remain before ${cutoffLabel}, nudge it within 15 minutes and, if it's still open, once more about halfway to ${cutoffLabel}. The task's stored priority doesn't lower this — a same-day deadline outranks priority.
- WEIGH THE WHOLE TASK, EVERY TIME. Whether to nudge it today, at what time of day, and how many times all come out of the same four things together:
  * THE DUE DATE — how many days are left, and whether it's a deadline (work can start early) or tied to one day. Closer = more often; nothing due for a week+ gets at most an occasional heads-up.
  * THE PRIORITY the boss set — every nudge spends some of their patience, and once they start swiping without reading, all of them stop working. Priority is how much of that patience a task is worth: low means barely any, urgent means spend it freely because this is the thing that matters this week. Urgent/high earns more frequent and earlier nudges than low/medium at the same distance. A low-priority thing due in 5 days can wait; an urgent one due in 5 days gets started now. And a high-priority or urgent task with NO date is not a someday — nothing is pinning it, so it's a do-it-now that deserves at least as much of today as an urgent one due Friday.
  * WHAT THE TITLE AND DESCRIPTION ACTUALLY SAY — how much work it is, and whether it depends on a business, an office, or another person (those need daytime hours and more lead time than something doable from the couch).
  * THE ENERGY LEVEL — high-energy tasks belong earlier in the day; low-energy ones fit fine in the evening.
  A close due date on a big or business-dependent task can mean several nudges across today; a far-off low-priority one-liner means none. Never pick a frequency from the due date alone or the priority alone.
- DON'T LET THINGS SNEAK UP: if a deadline is 2-3 days out and the task is high-priority, a heads-up today is smart. If it's a week+ out, hold off unless it's urgent.
- "DEADLINE in N days" vs "happens on [day]" — TREAT THESE COMPLETELY DIFFERENTLY:
  * DEADLINE tasks can be worked on ahead of time, so give them RUNWAY. The app already sends every deadline a fixed heads-up the evening before and one at 9 AM on the due day — those two are not yours to repeat; the run-up and the rest of the due day are. How much runway depends on how much work the task actually is — judge that from the task itself: a one-step thing (pay a bill, send an email, book something online) needs 1-2 days; an errand or anything involving another person, an office, or paperwork needs 3-5 days; a genuinely big multi-step job (taxes, a report, applications, packing, cleaning out a room) deserves nudges starting a week or two out, framed around ONE small first step. Never let a big deadline task get its first nudge the day before.
  * "happens on [day]" tasks are tied to that specific day and CANNOT be done sooner — do not nudge in the days leading up (at most a heads-up the night before). Nudging early just makes the user feel behind on something they can't act on yet.
- NOT EVERY TASK NEEDS A NUDGE TODAY: a low-priority task with no deadline can wait. Use judgment — you're the assistant, you decide what matters now.
- A TASK WITH NO DATE ISN'T A SOMEDAY. People rarely put a day on everyday things: "remind me to take my pills", "feed the cat", "call the vet" almost always mean today, and the app lists a task with no date under Today. Unless it's low priority or plainly a someday idea, plan it as one of today's: nudge it, and when it's the kind of thing that really does need doing today, also plan a friendly check-in later in the day in case it's still open. You usually plan only once a day, so plan that follow-up now. Anything they finish first is skipped automatically, so a check-in never lands on something already done.
- NO EMPTY NOTIFICATIONS: every nudge must be about at least one specific task and name it in the body. Never send generic filler like "quick check on your tasks", "nothing urgent today", or an "energy boost" — a notification that doesn't tell the boss what to do is noise. If nothing genuinely needs surfacing today, return {"nudges": []}.
- DON'T BE ANNOYING: fewer, well-timed, meaningful nudges. Not one per hour. Not one per task. If only low-priority stuff remains, ONE combined heads-up is better than a nudge per task.
- For tasks ALREADY NUDGED: check-in style ("Have you done X yet?") — supportive, never shaming.
- For URGENT tasks: surface them with direct urgency ("Hey, this one's urgent — you've got this 💪").
- THE WORD "URGENT" BELONGS TO THE BOSS, NOT YOU: only call a task urgent (in the title OR body) when its stored priority is literally "urgent". A close deadline on a low/medium-priority task is surfaced by naming the timing ("due tomorrow", "last day for this") — never by relabeling it urgent, high-priority, or critical. The boss set that priority on purpose; contradicting it feels like nagging.
${urgentCount >= 2 ? `- There are ${urgentCount} URGENT tasks. Consider one notification that says "You have multiple urgent tasks — let's pick one to start" and briefly mention them (task_index: 0).\n` : ''}- Morning (before noon): encourage easy wins to build momentum.
- Afternoon (noon-5pm): keep momentum going.
- Evening (after 5pm): surface the most urgent remaining tasks.
- Each notification body: ONE supportive sentence. Warm, like a friend. Never productivity-shame. Never say "you should" or "you need to".
- NEVER INVENT PROGRESS: only ✓ steps are done. If 0 steps are done, do NOT imply they've started ("you're halfway there", "next up") — point at the FIRST step instead. Never name a step as "next" unless every step before it is ✓.
- SUB-TASK PROGRESS: when a task shows step progress (✓/○), use it to acknowledge where they are — e.g. "you've got the laundry going — don't forget to move it to the dryer" or "great progress on printing — just the label left to ship". Never list every step; just acknowledge the current spot naturally.
- PUSHED TASKS: when a task shows "pushed Nx" (the user moved its due date later N times), it's being avoided. Don't shame — gently name it: "this one's been bumped a few times — want to break it into a tiny first step?" or "no rush, but this keeps getting pushed — is it still something you actually want to do?" Higher push counts deserve more attention but never guilt.
- LOCATION IS DATA, NOT A GUESS. A task has a location ONLY if the task line shows an explicit "LOCATION: ..." value (the user typed it in themselves). No LOCATION field = no location, period. Tasks with no LOCATION field NEVER get a "combine errands" / same-trip suggestion, no matter what their title sounds like.${homeOrigin ? ` The user's home base is known and the "home →" distances above are measured from it — use them, and never mention coordinates or the home location itself in a notification.` : ''}
- NEVER ASSUME A TASK MEANS LEAVING THE HOUSE. Most things can be done online, by phone, or at home — ordering, booking, paying, renewing, even "getting" something. A task only counts as an out-of-the-house errand when the wording SAYS SO: it explicitly uses a go-somewhere verb ("drop off", "pick up in store", "return to the store", "mail", "go to", "stop by", "drive to", "test drive", "in-person appointment"), or it explicitly names a physical place the user is going to ("at the DMV", "the dealership on Main"). A bare name, a brand, a store name, or a person's name is NOT enough — "Get Trevi" or "Men's Warehouse" could easily be an online order or a phone call. Energy level says nothing about location. If it's not explicit, it is NOT an errand.
- BATCH ERRANDS (two birds, one trip): only ever suggest this when TWO OR MORE tasks each carry an explicit LOCATION field (or one located task lines up with a FIXED APPOINTMENT today) — time it shortly BEFORE the appointment so they can plan. If you're inferring the location from a name or from the task's wording, do NOT send this nudge at all. List every task you mention in task_indexes.
  * If a REAL DRIVING DISTANCES block is present above, USE IT — it's measured, and it covers APPOINTMENT locations as well as task locations, so "that's 5 minutes from your dentist" is a fact you can state when the pair is listed. Only suggest combining when the pair is marked "SAME TRIP" or "reasonable to combine", and you may state the real number ("they're only 6 minutes apart"). Never suggest combining a pair marked "NOT worth combining", and never state a distance that isn't in that block.
  * If there is NO distances block, frame it as a decline-able question ("If the dealership is anywhere near your dentist, you could knock both out in one trip — worth it?") and never state a drive time.
  * NEVER suggest combining two FIXED APPOINTMENTS with each other — they have set times and can't be "knocked out" together. Pairing is only ever an errand (a TASK with a LOCATION) tacked onto ONE appointment, on the way there or on the way back.
  * TIME OF DAY MATTERS: only pair an errand with an appointment that falls at a normal errand hour (8 AM – 6 PM). Assume a business could be closed outside that window — many close by 6 PM, and we don't know the specific store's hours. An appointment marked OFF-HOURS is never an anchor — stores are closed or it's just a weird time to run errands. Don't suggest an errand for a moment when the place is likely closed.
- LATE EVENING (after 8 PM local): only nudge things that can actually be done right then — at home, online, or by phone. Anything that would mean buying something, going somewhere, or dealing with a business or another person is not actionable at that hour, so hold it for the morning instead. And never word a late nudge as if they can go get it now ("grab that on your way") — if you surface a shopping-type task late, frame it as ordering it or lining it up for tomorrow.
- delay_minutes: minutes from NOW to send this nudge (e.g., 30 = 30 min from now, 120 = 2 hours from now).
- Don't schedule past ${cutoffLabel}.
- You decide HOW MANY nudges. There's no cap, no formula. Use your judgment — some days need 2, some need 6.

Return ONLY valid JSON:
{
  "nudges": [
    {
      "task_index": <1-based index of the task, or 0 for a combined/multiple-urgent message>,
      "task_indexes": [<REQUIRED: the 1-based index of EVERY task this message refers to. For a single-task nudge this is just [that index]. For a combined message it MUST list all of them — if the body says "recycling and dishes", list both. Never omit a task you named in the body; a task left out here can be completed and still get nudged>],
      "delay_minutes": <minutes from now>,
      "title": "<2-6 words with emoji — the emoji must only reflect what the task literally says. Never guess what a name is: 'feed Tabitha' could be a cat, a baby, or a sourdough starter, so a proper name or ambiguous subject gets a neutral emoji (📌 ⏰ ✨ 🔔), never a species/gender/object guess>",
      "body": "<one supportive sentence>",
      "rationale": "<one short phrase: why this nudge, why this time>"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      // Deciding WHAT to surface today, WHEN, and how often is the heaviest
      // judgment call in the app — it runs on the strongest model available.
      // Astra is a reasoning model: it rejects a custom temperature, and
      // reasoning tokens count against the completion budget, so that budget
      // has to be far larger than the visible output.
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: 'You are an ADHD productivity companion — a personal assistant to a disorganized but brilliant boss. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const nudges = parsed.nudges || [];

    // Convert to schedule entries
    const nowMs = Date.now();

    const entries = nudges.map((n: any) => {
      const task = n.task_index > 0 ? tasks[n.task_index - 1] : null;
      const taskId = task?.id || null;

      // Every task this nudge's wording refers to — so the send-time guard can
      // suppress a combined message when ANY of the named tasks is already done.
      const referenced = Array.isArray(n.task_indexes) ? n.task_indexes : [n.task_index];
      const taskIds = Array.from(new Set(
        referenced
          .map((i: any) => tasks[Number(i) - 1]?.id)
          .filter(Boolean)
      ));
      if (taskIds.length === 0 && taskId) taskIds.push(taskId);
      const delayMs = Math.max(1, (n.delay_minutes || 30)) * 60 * 1000;
      let sendAt = new Date(nowMs + delayMs);

      // Adjust for quiet hours (don't send during quiet hours)
      sendAt = adjustForQuietHours(sendAt, quietStartMin, quietEndMin, timeZone);

      return {
        task_id: taskId || taskIds[0] || null,
        task_ids: taskIds,
        send_at: sendAt.toISOString(),
        title: fixTitleTimeOfDay(n.title || 'Task nudge', sendAt, timeZone),
        body: n.body || '',
        type: n.type || 'initial',
        rationale: n.rationale || '',
        sent: false,
        sent_at: null,
      };
    })
      // A nudge that isn't tied to any real task is filler ("quick check on
      // your tasks — nothing urgent!") — drop it rather than send noise.
      .filter((e: any) => e.task_ids.length > 0)
      .filter((e: any) => new Date(e.send_at).getTime() > nowMs); // drop any that landed in the past

    // Space nudges out so two never land at (or near) the same time. The LLM
    // sometimes gives several nudges the same delay_minutes, which arrives as a
    // stack of notifications — overwhelming instead of helpful.
    const MIN_GAP_MS = 45 * 60 * 1000;
    entries.sort((a: any, b: any) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime());
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].send_at).getTime();
      const cur = new Date(entries[i].send_at).getTime();
      if (cur - prev < MIN_GAP_MS) {
        let pushed = new Date(prev + MIN_GAP_MS);
        pushed = adjustForQuietHours(pushed, quietStartMin, quietEndMin, timeZone);
        entries[i].send_at = pushed.toISOString();
        entries[i].title = fixTitleTimeOfDay(entries[i].title, pushed, timeZone);
      }
    }

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
  taskId: string,
  ringAsAlarm: boolean = false
): Promise<string | false> {
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
  if (ringAsAlarm) {
    // Rings the moment it arrives on a build that can (PushFilter); older
    // builds show it as a normal push. High priority so Doze delivers it now.
    payload.data.alarm = true;
    payload.priority = 10;
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
    return result.id || 'sent';
  } catch (e) {
    console.error(`[SMART NUDGE] Failed to send to ${email}:`, e);
    return false;
  }
}