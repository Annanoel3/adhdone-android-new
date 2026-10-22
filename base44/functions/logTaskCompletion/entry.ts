import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveQuietHours, adjustForQuietHours, userTimeZone, localDateKey } from '../../shared/quietHours.ts';
import { assignTaskFamilies, judgeCompletionHabit } from '../../shared/runTaskParse.ts';
import { ledgerCancel } from '../../shared/sendLedger.ts';

// Records ONE analytics row when a task is completed, with the reminder history
// that led up to it. Driven by the Task-update workflow rather than the UI,
// because a task can be completed from half a dozen places (card, today's list,
// notification screen, subtask roll-up) and every one of them must be counted.
//
// Deliberately stores no task title or user-written text — only counts, timings
// and flags.
// "45 minutes", "an hour", "an hour and a half", "2 hours" — for the follow-up
// text, which is written when it's booked, so the wait itself is the elapsed time.
function sinceText(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} minutes`;
  if (m < 75) return 'an hour';
  if (m < 105) return 'an hour and a half';
  const h = Math.round(m / 60);
  return `${h} hours`;
}

// Takes back a follow-up booked for a task that is no longer done.
async function cancelPush(base44: any, id: string) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  try {
    await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${key}` },
    });
  } catch (e) {
    console.error('[logTaskCompletion] follow-up cancel failed:', e?.message);
  }
  await ledgerCancel(base44, [id]);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const taskId = body.task_id;
    if (!taskId) return Response.json({ error: 'task_id required' }, { status: 400 });

    const task = await base44.asServiceRole.entities.Task.get(taskId);
    if (!task) return Response.json({ skipped: 'no task' });

    const email = task.notification_recipient_email || task.created_by || '';
    const completedAt = task.completed_at ? new Date(task.completed_at) : new Date();
    const createdAt = new Date(task.created_date);

    // Every push that actually went out for this task before it got done.
    let reminders = [];
    if (email) {
      const ledger = await base44.asServiceRole.entities.NotificationLedger.filter({
        user_email: email,
        task_id: taskId,
      });
      reminders = ledger
        .filter((l) => new Date(l.send_at) <= completedAt)
        .sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
    }

    // The chore's next step, if the parser found one ("Move the laundry to the
    // dryer", 60 minutes after this was marked done). Booked here because this
    // runs for every way a task can be completed. The push carries the task id
    // so the send ledger refuses a second copy if the workflow fires twice.
    const fuTitle = String(task.follow_up_title || '').trim();
    const fuMinutes = Number(task.follow_up_minutes);
    if (email && fuTitle && Number.isFinite(fuMinutes) && fuMinutes >= 5 && fuMinutes <= 1440) {
      try {
        const owner = (await base44.asServiceRole.entities.User.filter({ email }))?.[0] || null;
        // Not in the middle of the night: a follow-up that would land in the
        // owner's quiet hours waits until they end, like every other reminder.
        // The text says how long ago it really was by then.
        const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(owner);
        let sendAt = new Date(Date.now() + Math.round(fuMinutes) * 60000);
        if (quietEnabled) sendAt = adjustForQuietHours(sendAt, startMin, endMin, userTimeZone(owner));
        const waitMinutes = (sendAt.getTime() - Date.now()) / 60000;
        // Rings out loud only the way this task's own reminders do: the task's
        // own switch wins ("notification" = never an alarm), else the account
        // default.
        const data: Record<string, unknown> = { type: 'follow_up', taskId };
        if (task.alert_style === 'alarm' || (task.alert_style !== 'notification' && owner?.alarm_mode === 'alarm')) data.alarm = true;
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: Deno.env.get('CRON_SECRET'),
          toUserExternalId: email,
          title: fuTitle,
          body: `You finished "${task.title}" ${sinceText(waitMinutes)} ago.`,
          sendAtISO: sendAt.toISOString(),
          data,
        });
        const followUpId = (res?.data || res)?.notificationId || null;
        if (followUpId) {
          // Saved on the task in its OWN field so un-checking or deleting the
          // task can take it back (onTaskUpdate). Not in
          // onesignal_notification_ids: completing a task cancels and clears
          // those, which would kill this push. If the task was already
          // un-checked or deleted while this was being booked, take it back now.
          const fresh = await base44.asServiceRole.entities.Task.get(taskId).catch(() => null);
          if (fresh && fresh.status === 'completed') {
            await base44.asServiceRole.entities.Task.update(taskId, { follow_up_notification_id: followUpId });
          } else {
            await cancelPush(base44, followUpId);
          }
        }
      } catch (e) {
        console.error('[logTaskCompletion] follow-up booking failed:', e?.message);
      }
    }

    const first = reminders[0] ? new Date(reminders[0].send_at) : null;
    const last = reminders.length ? new Date(reminders[reminders.length - 1].send_at) : null;

    await base44.asServiceRole.entities.AppEvent.create({
      event: 'task_completed',
      user_email: email,
      session_id: '',
      seconds: Math.round((completedAt.getTime() - createdAt.getTime()) / 1000),
      page: '',
      props: {
        classification: task.classification || 'task',
        urgency: task.urgency || null,
        life_area: task.life_area || null,
        interval: task.reminder_interval || 'none',
        day_only: !!task.day_only_task,
        is_subtask: !!task.parent_task_id,
        from_calendar: !!task.google_event_id,
        silenced_at_some_point: !!task.silenced,
        snooze_count: task.snooze_count || 0,
        due_date_pushes: task.due_date_pushes || 0,
        // The reminder timeline: how many landed, and how long the gap was from
        // the first nudge (and the last) to the task actually getting done.
        reminders_before_completion: reminders.length,
        reminder_kinds: reminders.map((r) => r.kind),
        minutes_first_reminder_to_done: first
          ? Math.round((completedAt.getTime() - first.getTime()) / 60000)
          : null,
        minutes_last_reminder_to_done: last
          ? Math.round((completedAt.getTime() - last.getTime()) / 60000)
          : null,
        had_no_reminders: reminders.length === 0,
      },
    });

    // Family, finishing time and completion habit (recordCompletionHabit).
    try {
      await recordCompletionHabit(base44, task);
    } catch (e) {
      console.error('[logTaskCompletion] habit tracking failed:', e?.message || e);
    }

    return Response.json({ logged: true, reminders: reminders.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Families, finishing times and completion habits (Anna, Oct 10 2026) ─────
// "Track what time users finish tasks that are recurring or created
// repeatedly… suggest the reminders be closer to the time they usually finish
// … the user can say yes or no." Every finished task gets its family (the same
// chore however it's worded or whose it is: runTaskParse.assignTaskFamilies)
// and the server's own clock time it was finished (the phone's completed_at
// isn't reliable). Once a family has been finished on 4 or more different
// days, the model decides whether there's a real habit (judgeCompletionHabit);
// if there is, one open task in that family carries a suggestion the person
// answers Yes or No on (TaskDetailsModal). Nothing moves on its own. Looked at
// most every 3 days per family, never again for 30 days after a No, never
// while an earlier suggestion is unanswered. A Yes is only something the
// Smart Reminders planner now knows: "they asked to be reminded about this
// around X" (the family's preferred time). It never sets a time on the task
// or turns its reminders into fixed ones (Anna, Oct 10 2026), so it's only
// offered on tasks the planner reminds them about: no time of their own and
// no repeating reminder. A task with a time the person picked keeps it. The person's own data only; the analytics row above still
// stores no titles.
const HABIT_DAY_MS = 24 * 60 * 60 * 1000;
// Repeating reminders (cronSmartTaskNudge RECURRING_INTERVALS) ring on their own.
const HABIT_RHYTHMS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
const serverMs = (v: any): number => {
  const s = String(v || '');
  if (!s) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};
const minutesOfDay = (hhmm: string): number => {
  const [h, m] = String(hhmm || '').split(':').map((n) => parseInt(n, 10));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};
const clock12 = (hhmm: string): string => {
  const mins = minutesOfDay(hhmm);
  if (!Number.isFinite(mins)) return hhmm;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

async function recordCompletionHabit(base44: any, task: any) {
  if (!task || task.parent_task_id || task.birthday_person
    || task.classification === 'birthday' || task.classification === 'event') return;
  const email = task.created_by;
  if (!email) return;
  const svc = base44.asServiceRole.entities;
  const owner = (await svc.User.filter({ email }, '-created_date', 1))?.[0];
  if (!owner) return;
  const tz = userTimeZone(owner);
  const nowMs = Date.now();
  const finishedAt = new Date(nowMs).toISOString();
  const lc = (s: any) => String(s || '').trim().toLowerCase();
  const recent: any[] = (await svc.Task.filter({ created_by: email }, '-updated_date', 300)) || [];

  let family = lc(task.task_family);
  if (!family) {
    const existing = [...new Set(recent.map((t: any) => lc(t.task_family)).filter(Boolean))].slice(0, 80) as string[];
    const got = await assignTaskFamilies([{ id: task.id, title: task.title, said: task.original_input }], existing);
    family = lc(got[task.id]);
  }
  await svc.Task.update(task.id, family ? { task_family: family, finished_at: finishedAt } : { finished_at: finishedAt });
  if (!family) return;

  const habits: Record<string, any> = { ...(owner.task_habits || {}) };
  const h: any = { ...(habits[family] || {}) };
  let changed = false;
  const said = task.habit_suggestion;
  if (said?.answer === 'yes' && /^\d{2}:\d{2}$/.test(said.time || '') && h.preferred_time !== said.time) {
    h.preferred_time = said.time;
    changed = true;
  }

  const kin = recent.filter((t: any) => t.id !== task.id && !t.parent_task_id
    && (lc(t.task_family) === family || (!t.task_family && lc(t.title) === lc(task.title))));
  const finished: number[] = kin.filter((t: any) => t.status === 'completed')
    .map((t: any) => serverMs(t.finished_at || t.updated_date))
    .filter((ms: number) => Number.isFinite(ms));
  finished.push(nowMs);
  finished.sort((a, b) => a - b);
  const days = new Set(finished.map((ms) => localDateKey(new Date(ms), tz)));
  const open = kin.filter((t: any) => t.status === 'active');
  const pending = kin.some((t: any) => t.habit_suggestion?.time && !t.habit_suggestion?.answer
    && nowMs - serverMs(t.habit_suggestion.made_at) < 14 * HABIT_DAY_MS);
  const declined = [task, ...kin].some((t: any) => t.habit_suggestion?.answer === 'no'
    && nowMs - serverMs(t.habit_suggestion.answered_at) < 30 * HABIT_DAY_MS);
  const lookedLately = nowMs - serverMs(h.checked_at) < 3 * HABIT_DAY_MS;

  const planned = open.filter((t: any) => !(!t.day_only_task && /^\d{2}:\d{2}$/.test(t.anchor_time || ''))
    && !HABIT_RHYTHMS.has(t.reminder_interval));
  if (days.size >= 4 && planned.length && !pending && !declined && !lookedLately) {
    h.checked_at = finishedAt;
    changed = true;
    const target = planned[0];
    const current = h.preferred_time || null;
    const reminder = current ? `around ${clock12(current)} (they chose that)` : 'no set time; the app picks the moment';
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const verdict = await judgeCompletionHabit({
      titles: [...new Set(planned.map((t: any) => String(t.title || '')))].slice(0, 3) as string[],
      reminder,
      finished: finished.slice(-20).map((ms) => fmt.format(new Date(ms))),
      minutes: Number(target.typical_minutes || h.minutes) || null,
    });
    let gap = NaN;
    if (verdict.time && current) {
      const d = Math.abs(minutesOfDay(verdict.time) - minutesOfDay(current));
      gap = Math.min(d, 1440 - d);
    }
    if (verdict.habit && verdict.time && !(gap < 30)) {
      await svc.Task.update(target.id, { habit_suggestion: { time: verdict.time, why: verdict.why || null, made_at: finishedAt } });
      console.log(`[logTaskCompletion] habit for "${family}": suggesting ${verdict.time} on task ${target.id}`);
    }
  }
  if (changed) {
    habits[family] = h;
    await svc.User.update(owner.id, { task_habits: habits });
  }
}
