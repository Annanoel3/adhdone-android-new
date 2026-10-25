// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 19 2026 (night) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: a link the task needs (a video-session or meeting link) goes in the task's notes, never its title, and the time zone of a time stays out of the title.
// Re-saved Oct 19 2026 so the bundled shared/runTaskParse.ts is picked up: a time picked from a part of the day ("morning medication") is never marked as one the person stated, so it can't ring inside their quiet hours.
// Re-saved Oct 17 2026 (evening) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: an event that runs past midnight (7 PM–2 AM) is one night, not a two-day range, and a day counted from the real date instead of the said-at day gets a last look.
// Re-saved Oct 17 2026 so the bundled shared/runTaskParse.ts and shared/taskParsePrompt.ts are picked up: the parser and its helpers run on gpt-6-astra (was gpt-5.4), the parser's calendar beats the real date astra is given, and "tomorrow morning" / "Sunday night" get a time.
// Re-saved Oct 13 2026 so the bundled shared/runTaskParse.ts is picked up: one more ask when words that name a part of the day ("tonight") came back with no time.
// Re-saved Oct 13 2026 so the bundled shared/taskParsePrompt.ts is picked up: a phone number, address or amount they typed stays in the title.
// Re-saved Oct 13 2026 so the bundled shared/eventReminderPlan.ts is picked up: the reminder at an event's start is never the one the per-event cap drops.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { buildTaskParsePrompt } from '../../shared/taskParsePrompt.ts';
// The shared prompt is bundled at deploy time; this function was last redeployed
// Oct 8 2026 (a bare "ASAP" with no due date means start now), before that
// Oct 7 2026 (a rhythm needs quoted pace words — repeat_words), before that
// Oct 6 2026 ("ASAP" / "first thing" are the task's timing, never a reminder wish), before that
// Oct 3 2026 for the parser's takes_time flag, and before that Sept 27 2026 for the parse fixes (a clock time with no day gets its day,
// "Grandma" stays in the title, "next Tuesday" is next week's Tuesday).
import { runTaskParse } from '../../shared/runTaskParse.ts';
import OpenAI from 'npm:openai';
import { wallClockToUtc, nextLocalOccurrence, localReminderUtc } from '../../shared/timezoneReminders.ts';
import { isRecurringInterval, INTERVAL_MS } from '../../shared/reminderIntervalDecision.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { filterAll } from '../../shared/listAll.ts';
import { buildEventReminderPlan, isBookableNow, isBookedId } from '../../shared/eventReminderPlan.ts';
import { withChallengeRetry } from '../../shared/sdkRetry.ts';
import { resolveQuietHours } from '../../shared/quietHours.ts';
import { pushPhoneAlarms } from '../../shared/reminderTitle.ts';
import { flagConflicts } from '../../shared/eventConflicts.ts';

// Payment detection for imported calendar items. Calendar payment entries are
// usually terse ("Discover payment", "$450 rent", "Pay water bill", "Chase"),
// so keyword-match the title in addition to the AI's classification.
function isPaymentTitle(title) {
  if (!title) return false;
  if (title.includes('$')) return true;
  return /\b(pay|payment|bill|rent|mortgage|invoice|loan|insurance|credit card|venmo|zelle|paypal|cash ?app|chase|wells ?fargo|discover|amex|american express|capital ?one|citi(bank)?|bank of america|us bank|navy federal|synchrony|affirm|klarna|afterpay)\b/i.test(title);
}

function isBirthdayEvent(title, recurrenceRule) {
  if (!recurrenceRule) return false;
  const isYearly = recurrenceRule.includes('FREQ=YEARLY');
  if (!isYearly) return false;
  const lower = (title || '').toLowerCase();
  return lower.includes('birthday') || lower.includes('bday');
}

// Which birthdays on a calendar are animals' (Julianna, Oct 23 2026: Jojo,
// Shiro and Yuki & Haru are her pets, with their vaccines, rabies shots and
// nail trims on the same calendar, and every one was set to ask her to "write
// a text" on their birthday). The model reads the names and everything else on
// the calendar the way a friend would; one it isn't sure about stays a person.
// One call per sync, only when birthdays are being imported for the first
// time. Returns { lowercased name: kind }. Never throws: no answer = people.
export const ANIMAL_BIRTHDAY_PROMPT = `Someone's calendar is being brought into ADHDone, a reminder app for people with ADHD. For each birthday listed, decide whether it is an animal's birthday (a pet) or a person's.

Read it the way a friend looking over their calendar would: the same name showing up on vet visits, vaccines, rabies shots, grooming or nail trims; a name that is plainly a pet's; the birthday entry's own wording. A name with nothing pointing to an animal is a person's, even if it would also suit a pet. Emojis in a name don't make it an animal on their own; people's contact names have them too.

When you can tell what kind of animal it is (dog, cat, rabbit, horse...), give that; otherwise "pet".

Answer with JSON only, listing just the animals, each name exactly as given: {"animals": [{"name": "...", "kind": "..."}]}`;
async function judgeAnimalBirthdays(names: string[], otherTitles: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!names.length) return out;
  try {
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const ask = openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: ANIMAL_BIRTHDAY_PROMPT },
        { role: 'user', content: `Birthdays:\n${names.map((n) => `- ${n}`).join('\n')}\n\nEverything else on their calendar:\n${otherTitles.slice(0, 300).map((t) => `- ${t}`).join('\n') || '- (nothing else)'}` },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 3000,
    });
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
    const res: any = await Promise.race([ask, late]);
    if (!res) return out;
    const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    for (const a of Array.isArray(parsed?.animals) ? parsed.animals : []) {
      const name = String(a?.name || '').trim().toLowerCase();
      if (!name || !wanted.has(name)) continue;
      out[name] = String(a?.kind || 'pet').trim().toLowerCase().slice(0, 40) || 'pet';
    }
  } catch (e) {
    console.log('[syncGoogleCalendar] animal birthday check failed:', (e as any)?.message || e);
  }
  return out;
}

// A birthday's reminders go out at 9 AM on its day, the same as a birthday with
// no time. A phone calendar can hold a birthday as an entry at any clock time
// (Julianna, Oct 23 2026: Athena's at 9 PM, Popo's at 11 PM, Sebastian's at
// 5 AM), and every reminder took that time: "It's Athena's birthday today!"
// at 9 PM, and Popo's 11 PM ones moved past quiet hours to the next morning,
// a day late. Its day is the day the entry is on in their time zone.
function birthdayMorning(at: Date, timeZone: string | null): Date {
  return localReminderUtc(at, 0, 9, 0, timeZone);
}

function extractBirthdayPerson(title) {
  if (!title) return '';
  // Strip the generic birthday words ("happy birthday", "bday") and
  // possessive punctuation so "<Name>'s birthday" -> "<Name>". Also drop
  // "happy" so a generic Google "Happy birthday!" event doesn't leave a
  // meaningless "Happy !" as the person's name.
  let t = title
    .replace(/happy/gi, '')
    .replace(/birthday|bday/gi, '')
    .replace(/['\u2019]*s\b/gi, '')
    .replace(/['\-:,]/g, ' ')
    .trim();
  t = t.replace(/\s+/g, ' ').trim();
  // If nothing meaningful remains (just punctuation/emojis), there's no
  // person name — the caller falls back to "Happy Birthday".
  if (!t || /^[^a-z0-9]+$/i.test(t)) return '';
  return t;
}

// Is this yearly birthday event the USER'S OWN birthday? Google auto-creates
// the account owner's birthday as a nameless "Happy birthday!" / "🎂" event, and
// some accounts store it as "<Owner's full name>'s birthday". Either way it must
// NOT become a "text this person" entry — the user isn't texting themselves.
function isOwnBirthday(title, personName, user) {
  if (!personName) return true; // nameless birthday = the account owner's
  const person = personName.toLowerCase().trim();
  const fullName = (user?.full_name || '').toLowerCase().trim();
  if (fullName && (person === fullName || fullName.startsWith(person) || person.startsWith(fullName))) return true;
  // "my birthday" / "me"
  return /^(my|me|mine|myself)$/.test(person);
}

// When an already-synced event's task still exists, check whether the Google
// event's start/end changed since the last sync. If so, patch the task's
// event dates (next_reminder, due_date, end_date for one-time events) and
// refresh the sync record — so editing a Google event (e.g. extending a
// hotel stay to multi-day) actually updates the app on resync.
// Does the event run past the day it starts? An all-day event's end is
// exclusive (a one-day event ends "tomorrow"), and a timed event ends the same
// day unless it crosses midnight.
function spansDays(startRaw, endRaw) {
  if (!startRaw || !endRaw) return false;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dayOnly.test(startRaw) && dayOnly.test(endRaw)) {
    const s = Date.UTC(+startRaw.slice(0, 4), +startRaw.slice(5, 7) - 1, +startRaw.slice(8, 10));
    const e = Date.UTC(+endRaw.slice(0, 4), +endRaw.slice(5, 7) - 1, +endRaw.slice(8, 10));
    return e - s > 24 * 60 * 60 * 1000;
  }
  const s = new Date(startRaw), e = new Date(endRaw);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  return e > s && e.toISOString().slice(0, 10) !== s.toISOString().slice(0, 10);
}

async function patchExistingTaskDates(base44, syncRec, taskRec, event, timeZone, ctx: any = null) {
  const startRaw = event.start?.dateTime || event.start?.date || null;
  const endRaw = event.end?.dateTime || event.end?.date || null;
  const startChanged = (syncRec.start_time || null) !== startRaw;
  const endChanged = (syncRec.end_time || null) !== endRaw;
  // Backfill end_date for one-time events that are missing it (e.g. synced
  // before the multi-day span logic landed). Without this, a re-sync where the
  // Google dates are unchanged returns early and never records end_date, so the
  // event detail never shows the full date range. Only a MULTI-day event has
  // one to backfill: every one-day event has an end too, and flagging those
  // re-wrote each birthday on every sync and reported it as "updated" (Anna,
  // Oct 13 2026: a sync that changed nothing said "updated 8").
  const needsEndBackfill = taskRec.reminder_interval === 'once' && !taskRec.end_date && spansDays(startRaw, endRaw);
  // Events synced before the address feature landed have no location stored.
  const needsLocationBackfill = !!event.location && !taskRec.location;
  // Tasks imported before the task-level dedupe key existed get it stamped on
  // resync, so the "already have this event?" check covers legacy imports too.
  const needsKeyBackfill = !taskRec.google_event_id;
  if (!startChanged && !endChanged && !needsEndBackfill && !needsLocationBackfill && !needsKeyBackfill) return false;

  // Recompute the event start the same way the create path does.
  let nextReminderDate: Date | null = null;
  if (startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
    const [y, m, d] = startRaw.split('-').map(n => parseInt(n, 10));
    nextReminderDate = wallClockToUtc(y, m, d, 9, 0, timeZone);
  } else if (startRaw) {
    nextReminderDate = new Date(startRaw);
  }

  // Advance recurring-series master dates into the future.
  const rrule = (event.recurrence || []).join(';');
  if (rrule && nextReminderDate && nextReminderDate < new Date()) {
    if (rrule.includes('FREQ=YEARLY')) {
      // Step by full calendar years — fixed 365-day jumps drift ~1 day per
      // leap year, which over decades moves a birthday off its real date.
      let yr = nextReminderDate.getFullYear();
      const mo = nextReminderDate.getMonth();
      const dy = nextReminderDate.getDate();
      const hr = nextReminderDate.getHours();
      const mn = nextReminderDate.getMinutes();
      while (nextReminderDate < new Date()) {
        yr++;
        nextReminderDate = new Date(yr, mo, dy, hr, mn, 0, 0);
      }
    } else {
      // Whole calendar days / weeks / months on the USER'S clock. Fixed day
      // steps on the server's UTC clock moved a weekly 9 AM meeting to 8 AM
      // after daylight saving ended, and "monthly" was +30 days.
      const unit = rrule.includes('FREQ=WEEKLY') ? 'week'
        : rrule.includes('FREQ=MONTHLY') ? 'month' : 'day';
      nextReminderDate = nextLocalOccurrence(nextReminderDate, unit, Date.now(), timeZone);
    }
  }

  // A birthday keeps 9 AM on its day, whatever clock time the calendar entry
  // has (see birthdayMorning).
  const isBday = taskRec.classification === 'birthday' || !!taskRec.birthday_person || !!taskRec.is_own_birthday;
  if (isBday && nextReminderDate) nextReminderDate = birthdayMorning(nextReminderDate, timeZone);

  const patch: any = {};

  if (needsKeyBackfill) patch.google_event_id = event.id;
  if (needsLocationBackfill) patch.location = event.location;

  // One-time events: the event start IS the reminder/due date, and end_date
  // records the multi-day span. Recurring tasks use now+gap for reminders, so
  // only refresh due_date/end_date from the calendar date.
  if (taskRec.reminder_interval === 'once') {
    if (startChanged && nextReminderDate) {
      patch.next_reminder = nextReminderDate.toISOString();
      patch.due_date = nextReminderDate.toISOString();
      // Timed events also carry the actual event time — this is what the
      // task detail view displays as the event's date & time.
      if (event.start?.dateTime && !isBday) patch.event_time = nextReminderDate.toISOString();
    }
    if (endRaw && !isBday) {
      let endDate: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
        const [y, m, d] = endRaw.split('-').map(n => parseInt(n, 10));
        endDate = wallClockToUtc(y, m, d - 1, 9, 0, timeZone); // all-day end is exclusive
      } else {
        endDate = new Date(endRaw);
      }
      const base = nextReminderDate || (taskRec.next_reminder ? new Date(taskRec.next_reminder) : new Date());
      const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (endDate > base && fmt(endDate) !== fmt(base)) {
        patch.end_date = endDate.toISOString();
      } else {
        patch.end_date = null;
      }
    } else {
      patch.end_date = null;
    }
  }

  // The event moved in the calendar: its reminders move with it. Before this
  // only the task's date followed, and every reminder booked for it still
  // went out at the old time (Oct 19 2026, once the phone imports calendar
  // changes on its own). A one-time event only, not a repeating series (its
  // next date moves on by itself, and the hourly repeat pass owns that), and
  // only one that still has reminders: a plan the person emptied stays empty.
  // Its booked pushes come down first (an identical push still on the books
  // would block the new one), then the same planner as at import plans the
  // new time.
  const instant = (raw: any) => (!raw || /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? NaN : Date.parse(String(raw)));
  const oldMs = instant(syncRec.start_time);
  const newMs = instant(startRaw);
  const moved = startChanged && (Number.isFinite(oldMs) && Number.isFinite(newMs)
    ? oldMs !== newMs
    : String(syncRec.start_time || '') !== String(startRaw || ''));
  const oldPlan = Array.isArray(taskRec.reminder_schedule) ? taskRec.reminder_schedule : [];
  if (ctx?.user && moved && patch.next_reminder && taskRec.reminder_interval === 'once' && taskRec.status === 'active'
    && taskRec.classification !== 'birthday' && !(event.recurrence || []).length
    && (!taskRec.recurrence_pattern || taskRec.recurrence_pattern === 'none')
    && oldPlan.length > 0 && new Date(patch.next_reminder).getTime() > Date.now()) {
    const nowMs = Date.now();
    const booked = new Set<string>();
    for (const e of oldPlan) {
      const id = String(e?.notification_id || '');
      if (id && !id.startsWith('planned_') && new Date(e?.send_at || 0).getTime() > nowMs) booked.add(id);
    }
    for (const id of (taskRec.onesignal_notification_ids || [])) if (id) booked.add(String(id));
    for (const id of booked) {
      await base44.asServiceRole.functions.invoke('cancelScheduled', { notificationId: id }).catch(() => {});
    }
    const fresh = await planEventReminders(base44, ctx.user, { ...taskRec, ...patch }, {
      title: taskRec.title || event.summary || 'Untitled event',
      isAllDay: !event.start?.dateTime,
      location: taskRec.location || event.location || '',
      startIsTheirs: !!event.start?.dateTime || taskRec.time_stated === true,
      budget: ctx.budget,
    });
    patch.reminder_schedule = fresh.reminder_schedule || [];
    patch.onesignal_notification_ids = fresh.onesignal_notification_ids || [];
    // Planning failed outright: no plan is marked as built, so nothing reads
    // the empty list as one the person chose.
    patch.reminder_plan_built_at = fresh.reminder_plan_built_at || null;
    if (!fresh.reminder_schedule) console.error('[syncGoogleCalendar] moved event could not be re-planned:', taskRec.id);
    // Moved onto something else? Checked with the new imports at the end.
    if (Array.isArray(ctx.toCheck)) ctx.toCheck.push(taskRec.id);
    console.log('[syncGoogleCalendar] event moved in the calendar, reminders moved with it:', taskRec.id, booked.size, 'cancelled,', patch.reminder_schedule.length, 'planned');
  }

  if (Object.keys(patch).length > 0) {
    await base44.asServiceRole.entities.Task.update(taskRec.id, patch);
    // The phone's alarms for it follow now, app open or not.
    if (ctx?.user) await pushPhoneAlarms({ ...taskRec, ...patch }, ctx.user, { before: taskRec, source: 'calendarSync' }).catch(() => {});
  }
  await base44.asServiceRole.entities.CalendarSyncedEvent.update(syncRec.id, {
    start_time: startRaw,
    end_time: endRaw,
    last_synced_at: new Date().toISOString(),
    title: event.summary || syncRec.title || 'Untitled event',
  });
  return true;
}

// A phone calendar row as the phone reads it (CalendarBridge.readEvents) ->
// the event shape this import understands. The same as deviceRowToEvent in
// src/lib/calendarSync.js, where the app shapes the rows itself; the phone's
// own background sync (CalendarSyncWorker, build 43 on) sends them as read, so
// the phone doesn't carry a copy of this. Change both together.
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function deviceRowToEvent(row: any) {
  if (!row || !row.id) return null;
  const cal = String(row.calendarId || '');
  const id = row.originalId
    ? `device:${cal}:${row.originalId}_${row.originalInstanceTime || row.dtstart || 0}`
    : `device:${cal}:${row.id}`;
  const begin = Number(row.nextBegin) || Number(row.dtstart) || 0;
  if (!begin) return null;
  const end = Number(row.nextEnd) || Number(row.dtend) || 0;
  const allDay = !!row.allDay;
  const event: any = {
    id,
    summary: row.title || 'Untitled event',
    description: row.description || '',
    location: row.location || '',
    status: 'confirmed',
    start: allDay ? { date: utcDay(begin) } : { dateTime: new Date(begin).toISOString() },
    recurrence: row.rrule ? [`RRULE:${row.rrule}`] : [],
    attendees: [],
    source: 'device',
    calendarId: cal,
    syncId: row.syncId ? String(row.syncId) : '',
  };
  if (end) event.end = allDay ? { date: utcDay(end) } : { dateTime: new Date(end).toISOString() };
  if (row.organizer) event.organizer = { email: row.organizer };
  return event;
}

// An imported one-time item's reminders: the plan from the shared planner (the
// same one cronRefillReminders uses), booked now where OneSignal can take it
// and this run still has push budget, the rest left planned for the hourly
// job. Returns the fields to save on the task (none when planning failed).
// Used when an item is imported, and when its start moves in the calendar.
async function planEventReminders(base44: any, user: any, task: any, opts: { title: string; isAllDay: boolean; location: string; startIsTheirs: boolean; budget: { n: number } }): Promise<any> {
  const out: any = {};
  const { title, isAllDay, budget } = opts;
  try {
    // If the schedule generator fails, the planner still gives the event one
    // reminder at its start — never nothing.
    let rawReminders: any[] = [];
    // Only an event gets a plan; anything else imported (a payment, a task)
    // gets one reminder at its own time, or none when it's all day (Anna,
    // Oct 12 2026: "smart reminders and events and birthdays ... and tasks
    // that the user gave a specific time to"). No AI plan is asked for it.
    const importedEvent = task.classification === 'event';
    if (importedEvent) try {
      const scheduleRes = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
        title,
        scheduledDateISO: task.next_reminder,
        urgency: task.urgency,
        classification: task.classification || 'event',
        // An all-day event: the day before and the morning of, not "It's
        // time" at its 9 AM anchor (Oct 12 2026).
        noClockTime: !(task as any).event_time,
        // Lets the "leave now" reminder be based on real drive time from home
        // instead of a blanket hour before.
        location: opts.location,
        // generateReminderSchedule reads `homeOrigin`. This used to be sent as
        // `homeZip`, which nothing reads, so an imported event with a location
        // never got its drive-time "leave now" reminder.
        homeOrigin: getHomeOrigin(user),
        avoidTolls: (user as any)?.commute_avoid_tolls === true,
        reminderWish: (task as any)?.reminder_wish || null,
        timezone: (user as any)?.timezone || undefined,
        // Lets an appointment's reminders offer recording notes (build 36+).
        canRecord: (user as any)?.notes_can_record === true,
      });
      const scheduleData = scheduleRes?.data || scheduleRes || {};
      rawReminders = scheduleData.reminders || [];
    } catch (e) {
      console.log('[syncGoogleCalendar] schedule generator failed, using the at-the-time fallback:', e.message);
    }

    let plan = buildEventReminderPlan({
      taskId: task.id,
      rawReminders,
      eventStartISO: task.next_reminder,
      title,
      isAllDay,
      isEvent: task.classification === 'event',
      timeZone: (user as any)?.timezone || null,
      // Nothing the app picked lands in their quiet hours; the event's own
      // start, a time they set, may (RULES.md §9 Q4).
      quiet: resolveQuietHours(user),
      startIsTheirs: opts.startIsTheirs,
    });

    if (!importedEvent) {
      const startMs = new Date(task.next_reminder).getTime();
      plan = isAllDay ? [] : plan.filter((e: any) => Math.abs(new Date(e.send_at).getTime() - startMs) < 60 * 1000);
    }

    for (const entry of plan) {
      // Out of budget or outside the window → stays planned for the hourly job.
      if (budget.n <= 0 || !isBookableNow(entry.send_at)) continue;
      budget.n--;
      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: Deno.env.get('CRON_SECRET'), // proves this call comes from the app's own backend
          toUserExternalId: user.email,
          title: entry.notification_title,
          body: entry.notification_body,
          sendAtISO: entry.send_at,
          // The type decides the buttons the phone puts on the push
          // (TaskActions): an EVENT's reminder gets Snooze only, a
          // check-in (night before, morning of) none, a task's Done and
          // Snooze. Calendar events used to go out as task reminders, with
          // Done on them (Oct 13 2026) — the same rule as
          // multiReminderScheduler and captureToTasks now.
          data: {
            screen: '/TaskNotification',
            taskId: task.id,
            urgency: task.urgency || 'medium',
            type: /night before|morning of/i.test(String(entry.label || ''))
              ? 'task_checkin'
              : (task.classification === 'event' ? 'event_reminder' : 'task_reminder'),
          },
          ...(task.classification === 'event' ? {} : { buttons: [
            { id: 'snooze_15', text: 'Snooze 15 min' },
            { id: 'snooze_60', text: 'Snooze 1 hour' },
            { id: 'complete', text: '✅ Done' },
          ] }),
        });
        const result = res?.data || res;
        // The id goes on the entry it belongs to — never matched up by position.
        if (result?.notificationId) entry.notification_id = result.notificationId;
        // The minute it really went at (a heads-up moved off another push's minute).
        if (result?.notificationId && typeof result.sendAt === 'string' && result.sendAt) entry.send_at = result.sendAt;
        // Refused (device not subscribed, OneSignal down): every other booking
        // this run would be refused too. Stop booking — the plans are still
        // saved, and the hourly job books them when it can.
        else if (result && result.success === false) budget.n = 0;
      } catch (e) {
        console.log('[syncGoogleCalendar] reminder scheduling failed:', e.message);
      }
    }

    if (plan.length > 0) {
      out.reminder_schedule = plan;
      // Tells cronRefillReminders this task already has its server-written
      // plan, so it never rebuilds one the user later clears.
      out.reminder_plan_built_at = new Date().toISOString();
      // Only real OneSignal ids go in the id list — never a placeholder.
      out.onesignal_notification_ids = plan.map((e) => e.notification_id).filter(isBookedId);
    }
  } catch (e) {
    console.log('[syncGoogleCalendar] event reminder scheduling failed:', e.message);
  }
  return out;
}

async function classifyEventWithAI(base44, event, user) {
  // Build a task-like input string from the calendar event, then run it
  // through the SAME parser + prompt the AddTask page uses, so imported items
  // get the exact same smart-AI decisions as manual adds (urgency, energy,
  // reminder type & frequency, event-vs-task). The parser is called directly
  // with THIS user's timezone and about-me line: invoking the parseTask
  // function through the service role ran it with no user at all, so imported
  // events never got the about-me context that sets urgency and work/personal
  // for this person (a wedding musician's wedding came out "medium").
  const summary = event.summary || 'Untitled event';
  let when = '';
  if (event.start?.dateTime) {
    const d = new Date(event.start.dateTime);
    // On their clock: the server's is UTC, so a 4 PM party read "at 10:00 PM".
    const zone = user?.timezone ? { timeZone: user.timezone } : {};
    when = ` on ${d.toLocaleDateString('en-US', zone)} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...zone })}`;
  } else if (event.start?.date) {
    const [y, m, day] = event.start.date.split('-').map(n => parseInt(n, 10));
    const d = new Date(y, m - 1, day);
    when = ` on ${d.toLocaleDateString('en-US')}`;
  }
  const loc = event.location ? ` at ${event.location}` : '';
  // Include the event's notes/description so the parser can judge urgency and
  // energy from the real details, not just a terse calendar title.
  const details = event.description
    ? `\nDetails: ${String(event.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400)}`
    : '';
  // Google Calendar forces a time on everything — people put errands, bills and
  // to-dos in there too. So the event-vs-task call has to come from the wording
  // of the title, never from the fact that a time exists.
  // A day they mark or attend is an event, every year or not (Julianna, Oct 23
  // 2026: "Victor and Chelsea Celebration and Birthday", "Sebastian
  // Anniversary" and "Teddy's anniversary" came in as to-dos, so the day
  // passed and they stayed open). Self-tested Oct 23 2026 on 19 titles,
  // occasions and look-alike chores ("Buy anniversary gift", "Plan Mom's
  // birthday party"): all right, where the old wording got 2 of the 3 wrong.
  const calendarNote = '\n(From the user\'s calendar. Every entry there has a date and time, including plain to-dos, errands and bills — so judge from the wording of the title alone whether this is an event they attend or a task they do. A day they mark or show up for — a party, a celebration, an anniversary, a graduation, a holiday — is an event, even when it has no time or comes back every year.)';
  const inputText = `${summary}${when}${loc}${details}${calendarNote}`;

  const prompt = buildTaskParsePrompt(inputText, user?.timezone);
  const parsed = await runTaskParse(base44, prompt, user?.timezone, user?.about_me);
  if (!parsed) throw new Error('task parse returned no response');
  return parsed;
}

// A claim row whose adhd_task_id looks like "claiming:<runId>:<ms>" is being
// worked on RIGHT NOW by a sync run — it is not an imported task. Two syncs can
// overlap (a first connect fires the connect-time sync and the background sync
// together), and a leftover claim with no task used to be a free-for-all: both
// runs walked past it and both created a task. Now a run has to take the lock,
// re-read it, and see its OWN marker before it may create anything.
// Notification budget for a single sync run (see use site).
// (The per-event cap of 2 lives in shared/eventReminderPlan.ts.)
const MAX_REMINDERS_PER_SYNC = 30;

const CLAIM_PREFIX = 'claiming:';
const STALE_CLAIM_MS = 10 * 60 * 1000;
const isClaimSentinel = (v) => typeof v === 'string' && v.startsWith(CLAIM_PREFIX);
const claimAgeMs = (v) => Date.now() - (Number(String(v).split(':')[2]) || 0);

// Per-user run lock. One sync per account at a time, whatever triggered it —
// layout auto-sync, the Calendar page, Sync-now, or a second device. The lock
// is a heartbeat timestamp on the user: a live run refreshes it as it works, so
// a long first import keeps the lock, while a crashed run's lock goes stale
// and the next trigger can take over.
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;
const HEARTBEAT_EVERY = 5;

async function acquireSyncLock(base44, user) {
  // The lock lives on the CALLER'S OWN user record, so every read/write here
  // goes through auth.me / auth.updateMe. Writing the User entity through the
  // service role is refused with a 403 — that refusal, added with the dedupe
  // lock, is what made every sync die with a 500 right after finding the token.
  const readMe = () => withChallengeRetry(() => base44.auth.me());
  const writeMe = (patch) => withChallengeRetry(() => base44.auth.updateMe(patch));
  const fresh = (await readMe()) || user;
  const since = fresh?.calendar_sync_in_progress_since;
  if (since && Date.now() - new Date(since).getTime() < SYNC_LOCK_STALE_MS) {
    return { acquired: false, since };
  }
  const runId = crypto.randomUUID();
  await writeMe({
    calendar_sync_in_progress_since: new Date().toISOString(),
    calendar_sync_run_id: runId,
  });
  // Two triggers that both saw "no lock" both write; after a short settle the
  // one whose run id survived owns the lock and the other stands down.
  await new Promise((r) => setTimeout(r, 400));
  const confirmed = await readMe();
  if (confirmed?.calendar_sync_run_id !== runId) {
    return { acquired: false, since: confirmed?.calendar_sync_in_progress_since };
  }
  return {
    acquired: true,
    userId: fresh.id,
    runId,
    heartbeat: async () => {
      await writeMe({ calendar_sync_in_progress_since: new Date().toISOString() }).catch(() => {});
    },
    release: async () => {
      // Only release our own lock — never wipe one a newer run has taken.
      const current = await readMe().catch(() => null);
      if (current && current.calendar_sync_run_id !== runId) return;
      await writeMe({ calendar_sync_in_progress_since: null, calendar_sync_run_id: null }).catch(() => {});
    },
  };
}

// `device`, when given, is a sync of the PHONE's calendars instead of Google:
// { events, calendarIds }. The Android app reads Samsung/Outlook/any calendar
// the phone's calendar app shows (native CalendarBridge), reshapes each row to
// look like a Google event (src/lib/calendarSync.js deviceRowToEvent) and posts
// them here, so every rule below — AI classification, reminder plans, dedupe,
// date patches — is shared with Google imports. Ids are "device:<cal>:<id>".
async function syncCalendarAccount(base44, user, accessToken, calendarEmail, heartbeat = async () => {}, device = null) {
  const runId = crypto.randomUUID().slice(0, 8);
  // All-day calendar items have no clock time, so we anchor them at 9 AM in the
  // USER'S timezone. Without this the server's UTC clock made that 9 AM UTC,
  // i.e. 4 AM local — and its "1 hour before" nudge landed at 3 AM.
  const userTz = (user as any)?.timezone || null;

  // Fetch the connected Gmail account info
  let connectedEmail = calendarEmail;
  let allItems = [];
  // Only the phone's calendars are read now (Google's own calendar API was the
  // original source, retired Oct 1, 2026 — nobody had connected one, and the
  // phone's calendars cover Google, Samsung, Outlook and the rest).
  connectedEmail = 'this phone';
  allItems = device && Array.isArray(device.events) ? device.events.filter(e => e && e.id && String(e.id).startsWith('device:')) : [];
  let events = allItems.filter(e => e.status !== 'cancelled');
  const cancelledItems = allItems.filter(e => e.status === 'cancelled');
  console.log('[syncGoogleCalendar] calendar fetch OK for=', connectedEmail, '| raw items=', allItems.length, '| active events=', events.length, '| cancelled=', cancelledItems.length);

  // Load all existing synced events for this user
  // EVERY import row for this user, paged. With no limit, filter() returns only
  // 50 rows, so a calendar with more than 50 imported events had most of them
  // looking "not imported yet" on every sync.
  const existingSynced = await filterAll(base44.asServiceRole.entities.CalendarSyncedEvent, { user_email: user.email });
  const existingByGoogleId = {};
  for (const s of existingSynced) existingByGoogleId[s.google_event_id] = s;

  // The phone has no "cancelled" status: an event that was deleted there is
  // simply gone from the list. So for every phone calendar covered by this
  // sync, an imported row that is no longer sent, and whose event hasn't
  // already happened, counts as cancelled and is handled exactly like a
  // Google cancellation below. Calendars not covered by this sync are left
  // alone — they weren't read, so nothing can be said about them.
  if (device) {
    // A Google account's calendar on the phone holds the same events the app
    // may already have imported straight from Google. The phone row carries
    // Google's event id (syncId). An event already imported that way is
    // ADOPTED rather than copied: its import row is re-keyed to the phone id,
    // so from here on the phone sync owns it (date changes and deletions keep
    // working) and its task is left exactly as it is. A modified occurrence
    // ("<series>_<time>") whose series came from Google but which was never
    // imported on its own waits for the next sync, when the series row is the
    // phone's.
    const fromGoogle = new Map<string, any>();
    for (const r of existingSynced) {
      const id = String(r.google_event_id || '');
      if (id && !id.startsWith('device:')) fromGoogle.set(id, r);
    }
    if (fromGoogle.size > 0) {
      const keep: any[] = [];
      let adopted = 0, deferred = 0;
      for (const e of events) {
        const sid = String(e.syncId || '');
        const row = sid ? fromGoogle.get(sid) : null;
        if (row) {
          await base44.asServiceRole.entities.CalendarSyncedEvent.update(row.id, { google_event_id: String(e.id) }).catch(() => {});
          delete existingByGoogleId[sid];
          row.google_event_id = String(e.id);
          existingByGoogleId[String(e.id)] = row;
          fromGoogle.delete(sid);
          adopted++;
          keep.push(e);
          continue;
        }
        if (sid && fromGoogle.has(sid.split('_')[0])) { deferred++; continue; }
        keep.push(e);
      }
      events = keep;
      if (adopted || deferred) {
        console.log('[syncGoogleCalendar] phone sync: adopted', adopted, 'events first imported from Google; deferred', deferred, 'modified occurrences');
      }
    }

    const covered = new Set((device.calendarIds || []).map(String));
    const sentIds = new Set(allItems.map(e => String(e.id)));
    // How many rows each covered calendar sent this time. A covered calendar
    // that sent NOTHING while the app holds future imports from it is read as
    // a failed or empty read, not as "every event was deleted": nothing of
    // its is cancelled this run, and the next read that brings rows settles
    // it. Without this one blank read from the phone (a provider hiccup, a
    // calendar switched off for a moment) would delete every imported
    // future event and its reminders in one go (found Oct 24 2026, when a
    // tester's second read came back with 0 events).
    const sentPerCal = new Map<string, number>();
    for (const e of allItems) {
      const c = String(e.id).split(':')[1];
      sentPerCal.set(c, (sentPerCal.get(c) || 0) + 1);
    }
    const nowMs = Date.now();
    const emptyKept = new Map<string, number>();
    for (const row of existingSynced) {
      const gid = String(row.google_event_id || '');
      if (!gid.startsWith('device:')) continue;
      const calId = gid.split(':')[1];
      if (!covered.has(calId) || sentIds.has(gid)) continue;
      const startMs = row.start_time ? new Date(row.start_time).getTime() : NaN;
      if (!isNaN(startMs) && startMs < nowMs) continue;
      if (!sentPerCal.get(calId)) {
        emptyKept.set(calId, (emptyKept.get(calId) || 0) + 1);
        continue;
      }
      cancelledItems.push({ id: gid, status: 'cancelled' });
    }
    for (const [calId, n] of emptyKept) {
      console.log('[syncGoogleCalendar] calendar', calId, 'sent no rows this read; keeping its', n, 'imported future events instead of cancelling them');
    }
  }

  let created = 0, updated = 0, skipped = 0, cancelledRemoved = 0;
  const budget = { n: MAX_REMINDERS_PER_SYNC };
  const results = [];
  // Tasks this run made or moved, checked for double bookings at the end.
  const toCheck: string[] = [];

  // --- Cancelled in Google → skip it here too ---
  // A cancelled event is not happening. If it was never imported there's
  // nothing to do; if it WAS imported, the task and every scheduled push for
  // it are removed, so no reminder ever fires for an event that's off.
  // The same event can be imported from two calendars as ONE task (see the
  // twin check below). Removing it from one of them must not delete the task
  // while the other calendar still has it.
  const cancelledIdSet = new Set(cancelledItems.map((i: any) => String(i.id)));
  for (const item of cancelledItems) {
    const row = existingByGoogleId[item.id];
    if (!row) continue;
    const sharedWithAnotherCalendar = !!row.adhd_task_id && Object.values(existingByGoogleId).some((r: any) =>
      r && r.id !== row.id && r.adhd_task_id === row.adhd_task_id && !cancelledIdSet.has(String(r.google_event_id)));
    if (sharedWithAnotherCalendar) {
      console.log('[syncGoogleCalendar] removed from one calendar but still on another, keeping the task:', item.id);
    }
    if (row.adhd_task_id && !isClaimSentinel(row.adhd_task_id) && !sharedWithAnotherCalendar) {
      const task = await base44.asServiceRole.entities.Task.get(row.adhd_task_id).catch(() => null);
      if (task) {
        for (const nid of task.onesignal_notification_ids || []) {
          await base44.asServiceRole.functions.invoke('cancelScheduled', { notificationId: nid }).catch(() => {});
        }
        for (const entry of task.reminder_schedule || []) {
          if (entry?.notification_id && !String(entry.notification_id).startsWith('planned_')) {
            await base44.asServiceRole.functions.invoke('cancelScheduled', { notificationId: entry.notification_id }).catch(() => {});
          }
        }
        await base44.asServiceRole.entities.Task.delete(task.id).catch(() => {});
      }
    }
    await base44.asServiceRole.entities.CalendarSyncedEvent.delete(row.id).catch(() => {});
    delete existingByGoogleId[item.id];
    cancelledRemoved++;
    console.log('[syncGoogleCalendar] event cancelled in Google, removed import:', item.id);
  }

  // Google returns a recurring series' master record AND any individual
  // occurrences that were modified. Both used to become tasks, so a series
  // showed up twice on the same day. Map each series to the days its own
  // occurrences already cover, so the master can stand down for those days.
  const masterIds = new Set(events.filter(e => (e.recurrence || []).length).map(e => e.id));
  const seriesInstanceDays: Record<string, Set<string>> = {};
  for (const e of events) {
    const baseId = String(e.id || '').includes('_') ? String(e.id).split('_')[0] : null;
    if (!baseId || !masterIds.has(baseId)) continue;
    const raw = e.start?.dateTime || e.start?.date;
    if (!raw) continue;
    (seriesInstanceDays[baseId] ||= new Set()).add(new Date(raw).toISOString().slice(0, 10));
  }

  // Split events into already-synced (fast path) and new (needs AI). A claim
  // marker is NOT an imported task, so those fall to the new-event path where
  // the lock below decides who may actually import them.
  const isImported = (e) => {
    const linked = existingByGoogleId[e.id]?.adhd_task_id;
    return !!linked && !isClaimSentinel(linked);
  };
  const alreadySynced = events.filter(isImported);
  const newEvents = events.filter(e => !isImported(e));

  // Batch-load every linked task by ID in one go (service role, so no
  // recipient-email mismatch can hide a task) instead of one serial fetch per
  // event — that per-event loop was the bulk of the sync time.
  const linkedIds = Array.from(new Set(alreadySynced.map(e => existingByGoogleId[e.id].adhd_task_id)));
  const tasksById: Record<string, any> = {};
  const CHUNK = 100;
  await Promise.all(
    Array.from({ length: Math.ceil(linkedIds.length / CHUNK) }, (_, i) => linkedIds.slice(i * CHUNK, (i + 1) * CHUNK))
      .map(async (chunk) => {
        // Explicit limit: without one, filter() returns at most 50 of the 100 ids asked for.
        const rows = await base44.asServiceRole.entities.Task.filter({ id: { $in: chunk } }, '-created_date', CHUNK);
        for (const t of rows) tasksById[t.id] = t;
      })
  );

  // Already-synced events: patch dates if Google changed them, or mark a
  // user-deleted task as seen. Run in parallel batches.
  // A repeating series whose task the user deleted is remembered here, so a
  // single occurrence of it that was later moved in the calendar (it arrives
  // with its own id, "<series>_<time>") doesn't sneak back in as a new task.
  const deletedSeries = new Set<string>();
  const PARALLEL = 10;
  for (let i = 0; i < alreadySynced.length; i += PARALLEL) {
    await Promise.all(alreadySynced.slice(i, i + PARALLEL).map(async (event) => {
      const existing = existingByGoogleId[event.id];
      const existingTask = tasksById[existing.adhd_task_id];
      if (existingTask) {
        const didUpdate = await patchExistingTaskDates(base44, existing, existingTask, event, userTz, { user, budget, toCheck });
        if (didUpdate) { updated++; } else { skipped++; }
        return;
      }
      // The user deleted this task in the app. Respect that deletion — don't
      // re-import the Google event. Refresh last_synced_at so we don't keep
      // re-checking it every sync.
      if ((event.recurrence || []).length) deletedSeries.add(String(event.id));
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(existing.id, {
        last_synced_at: new Date().toISOString(),
      });
      skipped++;
    }));
  }

  // The same event saved in two calendars (an invite in both a work and a
  // personal calendar, a birthday in both Google and Samsung) arrives with two
  // different ids. Everything already imported is indexed by title + start, so
  // a second copy is recorded as the SAME task instead of becoming another
  // one — and if the user finished or deleted that task, this copy stays that
  // way too. Built after the cancellations above, so a copy that was just
  // removed can't swallow one that moved to another calendar.
  const twinKey = (titleRaw: any, startRawIn: any) => {
    const t = String(titleRaw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const sr = String(startRawIn || '');
    if (!t || !sr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sr)) return `${t}|D:${sr}`;
    const ms = Date.parse(sr);
    return isNaN(ms) ? '' : `${t}|T:${ms}`;
  };
  const twinIndex = new Map<string, any>();
  for (const r of Object.values(existingByGoogleId) as any[]) {
    if (!r || !r.adhd_task_id || isClaimSentinel(r.adhd_task_id)) continue;
    const k = twinKey(r.title, r.start_time);
    if (k && !twinIndex.has(k)) twinIndex.set(k, r);
  }

  // Which of the birthdays coming in for the first time are animals' (see
  // judgeAnimalBirthdays). Asked once, before any of them is made.
  const newBirthdayNames = Array.from(new Set(newEvents
    .filter((e: any) => isBirthdayEvent(e.summary || '', (e.recurrence || []).join(';')))
    .map((e: any) => extractBirthdayPerson(e.summary || ''))
    .filter((n: string) => !!n)));
  const otherTitles = Array.from(new Set(events
    .filter((e: any) => !isBirthdayEvent(e.summary || '', (e.recurrence || []).join(';')))
    .map((e: any) => String(e.summary || '').trim())
    .filter(Boolean)));
  const animalBirthdays = await judgeAnimalBirthdays(newBirthdayNames, otherTitles);

  let processedNew = 0;
  for (const event of newEvents) {
    if (++processedNew % HEARTBEAT_EVERY === 0) await heartbeat();
    const googleId = event.id;
    const title = event.summary || 'Untitled event';
    const recurrenceRule = (event.recurrence || []).join(';');
    const startRaw = event.start?.dateTime || event.start?.date;
    const endRaw = event.end?.dateTime || event.end?.date;
    const isAllDay = !event.start?.dateTime;
    const attendeeCount = (event.attendees || []).length;

    let existing = existingByGoogleId[googleId];

    // One occurrence of a series the user deleted in the app stays deleted too.
    const seriesOf = String(googleId).includes('_') ? String(googleId).split('_')[0] : '';
    if (seriesOf && deletedSeries.has(seriesOf)) {
      console.log('[syncGoogleCalendar] occurrence of a series the user deleted, not importing:', googleId);
      skipped++;
      continue;
    }

    // CLAIM this event BEFORE any slow work. AI classification takes seconds,
    // and two syncs can run at once (a brand-new account's first connect fires
    // the background sync AND the connect-time sync together). Both used to
    // pass the "already imported?" check inside that window and both created a
    // task — every event duplicated. Now each run writes its claim row first,
    // then both resolve the SAME winner deterministically and the loser bails.
    let claim = existing || null;
    if (!claim) {
      claim = await base44.asServiceRole.entities.CalendarSyncedEvent.create({
        google_event_id: googleId,
        title,
        user_email: user.email,
        last_synced_at: new Date().toISOString(),
      });
      const rivals = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({
        google_event_id: googleId,
        user_email: user.email,
      });
      if (rivals.length > 1) {
        // A rival that already finished (has a task) wins outright; otherwise
        // the oldest claim wins. Never delete a rival's claim — it may still be
        // working, and removing it would make it think it won.
        const finished = rivals.find(r => r.adhd_task_id);
        const winner = finished || rivals.slice().sort((a, b) =>
          String(a.created_date || '').localeCompare(String(b.created_date || '')) ||
          String(a.id).localeCompare(String(b.id))
        )[0];
        if (winner.id !== claim.id) {
          console.log('[syncGoogleCalendar] lost claim race, skipping:', googleId);
          await base44.asServiceRole.entities.CalendarSyncedEvent.delete(claim.id).catch(() => {});
          skipped++;
          continue;
        }
        claim = winner;
      }
    }

    // Take the working lock on this claim. A fresh marker from another run means
    // that run is mid-import — stand down rather than import a second copy.
    const held = claim.adhd_task_id;
    if (held && !isClaimSentinel(held)) { skipped++; continue; }   // finished elsewhere
    if (isClaimSentinel(held) && claimAgeMs(held) < STALE_CLAIM_MS) {
      console.log('[syncGoogleCalendar] another run holds this event, skipping:', googleId);
      skipped++;
      continue;
    }
    const sentinel = `${CLAIM_PREFIX}${runId}:${Date.now()}`;
    await base44.asServiceRole.entities.CalendarSyncedEvent.update(claim.id, { adhd_task_id: sentinel });
    // Let a simultaneous run's write land before reading back, so the two runs
    // agree on a single winner instead of both reading their own marker.
    await new Promise((r) => setTimeout(r, 400));
    const confirmed = await base44.asServiceRole.entities.CalendarSyncedEvent.get(claim.id).catch(() => null);
    if (confirmed?.adhd_task_id !== sentinel) {
      console.log('[syncGoogleCalendar] lost working lock, skipping:', googleId);
      skipped++;
      continue;
    }

    // Same event, other calendar: record this copy as that task and stop.
    const myTwinKey = twinKey(title, startRaw);
    const twin = myTwinKey ? twinIndex.get(myTwinKey) : null;
    if (twin && String(twin.google_event_id) !== String(googleId)) {
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(claim.id, {
        google_event_id: googleId,
        title,
        start_time: startRaw || null,
        end_time: endRaw || null,
        is_all_day: isAllDay,
        attendee_count: attendeeCount,
        recurrence_rule: recurrenceRule || null,
        adhd_task_id: twin.adhd_task_id,
        last_synced_at: new Date().toISOString(),
        user_email: user.email,
      });
      console.log('[syncGoogleCalendar] same event already imported from another calendar, linking instead of copying:', googleId, '→', twin.google_event_id);
      skipped++;
      continue;
    }

    const isBirthday = isBirthdayEvent(title, recurrenceRule);

    // Run AI classification — not for a birthday. Everything about a birthday
    // (its title, yearly repeat, its own reminder rules) is fixed below and
    // nothing from the AI is used, yet the call was most of the ~8 seconds each
    // one took to import (Anna, Oct 13 2026: a first sync of 8 birthdays spun
    // for a minute and a half, "feels like a glitch").
    // Fallback if AI fails — default to a one-time event so we don't spam
    // recurring reminders for something we couldn't classify.
    const plainEvent = { urgency: 'medium', energy_required: 'medium', reminder_interval: 'once', needs_date_pick: false, target_date: null };
    let ai = plainEvent;
    if (!isBirthday) {
      try {
        ai = await classifyEventWithAI(base44, event, user);
      } catch (e) {
        console.log('[syncGoogleCalendar] parseTask failed, defaulting to event:', e.message);
        ai = plainEvent;
      }
    }
    const routedAs = isBirthday ? 'birthday' : 'task';

    // Build rich description including location, meeting link, notes
    const descParts = [];
    if (event.description) descParts.push(event.description.substring(0, 500));
    if (event.location) descParts.push(`📍 Location: ${event.location}`);
    if (event.organizer?.email && event.organizer.email !== user.email) {
      descParts.push(`👤 Organizer: ${event.organizer.displayName || event.organizer.email}`);
    }
    if (attendeeCount > 0) {
      const names = (event.attendees || []).slice(0, 5).map(a => a.displayName || a.email).join(', ');
      descParts.push(`👥 Attendees: ${names}${attendeeCount > 5 ? ` +${attendeeCount - 5} more` : ''}`);
    }
    // Meeting link from conferenceData
    const meetLink = event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
    if (meetLink) descParts.push(`🎥 Meeting link: ${meetLink}`);

    const richDescription = descParts.join('\n\n');
    // For all-day events, Google sends a plain date string (e.g. "2027-07-20").
    // new Date("2027-07-20") parses as UTC midnight, which shifts to the prior day in US timezones.
    // Parse date-only strings as local time to preserve the correct calendar day.
    let nextReminderDate;
    if (startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
      const [y, m, d] = startRaw.split('-').map(n => parseInt(n, 10));
      nextReminderDate = wallClockToUtc(y, m, d, 9, 0, userTz);
    } else if (startRaw) {
      nextReminderDate = new Date(startRaw);
    } else {
      nextReminderDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    // Google returns a recurring event's "master" record whose start date is
    // the ORIGINAL occurrence (often in the past). Advance to the next
    // upcoming occurrence so the reminder isn't set to a past date.
    if (recurrenceRule && nextReminderDate < new Date()) {
      if (recurrenceRule.includes('FREQ=YEARLY')) {
        // Step by full calendar years — fixed 365-day jumps drift ~1 day per
        // leap year, which over decades moves a birthday off its real date.
        let yr = nextReminderDate.getFullYear();
        const mo = nextReminderDate.getMonth();
        const dy = nextReminderDate.getDate();
        const hr = nextReminderDate.getHours();
        const mn = nextReminderDate.getMinutes();
        while (nextReminderDate < new Date()) {
          yr++;
          nextReminderDate = new Date(yr, mo, dy, hr, mn, 0, 0);
        }
      } else {
        // Whole calendar days / weeks / months on the USER'S clock. Fixed day
        // steps on the server's UTC clock moved a weekly 9 AM meeting to 8 AM
        // after daylight saving ended, and "monthly" was +30 days.
        const unit = recurrenceRule.includes('FREQ=WEEKLY') ? 'week'
          : recurrenceRule.includes('FREQ=MONTHLY') ? 'month' : 'day';
        nextReminderDate = nextLocalOccurrence(nextReminderDate, unit, Date.now(), userTz);
      }
    }

    // This series already has its own occurrence imported for this day — don't
    // let the master create a second, identical task on the same date.
    if (recurrenceRule && seriesInstanceDays[googleId]?.has(nextReminderDate.toISOString().slice(0, 10))) {
      console.log('[syncGoogleCalendar] master occurrence already covered by an instance, skipping:', googleId);
      await base44.asServiceRole.entities.CalendarSyncedEvent.delete(claim.id).catch(() => {});
      skipped++;
      continue;
    }

    let taskRecord;
    let reminderInterval = 'once';
    if (isBirthday) {
      const birthdayPerson = extractBirthdayPerson(title);
      const ownBirthday = isOwnBirthday(title, birthdayPerson, user);
      const birthdayDisplay = ownBirthday
        ? 'Your Birthday'
        : `${birthdayPerson}'s Birthday`;
      taskRecord = {
        title: `🎂 ${birthdayDisplay}`,
        is_own_birthday: ownBirthday,
        description: richDescription || (device ? 'Imported from your phone\'s calendar' : `Imported from Google Calendar (${connectedEmail})`),
        notes: event.description || '',
        urgency: 'medium',
        energy_required: 'low',
        status: 'active',
        reminder_interval: 'once',
        recurrence_pattern: 'yearly',
        birthday_person: ownBirthday ? null : birthdayPerson,
        // A pet's birthday: the same reminders, never a word about a text.
        birthday_animal: ownBirthday ? null : (animalBirthdays[String(birthdayPerson || '').toLowerCase()] || null),
        birthday_remind_week_before: !ownBirthday,
        birthday_remind_day_before: !ownBirthday,
        birthday_remind_day_of: true,
        classification: 'birthday',
        next_reminder: birthdayMorning(nextReminderDate, userTz).toISOString(),
        notification_recipient_email: user.email
      };
    } else {
      const validUrgency = ['low', 'medium', 'high', 'urgent'].includes(ai.urgency) ? ai.urgency : 'medium';
      const validEnergy = ['low', 'medium', 'high'].includes(ai.energy_required) ? ai.energy_required : 'medium';
      // Same once-vs-interval decision as AddTask and native capture, from the
      // one shared rule. A Google item ALWAYS has a real start date, so the
      // dateless "smart reminder" (null) branch can never apply here — an
      // explicit rhythm wins, otherwise it's a single reminder at event time.
      // Everything calendar-specific below (notes, location, multi-day span,
      // birthdays, recurrence) stays right here on purpose.
      const isOnce = !(!ai.needs_date_pick && isRecurringInterval(ai.reminder_interval));
      reminderInterval = isOnce ? 'once' : ai.reminder_interval;

      let nextReminderISO;
      let dueDateISO = null;
      let endDateISO = null;
      let startDateISO = null;
      let eventTimeISO = null;
      if (isOnce) {
        // Event: fire the single reminder at the event's start time.
        nextReminderISO = nextReminderDate.toISOString();
        dueDateISO = nextReminderDate.toISOString();
        // Timed (non-all-day) events: store the actual event time so the
        // task detail view shows the event's date & time from the calendar.
        if (event.start?.dateTime) eventTimeISO = nextReminderDate.toISOString();
        // Multi-day events: record the last day so the app shows the full
        // span (calendar grid + Home "Today" + event detail). For all-day
        // events Google's end date is exclusive, so the last day is one
        // day earlier than the raw end.
        if (endRaw) {
          let endDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
            const [y, m, d] = endRaw.split('-').map(n => parseInt(n, 10));
            endDate = wallClockToUtc(y, m, d - 1, 9, 0, userTz);
          } else {
            endDate = new Date(endRaw);
          }
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          if (endDate > nextReminderDate && fmt(endDate) !== fmt(nextReminderDate)) {
            endDateISO = endDate.toISOString();
          }
        }
      } else {
        // Task: start interval reminders now (same as AddTask).
        const startGap = INTERVAL_MS[reminderInterval] || INTERVAL_MS['2hours'];
        nextReminderISO = new Date(Date.now() + startGap).toISOString();
        // Anchor the task to its calendar date (deadline) if the AI found one.
        if (ai.target_date) {
          const [y, m, d] = String(ai.target_date).split('-').map(n => parseInt(n, 10));
          if (y && m && d) dueDateISO = new Date(y, m - 1, d, 17, 0, 0, 0).toISOString();
        }
        // Preserve multi-day span for tasks the same way events keep theirs:
        // if the Google event spans multiple days, anchor start_date to the
        // event start and end_date (plus due_date) to the event end so the
        // task shows on each day of the span and drops off after the last day.
        if (endRaw) {
          let endDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
            const [y, m, d] = endRaw.split('-').map(n => parseInt(n, 10));
            endDate = wallClockToUtc(y, m, d - 1, 9, 0, userTz);
          } else {
            endDate = new Date(endRaw);
          }
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          if (endDate > nextReminderDate && fmt(endDate) !== fmt(nextReminderDate)) {
            startDateISO = nextReminderDate.toISOString();
            endDateISO = endDate.toISOString();
            // The event end is the natural deadline for a multi-day task.
            dueDateISO = endDate.toISOString();
          }
        }
      }

      taskRecord = {
        title: title,
        description: richDescription,
        notes: [
          event.description ? String(event.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500) : '',
          event.location ? `📍 ${event.location}` : '',
        ].filter(Boolean).join('\n\n'),
        // Explicit calendar location — safe to store since the user actually
        // set it on the event. Drives the errand-combining nudges.
        location: event.location || null,
        urgency: validUrgency,
        energy_required: validEnergy,
        status: 'active',
        reminder_interval: reminderInterval,
        reminder_count: 0,
        next_reminder: nextReminderISO,
        start_date: startDateISO,
        due_date: dueDateISO,
        end_date: endDateISO,
        event_time: eventTimeISO,
        // A time on their own calendar is a time they set: it may ring inside
        // their quiet hours (a 5 AM flight; RULES.md §9 Q4).
        time_stated: !!eventTimeISO,
        // The AI's own read of the title decides event vs task. It used to be
        // "anything with a single reminder is an event", which turned every
        // dated bill or errand from the calendar into an event.
        // "birthday" from the parser on an entry that isn't a yearly birthday
        // (those were routed above) is a party or celebration: an event. It
        // used to fall through to "task".
        classification: (ai.classification === 'payment' || isPaymentTitle(title))
          ? 'payment'
          : (isOnce && (ai.classification === 'event' || ai.classification === 'birthday') ? 'event' : 'task'),
        // A reminder instruction written into the event ("remind me the night
        // before") — the planners obey it. Usually null.
        reminder_wish: ai?.reminder_wish || null,
        notification_recipient_email: user.email,
        recurrence_pattern: recurrenceRule ? (recurrenceRule.includes('FREQ=DAILY') ? 'daily' : recurrenceRule.includes('FREQ=WEEKLY') ? 'weekly' : recurrenceRule.includes('FREQ=MONTHLY') ? 'monthly' : recurrenceRule.includes('FREQ=YEARLY') ? 'yearly' : 'none') : 'none'
      };
    }

    // Sync-record fields that don't depend on the task — built up front so the
    // claim row can be finished the moment a task exists.
    const syncMeta: any = {
      google_event_id: googleId,
      title,
      start_time: startRaw || null,
      end_time: endRaw || null,
      is_all_day: isAllDay,
      attendee_count: attendeeCount,
      recurrence_rule: recurrenceRule || null,
      ai_importance: ai.urgency === 'urgent' || ai.urgency === 'high' ? 'high' : ai.urgency === 'low' ? 'low' : 'medium',
      ai_reminder_interval: reminderInterval,
      item_type: isBirthday ? 'event' : (reminderInterval === 'once' ? 'event' : 'task'),
      routed_as: routedAs,
      last_synced_at: new Date().toISOString(),
      user_email: user.email,
    };

    // TASK-LEVEL IDEMPOTENCY. The claim row is a lock, not a record of truth —
    // a run killed after Task.create but before finishing its claim left a task
    // with a "claiming" row that re-imported once the lock went stale. The task
    // itself now carries (google_event_id, recipient): if one already exists
    // for this event, adopt it and never create a second.
    const priorTasks = await base44.asServiceRole.entities.Task.filter({
      google_event_id: googleId,
      notification_recipient_email: user.email,
    });
    const prior = (priorTasks || []).find((t: any) => t.status !== 'completed') || priorTasks?.[0];
    if (prior) {
      console.log('[syncGoogleCalendar] task already exists for event, adopting instead of creating:', googleId);
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(claim.id, { ...syncMeta, adhd_task_id: prior.id });
      if (myTwinKey && !twinIndex.has(myTwinKey)) twinIndex.set(myTwinKey, { google_event_id: googleId, adhd_task_id: prior.id });
      skipped++;
      continue;
    }

    taskRecord.google_event_id = googleId;
    // Marks "reminders are being booked right now" so the refill cron leaves
    // this task alone until the ids below are written.
    taskRecord.reminder_scheduling_since = new Date().toISOString();

    // Use user-scoped create so created_by is set to the current user (making the task visible in the app)
    const createdTask = await base44.entities.Task.create(taskRecord);

    // FINISH THE CLAIM IMMEDIATELY — before any reminder work. Everything below
    // is slow (LLM schedule + pushes) and interruptible; from this point on the
    // event is recorded as imported no matter what happens next.
    await base44.asServiceRole.entities.CalendarSyncedEvent.update(claim.id, { ...syncMeta, adhd_task_id: createdTask.id });
    if (myTwinKey && !twinIndex.has(myTwinKey)) twinIndex.set(myTwinKey, { google_event_id: googleId, adhd_task_id: createdTask.id });
    created++;
    results.push({ googleId, title, routedAs, urgency: ai.urgency });
    toCheck.push(createdTask.id);

    // Whatever gets booked below is committed in ONE write together with
    // clearing the in-progress marker.
    const finalPatch: any = { reminder_scheduling_since: null };

    // One-time events get their reminder plan from the shared planner — the same
    // one cronRefillReminders uses for a task dated too far out to book. The
    // WHOLE plan is always saved. An entry is booked right now only if it is
    // inside OneSignal's ~30-day window AND this run still has push budget;
    // everything else stays planned (a `planned_…` placeholder id) and the hourly
    // event pass books it later. No imported event is ever left without a plan.
    if (!isBirthday && reminderInterval === 'once' && createdTask.next_reminder) {
      Object.assign(finalPatch, await planEventReminders(base44, user, createdTask, {
        title,
        isAllDay,
        location: (createdTask as any).location || (taskRecord as any).location || '',
        // Nothing the app picked lands in their quiet hours; the event's own
        // start, a time they set, may (RULES.md §9 Q4).
        startIsTheirs: !isAllDay && ((createdTask as any).time_stated === true || (taskRecord as any)?.time_stated === true),
        budget,
      }));
    }

    await base44.asServiceRole.entities.Task.update(createdTask.id, finalPatch).catch((e) =>
      console.log('[syncGoogleCalendar] could not finalize task reminders:', e.message));
    // Its alarms go to the phone now: an import made with the app closed (the
    // phone's own calendar sync, CalendarSyncWorker) has no app open to rebuild
    // them, and an alarm user's event has to ring as an alarm (PushFilter).
    await pushPhoneAlarms({ ...createdTask, ...finalPatch }, user, { source: 'calendarSync' }).catch(() => {});
  }

  // Double bookings and likely duplicates among what just came in, against
  // everything else of theirs (shared/eventConflicts.ts; Anna, Oct 23 2026).
  // The flags go on their account for the app to show; a normal notification
  // follows in 15 minutes if the popup isn't seen. Returned too, so an app
  // that is open shows the popup right away.
  let conflicts: any = { flags: [], items: {} };
  if (toCheck.length) {
    await heartbeat();
    const fresh = await base44.asServiceRole.entities.Task.filter({ id: { $in: toCheck.slice(0, 200) } }, '-created_date', 200).catch(() => []);
    conflicts = await flagConflicts(base44, user, fresh, { source: 'calendar', notify: true }).catch((e: any) => {
      console.log('[syncGoogleCalendar] conflict check failed:', e?.message || e);
      return { flags: [], items: {} };
    });
    if (conflicts.flags?.length) console.log('[syncGoogleCalendar] flagged', conflicts.flags.length, 'overlap/duplicate pair(s)');
  }

  return { created, updated, skipped, cancelledRemoved, total_events: events.length, results, connectedEmail, conflicts: { flags: conflicts.flags || [], items: conflicts.items || {} } };
}

Deno.serve(async (req) => {
  // Which call we're on. The top-level catch used to log a bare
  // "Base44Error: 403" with a minified stack, which named no call at all — so a
  // sync failing at the very first step looked identical to one failing deep in
  // the import. Every step below updates this, and the catch reports it.
  let step = 'create_client';
  try {
    const base44 = createClientFromRequest(req);
    step = 'auth.me';
    const user = await withChallengeRetry(() => base44.auth.me());
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get the user's Google Calendar token from the platform
    let connectedEmail = user.email;

    const body = await req.json().catch(() => ({}));

    // Probe: the web Calendar page used to ask whether a Google Calendar was
    // connected. Google's calendar API is retired; the phone's calendars are
    // the only source, so the answer is always no.
    if (body.probe) {
      return Response.json({ connected: false, retired: true });
    }

    // Phone calendars: the app already read the events on the device and sends
    // them here — no Google token involved. Same lock, same import pipeline.
    if (body.source === 'device') {
      step = 'device.validate';
      // The app sends events it shaped itself; the phone's background sync
      // (CalendarSyncWorker) sends its calendar rows as read.
      const fromRows = Array.isArray(body.rows);
      if (!Array.isArray(body.events) && !fromRows) {
        return Response.json({ error: 'bad_request', message: 'events[] or rows[] required for a phone calendar sync' }, { status: 400 });
      }
      console.log('[syncGoogleCalendar] phone sync from', body.from === 'phone_background' ? 'the phone, app closed' : 'the app');
      const device = {
        events: fromRows ? body.rows.slice(0, 2500).map(deviceRowToEvent).filter(Boolean) : body.events.slice(0, 2500),
        calendarIds: Array.isArray(body.calendarIds) ? body.calendarIds.map(String) : [],
      };
      step = 'acquireSyncLock';
      const dlock = await acquireSyncLock(base44, user);
      if (!dlock.acquired) {
        return Response.json({ success: true, in_progress: true, skipped: true, since: dlock.since || null });
      }
      let dresult;
      try {
        step = 'syncCalendarAccount.device';
        dresult = await syncCalendarAccount(base44, user, null, 'this phone', dlock.heartbeat, device);
      } finally {
        step = 'lock.release';
        await dlock.release();
      }
      if (dresult.error) {
        return Response.json({ error: dresult.error, details: dresult.details }, { status: 502 });
      }
      console.log('[syncGoogleCalendar] phone sync done | created=', dresult.created, 'updated=', dresult.updated, 'skipped=', dresult.skipped, 'cancelled=', dresult.cancelledRemoved, 'total=', dresult.total_events);
      return Response.json({
        success: true,
        source: 'device',
        synced_at: new Date().toISOString(),
        total_events: dresult.total_events,
        created: dresult.created,
        updated: dresult.updated,
        skipped: dresult.skipped,
        cancelled_removed: dresult.cancelledRemoved,
        results: dresult.results,
        conflicts: dresult.conflicts || { flags: [], items: {} },
      });
    }
    // Anything else was the Google Calendar sync. Retired: the phone's
    // calendars are the only source now, and nobody had connected Google.
    return Response.json({ success: true, skipped: true, reason: 'google_calendar_retired', connected_email: connectedEmail });

  } catch (error) {
    const status = error?.response?.status ?? error?.status ?? null;
    const detail = (() => {
      try { return JSON.stringify(error?.response?.data ?? error?.data ?? {}).slice(0, 500); }
      catch { return '{}'; }
    })();
    console.error('[syncGoogleCalendar] FAILED at step=', step, '| name=', error?.name, '| status=', status, '| message=', error?.message, '| detail=', detail);
    return Response.json({ error: error.message, failed_step: step, upstream_status: status }, { status: 500 });
  }
});