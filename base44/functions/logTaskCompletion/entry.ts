// Re-saved Nov 25 2026 (night) so the bundled shared/claudeAi.ts and shared/aiCost.ts are picked up: the task parser and the words of the reminder at a time someone set are ready to be answered by Claude for everyone (CLAUDE_JOBS_FOR_EVERYONE), held off (CLAUDE_JOBS_LIVE false) until the app's disclosures name Anthropic. Nothing else in this file changes.
// Re-saved Nov 15 2026 (evening) so the bundled shared/taskParsePrompt.ts and runTaskParse.ts are picked up: the parser says when a task IS making a phone call (calls_someone, call_person). Nothing else changes here.
// Re-saved Nov 15 2026 (afternoon) so the bundled shared/taskParsePrompt.ts and runTaskParse.ts are picked up: the parser says when a task IS sending someone a text and who it's to (texts_someone, text_person). Nothing here reads either.
// Re-saved Nov 15 2026 so the bundled shared/taskParsePrompt.ts and runTaskParse.ts are picked up: the parser reads an event's end when the person gave one ("from 2 to 5") and, for a timed event with none, estimates how long that kind of event usually runs (never shown; read only by shared/leaveOrigin.ts). Nothing here reads either.
// Re-saved Nov 14 2026 (afternoon; once more after shared/nthWeekday.ts gained the same-day-each-month math, unused here) so the bundled shared/runTaskParse.ts and nthWeekday.ts are picked up: the parser reads "the second Tuesday of every month" as a monthly repeat on that weekday.
// Nov 14 2026: the "next step" follow-up after Done is REMOVED (Anna: "I would NEVER ask for a follow up notification on something someone pressed done on. Thats crazy.", "Remove it"). Nothing is booked when a task is checked off. Bundled shared/runTaskParse.ts and taskParsePrompt.ts no longer ask the parser for one.
// Re-saved Nov 12 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r44, a chore is only brought up when there is time to finish it before their bedtime (laundry at 10:29 PM, an hour before quiet hours; Anna: "Too late to be suggesting this").
// Re-saved Nov 11 2026 so the bundled shared/sendLedger.ts is picked up: reminder history is filed by what OneSignal says happened (sent, reached no phone, or cancelled and not kept).
// Re-saved Nov 10 2026 so the bundled shared/taskParsePrompt.ts is picked up: a shared or pasted confirmation gets a short calendar-style title (no order numbers, order dates, hours or fine print), and a dated visit for care or tests is an event.
// Re-saved Nov 7 2026 (night) so the bundled shared/reminderBrief.ts is picked up: r43, store runs wait for daytime or early evening (after about 7 PM, the next day).
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 4 2026 (night) so the bundled shared/sendLedger.ts is picked up: an event's heads-ups are never evicted for a push booked after them.
// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 17 2026 so the bundled shared/runTaskParse.ts and shared/taskParsePrompt.ts are picked up: the parser and its helpers run on gpt-6-astra (was gpt-5.4), the parser's calendar beats the real date astra is given, and "tomorrow morning" / "Sunday night" get a time.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { userTimeZone, localDateKey } from '../../shared/quietHours.ts';
import { assignTaskFamilies, judgeCompletionHabit, judgeDailyThing } from '../../shared/runTaskParse.ts';
import { setAiPerson, aiServe } from '../../shared/aiPerson.ts';

// Records ONE analytics row when a task is completed, with the reminder history
// that led up to it. Driven by the Task-update workflow rather than the UI,
// because a task can be completed from half a dozen places (card, today's list,
// notification screen, subtask roll-up) and every one of them must be counted.
//
// Deliberately stores no task title or user-written text — only counts, timings
// and flags.
// (Until Nov 14 2026 a "next step" push was booked from here when a chore was
// checked off. Removed: see the note in shared/runTaskParse.ts.)

async function aiHandledRequest(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const taskId = body.task_id;
    if (!taskId) return Response.json({ error: 'task_id required' }, { status: 400 });

    const task = await base44.asServiceRole.entities.Task.get(taskId);
    if (!task) return Response.json({ skipped: 'no task' });

    const email = task.notification_recipient_email || task.created_by || '';
    // This request is about one task: its AI calls are the owner's (Claude or
    // OpenAI by shared/claudeAi.ts, Nov 24 2026).
    setAiPerson(email);
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

    // NOTHING is booked here (Nov 14 2026): checking a task off never leads
    // to a reminder about it or about a guessed next step.

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

    // "Every day around this time?" (offerRepeat, below). After the habit
    // tracking, which gives the task its family.
    try {
      await offerRepeat(base44, taskId);
    } catch (e) {
      console.error('[logTaskCompletion] repeat offer failed:', e?.message || e);
    }

    return Response.json({ logged: true, reminders: reminders.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Whose AI calls this request makes (shared/aiPerson.ts, Nov 24 2026).
export default aiServe(aiHandledRequest);

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

// ── "Every day around this time?" (Anna, Nov 1 2026) ───────────────────────
// The two people who open ADHDone every day both have a to-do that repeats
// daily; "pills" and "take birth control" were saved as one-time, checked off
// once, and the app went quiet. So when a one-time to-do that people normally
// do every day is checked off, the app offers to make it repeat, at the time
// they actually did it, so it never has to guess morning or night. This only
// marks the offer on the task (repeat_offer); the app asks (RepeatOfferPopup)
// and a Yes adds a daily to-do through captureText. Nothing changes on its own.
// The model judges each kind of task (task_family) once, kept in task_habits.
// Never offered while that kind of task already repeats, while an offer is
// waiting, or ever again once they've been asked about that kind of task,
// however it's worded (Anna, Nov 9 2026: "make sure it doesnt ask this for
// the same task over and over. Only once. And account for different
// wording. Like do dishes vs dishes need to be done"). Asked = answered, or
// it was on their screen (the app stamps repeat_offer.shown_at), or it's
// still waiting to be seen. One that ran out without ever being on screen
// was never asked. Every offer they've ever had counts, not just recent
// tasks.
const REPEAT_OFFER_DAYS = 3;
async function offerRepeat(base44: any, taskId: string) {
  const svc = base44.asServiceRole.entities;
  const task = await svc.Task.get(taskId).catch(() => null);
  if (!task || task.status !== 'completed' || task.repeat_offer) return;
  if (task.parent_task_id || task.birthday_person || task.goal_id || task.google_event_id) return;
  if (task.classification && task.classification !== 'task') return;
  if (task.recurrence_pattern && task.recurrence_pattern !== 'none') return;
  if (HABIT_RHYTHMS.has(task.reminder_interval)) return;
  const title = String(task.title || '').trim();
  const email = task.created_by;
  if (!title || !email) return;

  const lc = (s: any) => String(s || '').trim().toLowerCase();
  const family = lc(task.task_family);
  const nowMs = Date.now();
  const recent: any[] = (await svc.Task.filter({ created_by: email }, '-updated_date', 300)) || [];
  const kin = recent.filter((t: any) => t.id !== task.id && !t.parent_task_id
    && (family ? lc(t.task_family) === family : lc(t.title) === lc(title)));
  // Already repeating.
  if (kin.some((t: any) => t.status === 'active' && t.recurrence_pattern && t.recurrence_pattern !== 'none')) return;
  // Already asked about this kind of task: same family, same name, or the
  // same words typed.
  const offered: any[] = ((await svc.Task.filter({ created_by: email, repeat_offer: { $ne: null } }, '-updated_date', 500)) || [])
    .filter((t: any) => t.id !== task.id && t.repeat_offer && typeof t.repeat_offer === 'object');
  const asked = offered.filter((t: any) => {
    const o = t.repeat_offer;
    return !!o.answer || !!o.shown_at || nowMs - serverMs(o.made_at) < REPEAT_OFFER_DAYS * HABIT_DAY_MS;
  });
  const said = lc(task.original_input);
  if (asked.some((t: any) => (family && lc(t.task_family) === family)
    || lc(t.title) === lc(title)
    || (said && lc(t.original_input) === said))) return;

  const owner = (await svc.User.filter({ email }, '-created_date', 1))?.[0];
  if (!owner) return;
  const habits: Record<string, any> = { ...(owner.task_habits || {}) };
  const h: any = family ? { ...(habits[family] || {}) } : {};
  // Already found (below) to be something they were asked about under
  // another name.
  if (h.repeat_asked_as) return;
  let daily: boolean;
  if (family && typeof h.daily === 'boolean') {
    daily = h.daily;
  } else {
    daily = await judgeDailyThing({ title, said: task.original_input });
    if (family) {
      h.daily = daily;
      habits[family] = h;
      await svc.User.update(owner.id, { task_habits: habits });
    }
  }
  if (!daily) return;

  // Worded differently from something they were already asked about and
  // filed under another family ("do dishes" / "dishes need to be done"): the
  // model checks it against the kinds of task already asked about, and a
  // match means no offer. Kept on the family (repeat_asked_as) so it's
  // checked once, but only when that earlier one was answered or seen (one
  // still waiting may run out unseen).
  const kindOf = (t: any) => lc(t.task_family) || lc(t.title).replace(/\s+/g, ' ').slice(0, 40);
  const askedKinds = [...new Set(asked
    .map(kindOf)
    .filter((k: string) => k && k !== family && !k.startsWith('_')))].slice(0, 80) as string[];
  if (askedKinds.length) {
    const got = await assignTaskFamilies([{ id: task.id, title, said: task.original_input }], askedKinds);
    const same = lc(got[task.id]);
    if (same && askedKinds.includes(same)) {
      console.log(`[logTaskCompletion] no repeat offer on task ${taskId}: already asked about "${same}"`);
      if (family && asked.some((t: any) => kindOf(t) === same && (t.repeat_offer.answer || t.repeat_offer.shown_at))) {
        h.repeat_asked_as = same;
        habits[family] = h;
        await svc.User.update(owner.id, { task_habits: habits });
      }
      return;
    }
  }

  // When they finished it, on their own clock, to the nearest 5 minutes.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: userTimeZone(owner), hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '', 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
  const rounded = (hh * 60 + Math.round(mm / 5) * 5) % 1440;
  const time = `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;

  // Still checked off? (Undo is a few seconds; the model can take longer.)
  const fresh = await svc.Task.get(taskId).catch(() => null);
  if (!fresh || fresh.status !== 'completed' || fresh.repeat_offer) return;
  await svc.Task.update(taskId, { repeat_offer: { time, made_at: new Date(nowMs).toISOString() } });
  console.log(`[logTaskCompletion] repeat offer on task ${taskId} (${family || 'no family'}) around ${time}`);
}

// Redeployed Nov 4 2026: shared/reminderTitle.ts lets the iPhone app ring (phoneCanRing).

// Redeployed Nov 5 2026: the parser now judges goes_somewhere (shared/runTaskParse.ts).

// Redeployed Nov 5 2026 (evening): shared/reminderTitle.ts tells the reminder-words model the task's corrected name beats the words it was first typed with.

// Re-saved Nov 12 2026: shared/reminderTitle.ts (the alarm of their own young child's birthday has no "Write a text" button; birthday_no_text).
