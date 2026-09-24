// Smart nudges — the app's reminders for nearly every task.
//
// Smart nudges own every task EXCEPT: birthdays, events, a one-time task pinned
// to a clock time the user said it happens AT ("call mom at 5") while that time
// is still ahead, and a task where the user asked for their own repeat rhythm
// ("every 20 minutes", "keep reminding me until I finish"), which the refill
// cron sends. Everything else — a time or no time, a date or no date — is
// here: "by 5 PM" deadlines, "by Friday" deadlines, day-only tasks, dateless
// tasks, and an "at" task whose time went by without it being done (from that
// moment it's overdue, and more pressing, not less).
//
// The LLM acts as a personal assistant to a disorganized ADHD boss: it sees
// the whole list with everything known about each task and about the person,
// looks at the week ahead, and decides what to surface TODAY, when, and what
// to say. No caps, no rigid formulas.
//
// Re-planning: once a day, and again whenever something the planner reads has
// changed since the last plan — a task added or edited (onTaskUpdate marks
// that and asks for a re-plan right away: a request naming one person, which
// only plans), or an "at" task's time going by. Only the scheduled runs SEND,
// one nudge per person per run, checked against completion at send time.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { localMinutesOfDay, parseHHMM, isInQuietHours, adjustForQuietHours } from '../../shared/quietHours.ts';
import { getProximity, formatProximityNotes } from '../../shared/mapsDistance.ts';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { listAll, filterAll } from '../../shared/listAll.ts';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

const DAY_MS = 24 * 60 * 60 * 1000;
// Sent nudges are kept this long (for "last nudged 3 days ago"), then dropped.
const HISTORY_KEEP_MS = 7 * DAY_MS;
// A nudge already queued to go out this soon survives a re-plan. Edits can
// re-plan every run; without this a nudge planned "in 40 minutes" could be
// pushed back again and again and never go out.
const QUEUED_KEEP_MS = 35 * 60 * 1000;

// Base44 timestamps can come back without a zone marker; they are UTC.
function utcMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);

// The clock moment a one-time task is set for: its reminder time (what the
// user picked; it wins over a stale event time), else its event time.
function pinnedMoment(t: any): number {
  const ms = utcMs(t.next_reminder || t.event_time);
  return Number.isFinite(ms) ? ms : NaN;
}
// "By 5 PM" / "before noon Friday": a deadline with a clock time.
function isClockDeadline(t: any): boolean {
  return t.reminder_interval === 'once' && !t.day_only_task && t.deadline_style === 'by';
}
// "At 5 PM": a one-time task that happens at a clock time.
function isAtTime(t: any): boolean {
  return t.reminder_interval === 'once' && !t.day_only_task && t.deadline_style !== 'by';
}

// The refill cron sends a user-asked rhythm ("every hour") — except for a
// dateless one made before 2026-09-24, which it leaves alone (keep in step
// with cronRefillReminders' rhythmOwnedHere), and a task with no recipient.
// Those would get nothing from anyone, so they're smart nudges.
const RHYTHM_OWNED_SINCE = Date.parse('2026-09-24T00:00:00Z');
function refillSendsRhythm(t: any): boolean {
  if (!t.notification_recipient_email) return false;
  const dateless = !t.due_date && !t.event_time && !t.start_date && !t.day_only_task;
  if (!dateless) return true;
  const created = utcMs(t.created_date);
  return Number.isFinite(created) && created >= RHYTHM_OWNED_SINCE;
}

// Whose task it is. Completing a task clears its recipient and un-completing
// it used to leave it cleared, so an active top-level task with no recipient
// falls back to the account that made it.
function recipientOf(t: any): string | null {
  if (t.notification_recipient_email) return t.notification_recipient_email;
  if (t.status === 'active' && !t.parent_task_id && t.created_by) return t.created_by;
  return null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date();
    const nowMs = now.getTime();

    // A request naming one person comes from onTaskUpdate right after they
    // changed something: re-plan just them, now, if their plan is out of
    // date. It never sends — sending stays with the scheduled runs (which
    // send no body), so two runs can never send the same nudge.
    let onlyEmail = '';
    try {
      const body = await req.json();
      if (body && typeof body.email === 'string') onlyEmail = body.email.trim();
    } catch { /* scheduled run: no body */ }

    // 1. Users
    const allUsers = onlyEmail
      ? await base44.asServiceRole.entities.User.filter({ email: onlyEmail })
      : await listAll(base44.asServiceRole.entities.User);
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    // 2. Tasks — EVERY task, paged (completed ones too: completedTaskIds and
    // the done-today context below need them).
    const allTasks = onlyEmail
      ? await filterAll(base44.asServiceRole.entities.Task, { created_by: onlyEmail })
      : await listAll(base44.asServiceRole.entities.Task);
    const taskById = new Map<string, any>();
    for (const t of allTasks) if (t && t.id) taskById.set(t.id, t);
    const tasksByUser: Record<string, any[]> = {};
    // Fixed appointments per user — never nudged here (they have their own
    // reminders), but the planner sees today's and the coming week's.
    const eventsByUser: Record<string, any[]> = {};
    const completedTaskIds = new Set<string>();
    const silencedTaskIds = new Set<string>();
    // Finished top-level tasks per user: when (for her rule that a person's
    // own history only shapes their reminders after 10 finished tasks spread
    // over at least a week) and what (today's, as context).
    const completionsByUser: Record<string, { at: number; title: string }[]> = {};

    // Work shifts (for people whose schedule changes week to week), from
    // yesterday on.
    const shiftsByUser: Record<string, any[]> = {};
    try {
      const since = new Date(nowMs - DAY_MS).toISOString().slice(0, 10);
      const shifts = await filterAll(base44.asServiceRole.entities.WorkShift,
        onlyEmail ? { created_by: onlyEmail, shift_date: { $gte: since } } : { shift_date: { $gte: since } });
      for (const s of shifts) {
        if (!s?.created_by) continue;
        (shiftsByUser[s.created_by] ||= []).push(s);
      }
    } catch (e) {
      console.error('[SMART NUDGE] Work shifts unavailable:', e);
    }

    // Smart nudges own everything EXCEPT birthdays, events, an "at" task
    // whose time is still ahead, and a user-asked rhythm the refill cron sends
    // (see the notes at the top). A 'once' task is pinned only while its time
    // is ahead: once that passes and it isn't done, it's overdue and it's
    // ours. A "by" clock deadline is never pinned — its whole run-up is ours.
    // (This used to exclude any 'once' task with an event_time forever, and a
    // task captured from outside the app gets an event_time for any clock
    // time, so those were never handed over.)
    const isSmartNudgeTask = (t: any) =>
      t.status === 'active' &&
      !t.silenced &&
      !t.parent_task_id && // sub-tasks are context for their parent, not independent nudges
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person &&
      (!RECURRING_INTERVALS.has(t.reminder_interval) || !refillSendsRhythm(t)) &&
      !(isAtTime(t) && pinnedMoment(t) > nowMs);

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
        if (!task.parent_task_id && task.created_by) {
          // updated_date is the server's own clock; completed_at is written by
          // the phone in more than one format (some local time marked UTC).
          const at = utcMs(task.updated_date || task.completed_at);
          if (Number.isFinite(at)) (completionsByUser[task.created_by] ||= []).push({ at, title: task.title || '' });
        }
      }
      if (task.silenced) {
        silencedTaskIds.add(task.id);
      }
      const email = recipientOf(task);
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
    const runStartIso = now.toISOString();

    // Her rule: a person's own history only shapes their reminders once they
    // have finished 10 tasks spread over at least a week. Until then everyone
    // gets the same defaults, so the planner isn't shown how they've reacted.
    const hasEnoughHistory = (email: string) => {
      const list = completionsByUser[email] || [];
      if (list.length < 10) return false;
      let first = Infinity;
      let last = -Infinity;
      for (const c of list) {
        if (c.at < first) first = c.at;
        if (c.at > last) last = c.at;
      }
      return last - first >= 7 * DAY_MS;
    };

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
      const pool = tasksByUser[email];
      const openTaskIds = new Set(pool.map((t: any) => t.id));

      // The plan (written only by planners) and the log of what was sent or
      // skipped (written only by the sending run). What was sent is read from
      // the log, so a re-plan written at the same moment as a send can never
      // make a sent nudge look unsent and go out twice. Sent nudges older
      // than a week are dropped; the rest is history.
      const sentLog = pruneSentLog(user.smart_nudge_sent_log || [], nowMs);
      let schedule: any[] = applySentLog(pruneHistory(user.smart_nudge_schedule || [], nowMs), sentLog);

      // Is the plan out of date? Something the planner reads changed after it
      // was made: onTaskUpdate marked it (the flag, or a newer mark time), a
      // task was added after it, or an "at" task's time went by without it
      // being done — it just joined the pool as overdue and has to be planned
      // now, not tomorrow.
      const plannedAtMs = utcMs(user.smart_nudge_planned_at) || 0;
      const dirtyAtMs = utcMs(user.smart_nudge_dirty_at);
      const joinedSincePlan = pool.some((t: any) => {
        if (isAtTime(t)) {
          const at = pinnedMoment(t);
          if (Number.isFinite(at) && at > plannedAtMs && at <= nowMs) return true;
        }
        const created = utcMs(t.created_date);
        return Number.isFinite(created) && created > plannedAtMs;
      });
      // …or something the planner reads on a task (or its steps) is different
      // from what the plan was made from, however it changed — a date moved on
      // the task card never tells onTaskUpdate, for one. Each plan stores a
      // short fingerprint of every task it saw; bookkeeping (booked pushes,
      // swipe counters, a rhythm's next ping) isn't part of it.
      const prints = currentPrints(pool, subtasksByParent);
      const storedPrints = user.smart_nudge_plan_prints && typeof user.smart_nudge_plan_prints === 'object'
        ? user.smart_nudge_plan_prints : null;
      const changedSincePlan = !!storedPrints && Object.entries(prints).some(([id, fp]) => storedPrints[id] !== fp);
      const stale = !!user.smart_nudge_schedule_dirty ||
        (Number.isFinite(dirtyAtMs) && dirtyAtMs > plannedAtMs) ||
        joinedSincePlan || changedSincePlan;
      const hasValidSchedule = user.smart_nudge_schedule_date === todayStr && !stale && schedule.length > 0;

      // A one-person request only re-plans an out-of-date plan.
      if (onlyEmail && hasValidSchedule) continue;

      // A second look. The day's plan is made once, so when every nudge in it
      // has gone out and a task it nudged is still open, nothing else came for
      // the rest of the day — the planner never found out its nudge didn't do
      // the job (a new user's "take my Zoloft" got one morning nudge, then
      // silence). So once today's plan has run out, a task it nudged is still
      // open, the last nudge went out at least an hour ago and there's an hour
      // or more before quiet hours, the planner is asked again. It sees those
      // tasks as already nudged and decides for itself whether a check-in is
      // worth it, and when. At most once every 90 minutes. (It was 3 hours
      // after the last nudge, which put a missed morning pill's check-in in
      // the afternoon.)
      const SINCE_LAST_NUDGE = 60 * 60 * 1000;
      const SINCE_LAST_LOOK = 90 * 60 * 1000;
      const todaysEntries = schedule.filter((e: any) =>
        e.send_at && getLocalDateString(new Date(utcMs(e.send_at)), timeZone) === todayStr);
      const planRanOut = todaysEntries.length > 0 && todaysEntries.every((e: any) => e.sent);
      const nudgedStillOpen = todaysEntries.some((e: any) =>
        e.sent && !e.skipped_reason && entryTaskIds(e).some((id: string) => openTaskIds.has(id)));
      const lastSentMs = Math.max(0, ...todaysEntries
        .filter((e: any) => e.sent_at && !e.skipped_reason)
        .map((e: any) => utcMs(e.sent_at) || 0));
      const nowLocalMin = localMinutesOfDay(now, timeZone);
      const minsBeforeQuiet = (startMin !== endMin && startMin > nowLocalMin)
        ? startMin - nowLocalMin
        : 24 * 60 - nowLocalMin;
      const secondLook = !onlyEmail && hasValidSchedule && planRanOut && nudgedStillOpen &&
        nowMs - lastSentMs >= SINCE_LAST_NUDGE &&
        nowMs - plannedAtMs >= SINCE_LAST_LOOK &&
        minsBeforeQuiet >= 60;

      if (!hasValidSchedule || secondLook) {
        // Nudges from today already queued to go out within the next half
        // hour stay queued (the planner is told about them), as long as every
        // task they name is still open and still ours. Anything left over from
        // an earlier day is dropped, as before.
        const queued = schedule.filter((e: any) => {
          if (e.sent) return false;
          const at = utcMs(e.send_at);
          const ids = entryTaskIds(e);
          return Number.isFinite(at) && at <= nowMs + QUEUED_KEEP_MS &&
            getLocalDateString(new Date(at), timeZone) === todayStr &&
            ids.length > 0 && ids.every((id: string) => openTaskIds.has(id));
        });

        const localMin = localMinutesOfDay(now, timeZone);
        const newEntries = await generateDailySchedule(pool, {
          localMin,
          timeZone,
          quietStartMin: startMin,
          quietEndMin: endMin,
          subtasksByParent,
          events: eventsByUser[email] || [],
          homeOrigin: getHomeOrigin(user),
          aboutMe: user.about_me || '',
          avoidTolls: user.commute_avoid_tolls === true,
          nudgeHistory: nudgeHistoryFor(schedule, todayStr, timeZone),
          queued,
          // Nudges that went out in the last 45 minutes: new ones keep their distance.
          recentSent: schedule
            .filter((e: any) => e.sent && !e.skipped_reason)
            .map((e: any) => utcMs(e.sent_at || e.send_at))
            .filter((ms: number) => Number.isFinite(ms) && nowMs - ms < 45 * 60 * 1000),
          work: workContext(user, shiftsByUser[email] || [], now, timeZone),
          doneToday: (completionsByUser[email] || [])
            .filter((c) => getLocalDateString(new Date(c.at), timeZone) === todayStr)
            .sort((a, b) => a.at - b.at)
            .map((c) => c.title)
            .filter(Boolean),
          showReactions: hasEnoughHistory(email),
        });

        // null = the planner failed: change nothing, send what's already
        // planned, and try again next run (the plan is still out of date).
        if (newEntries !== null) {
          // Write the new plan without losing anything another run did in the
          // meantime: re-read the person, keep their sent history, and step
          // aside if someone planned from newer information than ours.
          const fresh = await freshUser(base44, user);
          const freshLog = pruneSentLog(fresh?.smart_nudge_sent_log || sentLog, nowMs);
          const freshSchedule = applySentLog(pruneHistory(fresh?.smart_nudge_schedule || schedule, nowMs), freshLog);
          const freshPlannedMs = utcMs(fresh?.smart_nudge_planned_at);
          const firstPlanToday = user.smart_nudge_schedule_date !== todayStr;
          if (Number.isFinite(freshPlannedMs) && freshPlannedMs > utcMs(runStartIso)) {
            console.log(`[SMART NUDGE] ${email}: a newer plan was written meanwhile — keeping it`);
            schedule = freshSchedule;
          } else if (newEntries.length === 0 && secondLook) {
            // Nothing more today: note the look so it isn't asked again every run.
            try {
              await base44.asServiceRole.entities.User.update(user.id, { smart_nudge_planned_at: runStartIso });
            } catch (e) {
              console.error(`[SMART NUDGE] Failed to note second look for ${email}:`, e);
            }
          } else if (newEntries.length === 0 && firstPlanToday) {
            // Nothing planned for a new day: as before, ask again next run.
          } else {
            // A re-plan that adds nothing still replaces the old plan (what's
            // queued stays), so an out-of-date plan never keeps being redone
            // while nothing goes out.
            const stillQueued = queued.filter((e: any) => !freshLog.some((l: any) => l.k === entryKey(e)));
            schedule = mergeEntries([...freshSchedule.filter((e: any) => e.sent), ...stillQueued, ...newEntries]);
            // A change marked after we read the tasks isn't in this plan: leave
            // it marked so the next run re-plans with it.
            const freshDirtyMs = utcMs(fresh?.smart_nudge_dirty_at);
            const stillDirty = Number.isFinite(freshDirtyMs) && freshDirtyMs > utcMs(runStartIso);
            try {
              await base44.asServiceRole.entities.User.update(user.id, {
                smart_nudge_schedule: schedule,
                smart_nudge_schedule_date: todayStr,
                smart_nudge_schedule_dirty: stillDirty,
                smart_nudge_planned_at: runStartIso,
                smart_nudge_plan_prints: prints,
              });
              schedulesGenerated++;
              console.log(`[SMART NUDGE] ${onlyEmail ? 'Re-planned' : 'Generated schedule'} for ${email}: ${newEntries.length} new nudge(s), ${stillQueued.length} kept`);
            } catch (e) {
              console.error(`[SMART NUDGE] Failed to store schedule for ${email}:`, e);
            }
          }
        }
      }

      // A one-person request never sends (see the top).
      if (onlyEmail) continue;

      // Send due nudges in real-time (no LLM call — just OneSignal)
      const newLog: any[] = [];
      let lastSentTaskId: string | null = null;
      for (const entry of schedule) {
        if (entry.sent) continue;
        if (utcMs(entry.send_at) > nowMs) continue; // not due yet
        // Never a leftover from an earlier day ("tonight…" said the next morning).
        if (getLocalDateString(new Date(utcMs(entry.send_at)), timeZone) !== todayStr) continue;

        // Ghost-notification guard. A nudge can reference SEVERAL tasks (a
        // combined "recycling and dishes" message), so validate every task the
        // wording names — not just the one we deep-link to. If any of them is
        // already done or back-burnered, the message is stale and would tell
        // the user to do something they finished hours ago.
        const referencedIds: string[] = entryTaskIds(entry);

        if (referencedIds.some((id: string) => completedTaskIds.has(id))) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'completed';
          newLog.push({ k: entryKey(entry), at: entry.sent_at, skip: 'completed' });
          continue;
        }

        if (referencedIds.some((id: string) => silencedTaskIds.has(id))) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          entry.skipped_reason = 'silenced';
          newLog.push({ k: entryKey(entry), at: entry.sent_at, skip: 'silenced' });
          continue;
        }

        // Send ledger: if another push (a pre-booked reminder, the digest, a
        // text follow-up) lands within ~20 min, hold this nudge for the next
        // run rather than stacking two notifications.
        // Already sent by another run (two runs overlapping)? The send ledger
        // has every smart nudge that went out: the same nudge (task + title)
        // recorded since it was due is this one.
        if (await alreadyInLedger(base44, email, entry)) {
          entry.sent = true;
          entry.sent_at = now.toISOString();
          newLog.push({ k: entryKey(entry), at: entry.sent_at });
          continue;
        }

        const gate = await ledgerCheck(base44, { email, taskId: entry.task_id, kind: 'smart_nudge' });
        if (!gate.allowed) {
          console.log(`[SMART NUDGE] Held nudge for ${email} (${gate.reason}) — will retry next run`);
          break;
        }

        // Which nudges ring OUT LOUD on a phone set to full-screen reminders
        // (the push asks to ring on arrival, like the commute "leave now"):
        // anything overdue (a missed clock time, a deadline gone by); a task
        // due today or with a clock deadline today; every day of a working
        // window (start → due); every nudge about a task with NO date at all
        // (there is no "day it's about", so each nudge is a do-it-now — the
        // priority decides how often it is nudged, not how loud); and any
        // high-priority or urgent dated task that isn't pinned to a later day
        // — a deadline's run-up. A heads-up about a task tied to a later day
        // stays a regular notification. Same idea as the app's own alarm list
        // (widgetBridge.ringsOutLoud).
        const nudgedTask = entry.task_id ? taskById.get(entry.task_id) : null;
        const alarmStyle = nudgedTask
          ? (nudgedTask.alert_style === 'alarm' || (nudgedTask.alert_style !== 'notification' && user.alarm_mode === 'alarm'))
          : false;
        let ringsOutLoud = false;
        if (nudgedTask && alarmStyle) {
          const due = nudgedTask.due_date ? new Date(utcMs(nudgedTask.due_date)) : null;
          const pin = pinnedMoment(nudgedTask);
          const clockTask = isClockDeadline(nudgedTask) || isAtTime(nudgedTask);
          const anchorMs = clockTask && Number.isFinite(pin) ? pin : (due ? due.getTime() : NaN);
          const dueToday = Number.isFinite(anchorMs) && isSameLocalDay(new Date(anchorMs), now, timeZone);
          const overdue = Number.isFinite(anchorMs) && anchorMs <= nowMs;
          const start = nudgedTask.start_date ? new Date(utcMs(nudgedTask.start_date)) : null;
          const inWindow = !!(start && due && start.getTime() <= nowMs && nowMs <= due.getTime());
          const pressing = nudgedTask.urgency === 'high' || nudgedTask.urgency === 'urgent';
          // "By Friday" is a deadline; "on Friday" / "at 3" is a moment.
          const isDeadline = nudgedTask.deadline_style === 'by' || (!!due && !nudgedTask.event_time && nudgedTask.reminder_interval !== 'once');
          // Tied to one later day ("on Friday"): nothing to do until then, so
          // its earlier heads-ups stay pushes whatever the priority.
          const pinnedLater = Number.isFinite(anchorMs) && !isDeadline && !dueToday && anchorMs > nowMs;
          const noDate = !Number.isFinite(anchorMs);
          ringsOutLoud = overdue || dueToday || inWindow || noDate || (pressing && !pinnedLater);
        }
        const sent = await sendNudgeNotification(email, entry.title, entry.body, entry.task_id, ringsOutLoud);
        if (sent) {
          await ledgerRecord(base44, { email, taskId: entry.task_id, kind: 'smart_nudge', source: 'cronSmartTaskNudge', notificationId: sent, title: entry.title });
          entry.sent = true;
          entry.sent_at = now.toISOString();
          newLog.push({ k: entryKey(entry), at: entry.sent_at });
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

      // Record what was sent or skipped in the log (only this run writes it;
      // the plan itself is left to the planners).
      if (newLog.length > 0) {
        const fresh = await freshUser(base44, user);
        const updateData: any = {
          smart_nudge_sent_log: pruneSentLog([...(fresh?.smart_nudge_sent_log || sentLog), ...newLog], nowMs),
        };
        if (lastSentTaskId) {
          updateData.last_smart_nudge_task_id = lastSentTaskId;
          updateData.last_smart_nudge_at = now.toISOString();
        }
        try {
          await base44.asServiceRole.entities.User.update(user.id, updateData);
        } catch (e) {
          console.error(`[SMART NUDGE] Failed to record sent nudges for ${email}:`, e);
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

// ── Nudge history ────────────────────────────────────────────────────────────

// Every task a nudge's wording names (a combined "recycling and dishes" nudge
// names two).
function entryTaskIds(e: any): string[] {
  const ids = (e?.task_ids && e.task_ids.length) ? e.task_ids : [e?.task_id];
  return ids.filter(Boolean);
}

// Identifies one planned nudge across re-reads.
function entryKey(e: any): string {
  return `${e?.send_at || ''}|${e?.task_id || ''}|${e?.title || ''}`;
}

// Sent nudges older than a week are dropped (they used to pile up forever, and
// every one of them was later described to the planner as "nudged today").
function pruneHistory(schedule: any[], nowMs: number): any[] {
  return (Array.isArray(schedule) ? schedule : []).filter((e: any) => {
    if (!e?.sent) return true;
    const at = utcMs(e.sent_at || e.send_at);
    return !Number.isFinite(at) || nowMs - at <= HISTORY_KEEP_MS;
  });
}

// The sent log: { k: entryKey, at: when it went out (or was skipped), skip?:
// why it was skipped }. A week of it is kept.
function pruneSentLog(log: any[], nowMs: number): any[] {
  const seen = new Set<string>();
  return (Array.isArray(log) ? log : []).filter((l: any) => {
    if (!l?.k || seen.has(l.k)) return false;
    seen.add(l.k);
    const at = utcMs(l.at);
    return !Number.isFinite(at) || nowMs - at <= HISTORY_KEEP_MS;
  });
}

// Marks every planned nudge the log says went out (or was skipped).
function applySentLog(schedule: any[], log: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const l of log || []) if (l?.k) byKey.set(l.k, l);
  return (schedule || []).map((e: any) => {
    const l = byKey.get(entryKey(e));
    if (!l) return e;
    return { ...e, sent: true, sent_at: e.sent_at || l.at, ...(l.skip ? { skipped_reason: l.skip } : {}) };
  });
}

// One entry per nudge; a copy marked sent wins over an unsent one.
function mergeEntries(list: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const e of list) {
    const k = entryKey(e);
    const had = byKey.get(k);
    if (!had || (!had.sent && e.sent)) byKey.set(k, e);
  }
  return [...byKey.values()].sort((a, b) => (utcMs(a.send_at) || 0) - (utcMs(b.send_at) || 0));
}

async function freshUser(base44: any, user: any): Promise<any | null> {
  try {
    const rows = await base44.asServiceRole.entities.User.filter({ email: user.email });
    return rows?.[0] || null;
  } catch (e) {
    console.error('[SMART NUDGE] Could not re-read', user.email, e);
    return null;
  }
}

// What the planner reads on a task, boiled down to a short fingerprint, so a
// change of any kind (however it was made) is noticed. Not the bookkeeping:
// booked pushes, swipe/snooze counters, a rhythm task's moving next ping.
const PRINT_FIELDS = [
  'title', 'description', 'notes', 'original_input', 'urgency', 'energy_required',
  'due_date', 'start_date', 'next_reminder', 'event_time', 'anchor_time', 'day_only_task',
  'deadline_style', 'location', 'reminder_wish', 'classification', 'life_area',
  'recurrence_pattern', 'recurrence_days', 'reminder_interval', 'due_date_pushes',
];
function hashString(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function currentPrints(pool: any[], subtasksByParent: Record<string, any[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of pool) {
    const rhythm = RECURRING_INTERVALS.has(t.reminder_interval);
    const fields = PRINT_FIELDS.map((f) => (rhythm && f === 'next_reminder') ? null : (t[f] ?? null));
    const steps = (subtasksByParent[t.id] || [])
      .map((x: any) => `${x.id}:${x.status}:${x.title}`)
      .sort();
    out[t.id] = hashString(JSON.stringify([fields, steps]));
  }
  return out;
}

async function alreadyInLedger(base44: any, email: string, entry: any): Promise<boolean> {
  try {
    const rows = await base44.asServiceRole.entities.NotificationLedger.filter({
      user_email: email,
      task_id: entry.task_id || '',
      kind: 'smart_nudge',
    }, '-created_date', 20);
    const due = utcMs(entry.send_at);
    const title = String(entry.title || '').slice(0, 120);
    return (rows || []).some((r: any) => r.title === title && utcMs(r.send_at) >= due - 60 * 1000);
  } catch {
    return false; // never let a lookup failure silence a nudge
  }
}

// Per task: when it was nudged today, and the last time before today.
function nudgeHistoryFor(schedule: any[], todayStr: string, timeZone: string) {
  const out = new Map<string, { today: number[]; lastBefore: number }>();
  for (const e of schedule || []) {
    if (!e?.sent || e.skipped_reason) continue;
    const at = utcMs(e.sent_at || e.send_at);
    if (!Number.isFinite(at)) continue;
    const isToday = getLocalDateString(new Date(at), timeZone) === todayStr;
    for (const id of entryTaskIds(e)) {
      const h = out.get(id) || { today: [], lastBefore: NaN };
      if (isToday) h.today.push(at);
      else if (!(h.lastBefore >= at)) h.lastBefore = at;
      out.set(id, h);
    }
  }
  return out;
}

// ── Work ─────────────────────────────────────────────────────────────────────

function hhmmLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// The next seven days of the person's work schedule, in either shape the app
// saves: the same days every week (on the profile) or dated shifts entered a
// week at a time (WorkShift).
function workContext(user: any, shifts: any[], now: Date, timeZone: string) {
  const [y, mo, d] = getLocalDateString(now, timeZone).split('-').map(Number);
  const varies = (user?.work_schedule_mode || 'fixed') === 'varies';
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.UTC(y, mo - 1, d + i, 12));
    const key = day.toISOString().slice(0, 10);
    let start = '';
    let end = '';
    if (varies) {
      const s = (shifts || []).find((x: any) => x.shift_date === key);
      start = s?.arrive_by || '';
      end = s?.ends_at || '';
    } else {
      const f = (user?.work_fixed_days || []).find((x: any) => Number(x.day) === day.getUTCDay());
      start = f?.arrive_by || '';
      end = f?.ends_at || '';
    }
    if (!hhmmLabel(start)) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
      : day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
    lines.push(`${label}: ${hhmmLabel(start)}${hhmmLabel(end) ? ` – ${hhmmLabel(end)}` : ' (end time not saved)'}`);
  }
  return {
    lines,
    remote: user?.work_remote === true,
    quietAtWork: user?.work_quiet_enabled === true,
  };
}

// ── The planner ──────────────────────────────────────────────────────────────

const INTERVAL_WORDS: Record<string, string> = {
  '10min': '10 minutes', '20min': '20 minutes', '30min': '30 minutes', '1hour': 'hour',
  '2hours': '2 hours', '4hours': '4 hours', daily: 'day', every_other_day: 'other day',
};

function recurrenceLabel(t: any): string {
  const p = t.recurrence_pattern;
  if (!p || p === 'none') return '';
  if (p === 'weekly' && Array.isArray(t.recurrence_days) && t.recurrence_days.length) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `every ${t.recurrence_days.map((n: number) => names[n]).filter(Boolean).join(', ')}`;
  }
  return String(p).replace(/_/g, ' ');
}

interface PlanContext {
  localMin: number;
  timeZone: string;
  quietStartMin: number;
  quietEndMin: number;
  subtasksByParent: Record<string, any[]>;
  events: any[];
  homeOrigin: string;
  aboutMe: string;
  avoidTolls: boolean;
  nudgeHistory: Map<string, { today: number[]; lastBefore: number }>;
  queued: any[];
  recentSent: number[];
  work: { lines: string[]; remote: boolean; quietAtWork: boolean };
  doneToday: string[];
  showReactions: boolean;
}

async function generateDailySchedule(tasks: any[], ctx: PlanContext): Promise<any[] | null> {
  const {
    localMin, timeZone, quietStartMin, quietEndMin, subtasksByParent, events,
    homeOrigin, aboutMe, avoidTolls, nudgeHistory, queued, recentSent, work, doneToday, showReactions,
  } = ctx;
  const hour = Math.floor(localMin / 60);
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const timeStr = formatTime(localMin);
  // A 0/0 window means the user has quiet hours turned OFF — the day runs to midnight.
  const noQuietHours = quietStartMin === quietEndMin;
  const quietStartStr = formatTime(quietStartMin);
  const quietEndStr = formatTime(quietEndMin);
  const cutoffLabel = noQuietHours ? 'midnight' : `quiet hours (${quietStartStr})`;
  const now = new Date();
  const nowMs = now.getTime();
  const todayStr = getLocalDateString(now, timeZone);
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(now);

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

  const clock = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
  const dayWord = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms));
  const daysFromToday = (ms: number) => daysUntil(new Date(ms).toISOString(), now, timeZone);
  const whenLabel = (ms: number) => {
    const d = daysFromToday(ms);
    if (d === 0) return `${clock(ms)} today`;
    if (d === -1) return `yesterday at ${clock(ms)}`;
    if (d === 1) return `tomorrow at ${clock(ms)}`;
    return `${dayWord(ms)} at ${clock(ms)}`;
  };
  const span = (ms: number) => {
    const mins = Math.round(Math.abs(ms) / 60000);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
    const hrs = mins / 60;
    if (hrs < 36) {
      const r = Math.round(hrs * 10) / 10;
      return `${r} hour${r === 1 ? '' : 's'}`;
    }
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  };
  const daysAgoLabel = (ms: number) => {
    const d = -daysFromToday(ms);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  };

  const taskList = tasks.map((t, i) => {
    let dueInfo = 'no due date';
    const pin = pinnedMoment(t);
    if (isClockDeadline(t) && Number.isFinite(pin)) {
      // "By 5 PM": a deadline with a clock time.
      const days = daysFromToday(pin);
      if (pin <= nowMs) {
        dueInfo = `⚠️ OVERDUE — its deadline was ${whenLabel(pin)} (${span(nowMs - pin)} ago) and it isn't done`;
      } else if (days === 0) {
        dueInfo = `⏰ DEADLINE TODAY AT ${clock(pin)} — only ${span(pin - nowMs)} left. A clock deadline: the window closes at ${clock(pin)}, not at bedtime`;
      } else {
        dueInfo = `DEADLINE ${whenLabel(pin)} (in ${days} day${days === 1 ? '' : 's'}) — can be worked on any time before then`;
      }
    } else if (isAtTime(t) && Number.isFinite(pin)) {
      // An "at" task is only in this list once its time has gone by undone.
      dueInfo = `⚠️ OVERDUE — MISSED ITS TIME: it was set for ${whenLabel(pin)} (${span(nowMs - pin)} ago) and hasn't been done`;
    } else if (t.due_date) {
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
    } else if (t.start_date) {
      windowInfo = `, started on it ${formatDateShort(t.start_date, timeZone)}`;
    }
    // The clock time they named, when it isn't already in the line above.
    const anchorInfo = !Number.isFinite(pin) && hhmmLabel(t.anchor_time) ? `, time they named: ${hhmmLabel(t.anchor_time)}` : '';
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
      const steps = subs.map((s: any) => s.status === 'completed' ? `✓${s.title}` : `○${s.title}`).join(', ');
      subInfo = ` [${done.length}/${subs.length} steps done: ${steps}]`;
    }
    const notesText = [t.description, t.notes].map((x) => String(x || '').trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ');
    const descInfo = notesText ? ` — notes: ${notesText.slice(0, 400)}${notesText.length > 400 ? '…' : ''}` : '';
    // What they actually said when they added it, when it says more than the title.
    const said = String(t.original_input || '').trim().replace(/\s+/g, ' ');
    const saidInfo = said && said.toLowerCase() !== String(t.title || '').trim().toLowerCase()
      ? ` — in their words: "${said.slice(0, 300)}${said.length > 300 ? '…' : ''}"`
      : '';
    // Location is only ever present when the user explicitly entered one.
    const loc = (t.location || '').trim();
    const locInfo = loc ? `, LOCATION: ${loc}` : '';
    // The boss's own instruction about reminding this one, when they gave one.
    const wish = String(t.reminder_wish || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const wishInfo = wish ? `, REMINDER WISH: "${wish}"` : '';
    const areaInfo = t.life_area === 'work' ? ', work' : ', personal';
    const billInfo = t.classification === 'payment' ? ', a bill/payment' : '';
    const repeatInfo = recurrenceLabel(t) ? `, repeats ${recurrenceLabel(t)} (this is the current one)` : '';
    const oldRhythmInfo = RECURRING_INTERVALS.has(t.reminder_interval)
      ? `, has an old "every ${INTERVAL_WORDS[t.reminder_interval] || t.reminder_interval}" setting that nothing sends — plan it like any other task`
      : '';
    const created = utcMs(t.created_date);
    const ageInfo = Number.isFinite(created) ? `, added ${daysAgoLabel(created)}` : '';
    const h = nudgeHistory.get(t.id);
    let historyInfo = '';
    if (h && h.today.length) {
      historyInfo = `, NUDGED TODAY at ${[...h.today].sort((a, b) => a - b).map(clock).join(', ')}`;
    } else if (h && Number.isFinite(h.lastBefore)) {
      historyInfo = `, last nudged ${daysAgoLabel(h.lastBefore)} — not yet today`;
    }
    let reactInfo = '';
    if (showReactions) {
      const parts: string[] = [];
      if ((t.dismissed_count || 0) > 0) parts.push(`reminders closed or swiped away ${t.dismissed_count}x`);
      if ((t.snooze_count || 0) > 0) parts.push(`snoozed ${t.snooze_count}x`);
      if ((t.ignored_count || 0) > 0) parts.push(`alarm rang with no answer ${t.ignored_count}x`);
      if (parts.length) reactInfo = `, HOW THEY'VE REACTED: ${parts.join(', ')}`;
    }
    return `${i + 1}. "${t.title}"${descInfo}${saidInfo} (${dueInfo}${windowInfo}, priority: ${t.urgency || 'medium'}, energy: ${t.energy_required || 'medium'}${areaInfo}${billInfo}${repeatInfo}${oldRhythmInfo}${anchorInfo}${locInfo}${ageInfo}${pushInfo}${wishInfo}${historyInfo}${reactInfo}${subInfo})`;
  }).join('\n');

  const urgentCount = tasks.filter(t => t.urgency === 'urgent').length;
  const nudgedTodayTitles = tasks
    .filter((t) => (nudgeHistory.get(t.id)?.today.length || 0) > 0)
    .map((t) => t.title);

  // Appointments: today's (they can anchor a same-trip errand) and the rest
  // of the week (context for prep and timing). Never nudged here.
  const eventMs = (e: any) => utcMs(e.event_time || e.next_reminder);
  const todaysEvents = (events || []).filter((e) => {
    const m = eventMs(e);
    return Number.isFinite(m) && getLocalDateString(new Date(m), timeZone) === todayStr;
  });
  const upcomingEvents = (events || [])
    .filter((e) => {
      const m = eventMs(e);
      if (!Number.isFinite(m)) return false;
      const d = daysFromToday(m);
      return d >= 1 && d <= 7;
    })
    .sort((a, b) => eventMs(a) - eventMs(b))
    .slice(0, 25);

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
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(new Date(eventMs(e))), 10);
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
    let t = '';
    try { t = clock(eventMs(e)); } catch { t = ''; }
    const loc = (e.location || '').trim();
    const offHours = loc && !isErrandFriendly(e) ? ' — OFF-HOURS: never pair an errand with this one' : '';
    return `- "${e.title}" at ${t}${loc ? `, LOCATION: ${loc}` : ''}${offHours}`;
  }).join('\n');
  const upcomingList = upcomingEvents.map((e) => {
    const loc = (e.location || '').trim();
    return `- "${e.title}" ${e.day_only_task ? `${dayWord(eventMs(e))} (all day)` : whenLabel(eventMs(e))}${loc ? `, at ${loc}` : ''}`;
  }).join('\n');

  const workBlock = work.lines.length
    ? `\nWORK SCHEDULE (${work.remote ? 'works from home' : 'goes in to work'}):\n${work.lines.map((l) => `- ${l}`).join('\n')}\n${work.quietAtWork
      ? 'They turned on "don\'t notify me at work": nothing you schedule inside those hours goes out until the shift ends, so plan around them — before work, or after.'
      : 'While they\'re working, only surface what can be done right there or in a minute by phone; save chores, errands and at-home things for before or after work.'}\n`
    : '';
  const doneBlock = doneToday.length
    ? `\nALREADY FINISHED TODAY (context only — good for momentum, never list them back):\n${doneToday.slice(0, 15).map((d) => `- "${d}"`).join('\n')}\n`
    : '';
  const queuedBlock = queued.length
    ? `\nALREADY QUEUED — going out in the next few minutes no matter what (don't plan these again; space anything else around them):\n${queued.map((e) => `- "${e.title}" at ${clock(utcMs(e.send_at))}`).join('\n')}\n`
    : '';

  const prompt = `You are the personal assistant to a brilliant but disorganized ADHD boss. Your job: look at their full task list and decide what reminders they need TODAY — what to surface, when, and what to say.

You're not annoying. You don't flood them. You make sure everything gets done and all deadlines are met. You intelligently figure out what to bring in front of them and when — like a great assistant who knows when to push and when to back off.

CURRENT CONTEXT:
- Today: ${todayLabel}
- Current time: ${timeStr} (${timeOfDay})
- Timezone: ${timeZone}
${aboutMe.trim() ? `- ABOUT YOUR BOSS, in their own words: ${aboutMe.trim()}\n  Use this only to judge what a task really involves and how much it matters to THEM. Never quote it back at them in a notification.\n` : ''}- Quiet hours: ${noQuietHours ? 'NONE — this user has quiet hours turned off and is often up until around midnight, so late-evening nudges are welcome' : `${quietStartStr} - ${quietEndStr} (never schedule during these)`}
${workBlock}
FULL TASK LIST (you decide what's relevant today — you have the week ahead):
${taskList}
${eventList ? `\nFIXED APPOINTMENTS TODAY (context only — do NOT nudge these, they have their own reminders):\n${eventList}\n` : ''}${upcomingList ? `\nCOMING UP THIS WEEK (context only — never nudge these; use them to spot prep a task needs before one, and to judge timing):\n${upcomingList}\n` : ''}${proximityNotes ? `\n${proximityNotes}\n` : ''}${doneBlock}${nudgedTodayTitles.length > 0 ? `\nTASKS ALREADY NUDGED TODAY (use check-in style — "Have you done X yet?"):\n${nudgedTodayTitles.map(t => `- "${t}"`).join('\n')}\n` : ''}${queuedBlock}
YOUR APPROACH:
- USE EVERYTHING ON A TASK'S LINE, together: what they said when they added it ("in their words" — often says more than the title about what it involves, when, and why), the notes, the time they named, whether it's work or personal, whether it's a bill, whether it repeats, how long it has been sitting there, and when you last nudged it. Decide the way an assistant who knew all of that would.
- A REMINDER WISH on a task is the boss's own instruction about how, when or how often to nudge THAT task ("keep reminding me until I finish", "just once", "don't bug me before noon", "only on weekdays"). Obey it over every rule below for that task: it sets the count, the spacing and the earliest hour — and today's date and weekday are at the top. Where the wish is silent, the rules below apply.
- You can see the whole week. Plan TODAY's reminders — what to surface, when, what to say.
- MEET ALL DEADLINES: if something is due today or tomorrow, it must be surfaced. If something is overdue, surface it with urgency.
- DUE TODAY IS NON-NEGOTIABLE: every "DUE TODAY" task gets a nudge, and its FIRST nudge lands within the next 30-60 minutes — the boss said it has to happen today, so the window is closing whether the task is dishes or taxes. If less than 2 hours remain before ${cutoffLabel}, nudge it within 15 minutes and, if it's still open, once more about halfway to ${cutoffLabel}. The task's stored priority doesn't lower this — a same-day deadline outranks priority.
- A DEADLINE WITH A CLOCK TIME ("DEADLINE TODAY AT 5:00 PM") IS TIGHTER THAN "DUE TODAY": the window closes at that time, not at bedtime, so it outranks every plain due-today task with more time left. Nudge it right away (within 15-30 minutes), and plan the rest inside the time left so the last nudge still leaves enough time to actually do it — about an hour before for something quick, earlier for anything bigger or anything that depends on a business or another person. On a later day it's a deadline like any other, with the time it's due by.
- MISSED ITS TIME: the boss set a clock time for it and the time went by without it getting done. That makes it MORE pressing, not less — it's overdue now. Nudge it within the next 15-30 minutes, and if it still needs doing today (pills, a call, a pet, anything someone is waiting on) plan a friendly check-in after that too. Word it kindly: the time just got away from them — never "you missed".
- WEIGH THE WHOLE TASK, EVERY TIME. Whether to nudge it today, at what time of day, and how many times all come out of the same four things together:
  * THE DUE DATE — how many days are left, and whether it's a deadline (work can start early) or tied to one day. Closer = more often; nothing due for a week+ gets at most an occasional heads-up.
  * THE PRIORITY the boss set — every nudge spends some of their patience, and once they start swiping without reading, all of them stop working. Priority is how much of that patience a task is worth: low means barely any, urgent means spend it freely because this is the thing that matters this week. Urgent/high earns more frequent and earlier nudges than low/medium at the same distance. A low-priority thing due in 5 days can wait; an urgent one due in 5 days gets started now. And a high-priority or urgent task with NO date is not a someday — nothing is pinning it, so it's a do-it-now that deserves at least as much of today as an urgent one due Friday.
  * WHAT THE TITLE, THEIR WORDS AND THE NOTES ACTUALLY SAY — how much work it is, and whether it depends on a business, an office, or another person (those need daytime hours and more lead time than something doable from the couch).
  * THE ENERGY LEVEL — high-energy tasks belong earlier in the day; low-energy ones fit fine in the evening.
  A close due date on a big or business-dependent task can mean several nudges across today; a far-off low-priority one-liner means none. Never pick a frequency from the due date alone or the priority alone.
- DON'T LET THINGS SNEAK UP: if a deadline is 2-3 days out and the task is high-priority, a heads-up today is smart. If it's a week+ out, hold off unless it's urgent.
- "DEADLINE in N days" vs "happens on [day]" — TREAT THESE COMPLETELY DIFFERENTLY:
  * DEADLINE tasks can be worked on ahead of time, so give them RUNWAY. The app already sends every deadline a fixed heads-up the evening before and one at 9 AM on the due day (a deadline with a clock time also gets one about an hour before it) — those are not yours to repeat; the run-up and the rest of the due day are. How much runway depends on how much work the task actually is — judge that from the task itself: a one-step thing (pay a bill, send an email, book something online) needs 1-2 days; an errand or anything involving another person, an office, or paperwork needs 3-5 days; a genuinely big multi-step job (taxes, a report, applications, packing, cleaning out a room) deserves nudges starting a week or two out, framed around ONE small first step. Never let a big deadline task get its first nudge the day before.
  * "happens on [day]" tasks are tied to that specific day and CANNOT be done sooner — do not nudge in the days leading up (at most a heads-up the night before). Nudging early just makes the user feel behind on something they can't act on yet.
- NOT EVERY TASK NEEDS A NUDGE TODAY: a low-priority task with no deadline can wait. Use judgment — you're the assistant, you decide what matters now.
- A TASK WITH NO DATE ISN'T A SOMEDAY. People rarely put a day on everyday things: "remind me to take my pills", "feed the cat", "call the vet" almost always mean today, and the app lists a task with no date under Today. Unless it's low priority or plainly a someday idea, plan it as one of today's: nudge it, and when it's the kind of thing that really does need doing today, also plan a friendly check-in in case it's still open. Time that check-in by when the thing is normally done: something most people do first thing (morning pills, feeding a pet, taking something out of the freezer) gets checked on within an hour or two of the first nudge, not in the afternoon. You usually plan only once a day, so plan that follow-up now. Anything they finish first is skipped automatically, so a check-in never lands on something already done.
- A TASK THAT REPEATS (daily pills, weekly trash) is shown as its current occurrence — treat it like any other task with that date and time.
- NUDGE HISTORY: "NUDGED TODAY at …" means it already got nudged today — use check-in style, and space any further nudge well after the last one. "last nudged N days ago — not yet today" means today's first nudge about it is still yours to decide.
${showReactions ? `- HOW THEY'VE REACTED: when a task shows reminders being swiped away, snoozed or left ringing, the reminders aren't landing — change the angle or the time of day (a smaller first step, a different part of the day), not the volume. Never mention these counts to the boss.\n` : ''}${work.lines.length ? `- WORK: respect the WORK SCHEDULE above; a work task belongs in or right around work hours, a personal one outside them unless it takes a minute.\n` : ''}- NO EMPTY NOTIFICATIONS: every nudge must be about at least one specific task and name it in the body. Never send generic filler like "quick check on your tasks", "nothing urgent today", or an "energy boost" — a notification that doesn't tell the boss what to do is noise. If nothing genuinely needs surfacing today, return {"nudges": []}.
- DON'T BE ANNOYING: fewer, well-timed, meaningful nudges. Not one per hour. Not one per task. If only low-priority stuff remains, ONE combined heads-up is better than a nudge per task.
- For tasks ALREADY NUDGED: check-in style ("Have you done X yet?") — supportive, never shaming.
- For URGENT tasks: surface them with direct urgency ("Hey, this one's urgent — you've got this 💪").
- THE WORD "URGENT" BELONGS TO THE BOSS, NOT YOU: only call a task urgent (in the title OR body) when its stored priority is literally "urgent". A close deadline on a low/medium-priority task is surfaced by naming the timing ("due tomorrow", "last day for this", "due by 5") — never by relabeling it urgent, high-priority, or critical. The boss set that priority on purpose; contradicting it feels like nagging.
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

    // Space nudges out so two never land at (or near) the same time — each
    // other, a nudge already queued to go out, or one that just went out. The LLM sometimes gives
    // several nudges the same delay_minutes, which arrives as a stack of
    // notifications — overwhelming instead of helpful.
    const MIN_GAP_MS = 45 * 60 * 1000;
    entries.sort((a: any, b: any) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime());
    const placed: number[] = [
      ...(queued || []).map((e: any) => utcMs(e.send_at)),
      ...(recentSent || []),
    ].filter(Number.isFinite);
    for (const entry of entries) {
      let at = new Date(entry.send_at).getTime();
      for (let guard = 0; guard < 24; guard++) {
        const clash = placed.find((p) => Math.abs(p - at) < MIN_GAP_MS);
        if (clash === undefined) break;
        at = adjustForQuietHours(new Date(clash + MIN_GAP_MS), quietStartMin, quietEndMin, timeZone).getTime();
      }
      if (at !== new Date(entry.send_at).getTime()) {
        entry.send_at = new Date(at).toISOString();
        entry.title = fixTitleTimeOfDay(entry.title, new Date(at), timeZone);
      }
      placed.push(at);
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