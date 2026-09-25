import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { buildTaskParsePrompt } from '../../shared/taskParsePrompt.ts';
// The shared prompt is bundled at deploy time; this function was last redeployed
// for the parser telling "by 5" (a deadline) apart from "at 5".
import { runTaskParse } from '../../shared/runTaskParse.ts';
import { wallClockToUtc, nextLocalOccurrence } from '../../shared/timezoneReminders.ts';
import { isRecurringInterval, INTERVAL_MS } from '../../shared/reminderIntervalDecision.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { filterAll } from '../../shared/listAll.ts';
import { buildEventReminderPlan, isBookableNow, isBookedId } from '../../shared/eventReminderPlan.ts';
import { getGoogleAccessToken } from '../../shared/googleOAuth.ts';
import { withChallengeRetry } from '../../shared/sdkRetry.ts';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

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
async function patchExistingTaskDates(base44, syncRec, taskRec, event, timeZone) {
  const startRaw = event.start?.dateTime || event.start?.date || null;
  const endRaw = event.end?.dateTime || event.end?.date || null;
  const startChanged = (syncRec.start_time || null) !== startRaw;
  const endChanged = (syncRec.end_time || null) !== endRaw;
  // Backfill end_date for one-time events that are missing it (e.g. synced
  // before the multi-day span logic landed). Without this, a re-sync where the
  // Google dates are unchanged returns early and never records end_date, so the
  // event detail never shows the full date range.
  const needsEndBackfill = taskRec.reminder_interval === 'once' && !taskRec.end_date && !!endRaw;
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
      if (event.start?.dateTime) patch.event_time = nextReminderDate.toISOString();
    }
    if (endRaw) {
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

  if (Object.keys(patch).length > 0) {
    await base44.asServiceRole.entities.Task.update(taskRec.id, patch);
  }
  await base44.asServiceRole.entities.CalendarSyncedEvent.update(syncRec.id, {
    start_time: startRaw,
    end_time: endRaw,
    last_synced_at: new Date().toISOString(),
    title: event.summary || syncRec.title || 'Untitled event',
  });
  return true;
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
    when = ` on ${d.toLocaleDateString('en-US')} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
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
  const calendarNote = '\n(From the user\'s Google Calendar. Every entry there has a date and time, including plain to-dos, errands and bills — so judge from the wording of the title alone whether this is an event they attend or a task they do.)';
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
  const authHeader = { Authorization: `Bearer ${accessToken}` };
  // All-day calendar items have no clock time, so we anchor them at 9 AM in the
  // USER'S timezone. Without this the server's UTC clock made that 9 AM UTC,
  // i.e. 4 AM local — and its "1 hour before" nudge landed at 3 AM.
  const userTz = (user as any)?.timezone || null;

  // Fetch the connected Gmail account info
  let connectedEmail = calendarEmail;
  let allItems = [];
  if (device) {
    connectedEmail = 'this phone';
    allItems = Array.isArray(device.events) ? device.events.filter(e => e && e.id && String(e.id).startsWith('device:')) : [];
  } else {
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: authHeader });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      connectedEmail = profile.email || calendarEmail;
    }
    } catch { /* use fallback */ }
    console.log('[syncGoogleCalendar] token actually belongs to =', connectedEmail, '| passed calendarEmail =', calendarEmail);

  // Fetch upcoming events (next 12 months)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=2500&singleEvents=false&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&fields=items(id,summary,start,end,attendees,recurrence,description,location,status,organizer,conferenceData)`;

  const calRes = await fetch(calUrl, { headers: authHeader });
  if (!calRes.ok) {
    const err = await calRes.json().catch(() => ({}));
    console.log('[syncGoogleCalendar] calendar API failed status=', calRes.status, 'err=', JSON.stringify(err), 'for=', connectedEmail);
    return { error: 'calendar_api_error', details: err, connectedEmail };
  }

  const calData = await calRes.json();
  allItems = calData.items || [];
  }
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
    const nowMs = Date.now();
    for (const row of existingSynced) {
      const gid = String(row.google_event_id || '');
      if (!gid.startsWith('device:')) continue;
      const calId = gid.split(':')[1];
      if (!covered.has(calId) || sentIds.has(gid)) continue;
      const startMs = row.start_time ? new Date(row.start_time).getTime() : NaN;
      if (!isNaN(startMs) && startMs < nowMs) continue;
      cancelledItems.push({ id: gid, status: 'cancelled' });
    }
  }

  let created = 0, updated = 0, skipped = 0, cancelledRemoved = 0;
  let pushBudget = MAX_REMINDERS_PER_SYNC;
  const results = [];

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
        const didUpdate = await patchExistingTaskDates(base44, existing, existingTask, event, userTz);
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

    // Run AI classification
    let ai;
    try {
      ai = await classifyEventWithAI(base44, event, user);
    } catch (e) {
      console.log('[syncGoogleCalendar] parseTask failed, defaulting to event:', e.message);
      // Fallback if AI fails — default to a one-time event so we don't spam
      // recurring reminders for something we couldn't classify.
      ai = { urgency: 'medium', energy_required: 'medium', reminder_interval: 'once', needs_date_pick: false, target_date: null };
    }

    const isBirthday = isBirthdayEvent(title, recurrenceRule);
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
        birthday_remind_week_before: !ownBirthday,
        birthday_remind_day_before: !ownBirthday,
        birthday_remind_day_of: true,
        classification: 'birthday',
        next_reminder: nextReminderDate.toISOString(),
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
        // The AI's own read of the title decides event vs task. It used to be
        // "anything with a single reminder is an event", which turned every
        // dated bill or errand from the calendar into an event.
        classification: (ai.classification === 'payment' || isPaymentTitle(title))
          ? 'payment'
          : (isOnce && ai.classification === 'event' ? 'event' : 'task'),
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
      try {
        // If the schedule generator fails, the planner still gives the event one
        // reminder at its start — never nothing.
        let rawReminders: any[] = [];
        try {
          const scheduleRes = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
            title,
            scheduledDateISO: createdTask.next_reminder,
            urgency: createdTask.urgency,
            classification: createdTask.classification || 'event',
            // Lets the "leave now" reminder be based on real drive time from home
            // instead of a blanket hour before.
            location: (createdTask as any).location || (taskRecord as any).location || '',
            // generateReminderSchedule reads `homeOrigin`. This used to be sent as
            // `homeZip`, which nothing reads, so an imported event with a location
            // never got its drive-time "leave now" reminder.
            homeOrigin: getHomeOrigin(user),
            avoidTolls: (user as any)?.commute_avoid_tolls === true,
            reminderWish: (createdTask as any)?.reminder_wish || null,
            timezone: (user as any)?.timezone || undefined,
          });
          const scheduleData = scheduleRes?.data || scheduleRes || {};
          rawReminders = scheduleData.reminders || [];
        } catch (e) {
          console.log('[syncGoogleCalendar] schedule generator failed, using the at-the-time fallback:', e.message);
        }

        const plan = buildEventReminderPlan({
          taskId: createdTask.id,
          rawReminders,
          eventStartISO: createdTask.next_reminder,
          title,
          isAllDay,
          isEvent: createdTask.classification === 'event',
          timeZone: (user as any)?.timezone || null,
        });

        for (const entry of plan) {
          // Out of budget or outside the window → stays planned for the hourly job.
          if (pushBudget <= 0 || !isBookableNow(entry.send_at)) continue;
          pushBudget--;
          try {
            const res = await base44.asServiceRole.functions.invoke('schedulePush', {
              internalKey: Deno.env.get('CRON_SECRET'), // proves this call comes from the app's own backend
              toUserExternalId: user.email,
              title: entry.notification_title,
              body: entry.notification_body,
              sendAtISO: entry.send_at,
              data: {
                screen: '/TaskNotification',
                taskId: createdTask.id,
                urgency: createdTask.urgency || 'medium',
                type: 'task_reminder',
              },
              buttons: [
                { id: 'snooze_15', text: 'Snooze 15 min' },
                { id: 'snooze_60', text: 'Snooze 1 hour' },
                { id: 'complete', text: '✅ Done' },
              ],
            });
            const result = res?.data || res;
            // The id goes on the entry it belongs to — never matched up by position.
            if (result?.notificationId) entry.notification_id = result.notificationId;
            // Refused (device not subscribed, OneSignal down): every other booking
            // this run would be refused too. Stop booking — the plans are still
            // saved, and the hourly job books them when it can.
            else if (result && result.success === false) pushBudget = 0;
          } catch (e) {
            console.log('[syncGoogleCalendar] reminder scheduling failed:', e.message);
          }
        }

        if (plan.length > 0) {
          finalPatch.reminder_schedule = plan;
          // Tells cronRefillReminders this task already has its server-written
          // plan, so it never rebuilds one the user later clears.
          finalPatch.reminder_plan_built_at = new Date().toISOString();
          // Only real OneSignal ids go in the id list — never a placeholder.
          finalPatch.onesignal_notification_ids = plan.map((e) => e.notification_id).filter(isBookedId);
        }
      } catch (e) {
        console.log('[syncGoogleCalendar] event reminder scheduling failed:', e.message);
      }
    }

    await base44.asServiceRole.entities.Task.update(createdTask.id, finalPatch).catch((e) =>
      console.log('[syncGoogleCalendar] could not finalize task reminders:', e.message));
  }

  return { created, updated, skipped, cancelledRemoved, total_events: events.length, results, connectedEmail };
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
    let accessToken;
    let connectedEmail = user.email;
    
    const body = await req.json().catch(() => ({}));

    // Probe mode: check whether a Google Calendar connection exists without
    // running a full sync (used by the Calendar page to render connect state).
    if (body.probe) {
      // App-owned grant first — this is the source of truth now. Only fall
      // through to the platform connector so users who linked before the
      // switch keep working until they reconnect.
      step = 'probe.ownGrant';
      try {
        const own = await getGoogleAccessToken(user);
        if (own) {
          return Response.json({
            connected: true,
            connected_email: user.google_account_email || user.email,
            source: 'app',
          });
        }
      } catch (err) {
        console.log('[syncGoogleCalendar] probe: own grant rejected by Google:', err.message);
        return Response.json({ error: 'reconnect_required', message: 'Google access expired — reconnect.' }, { status: 400 });
      }

      step = 'probe.getCurrentAppUserConnection';
      try {
        const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        if (conn?.accessToken) {
          // The platform often doesn't populate conn.email, so resolve the
          // real connected account straight from the token via userinfo.
          let realEmail = conn.email;
          if (!realEmail) {
            try {
              const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${conn.accessToken}` }
              });
              if (ui.ok) realEmail = (await ui.json()).email;
            } catch (e) {
              console.log('[syncGoogleCalendar] probe userinfo failed:', e.message);
            }
          }
          return Response.json({ connected: true, connected_email: realEmail || user.email });
        }
      } catch (err) {
        console.log('[syncGoogleCalendar] probe: no connection', err.message);
      }
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    // Phone calendars: the app already read the events on the device and sends
    // them here — no Google token involved. Same lock, same import pipeline.
    if (body.source === 'device') {
      step = 'device.validate';
      if (!Array.isArray(body.events)) {
        return Response.json({ error: 'bad_request', message: 'events[] required for a phone calendar sync' }, { status: 400 });
      }
      const device = {
        events: body.events.slice(0, 2500),
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
      });
    }

    // Phone calendars are in use on this account: the Google path is retired
    // for it, so a stray Google sync can't bring the same events in twice.
    if (Array.isArray(user.device_calendar_ids) && user.device_calendar_ids.length > 0) {
      return Response.json({ success: true, skipped: true, reason: 'phone_calendars_in_use' });
    }

    // App-owned grant first (see shared/googleOAuth.ts for why).
    step = 'ownGrant';
    try {
      accessToken = await getGoogleAccessToken(user);
      if (accessToken && user.google_account_email) connectedEmail = user.google_account_email;
    } catch (err) {
      console.log('[syncGoogleCalendar] own grant rejected by Google:', err.message);
      return Response.json({ error: 'reconnect_required', message: 'Google access expired — reconnect.' }, { status: 400 });
    }

    // Legacy path: platform app-user connector, for anyone still on it.
    step = 'getCurrentAppUserConnection';
    if (!accessToken) {
      try {
        const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        accessToken = conn?.accessToken;
        if (conn?.email) connectedEmail = conn.email;
      } catch (err) {
        console.log('[syncGoogleCalendar] No platform connection available:', err.message);
      }
    }

    if (!accessToken) {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    // One run per account at a time. A second trigger while a sync is live gets
    // a clean "already running" instead of a second import.
    step = 'acquireSyncLock';
    const lock = await acquireSyncLock(base44, user);
    if (!lock.acquired) {
      console.log('[syncGoogleCalendar] sync already in progress for', user.email, 'since', lock.since);
      return Response.json({ success: true, in_progress: true, skipped: true, since: lock.since || null });
    }

    let result;
    try {
      step = 'syncCalendarAccount';
      result = await syncCalendarAccount(base44, user, accessToken, user.email, lock.heartbeat);
    } finally {
      step = 'lock.release';
      await lock.release();
    }

    if (result.error) {
      console.log('[syncGoogleCalendar] sync returned error for=', result.connectedEmail, 'err=', JSON.stringify(result.details));
      return Response.json({ error: result.error, details: result.details }, { status: 502 });
    }

    console.log('[syncGoogleCalendar] sync done for=', result.connectedEmail, '| created=', result.created, 'updated=', result.updated, 'skipped=', result.skipped, 'total=', result.total_events);

    return Response.json({
      success: true,
      synced_at: new Date().toISOString(),
      total_events: result.total_events,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      cancelled_removed: result.cancelledRemoved,
      connected_email: result.connectedEmail,
      results: result.results
    });

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