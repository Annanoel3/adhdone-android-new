import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { buildTaskParsePrompt } from '../../shared/taskParsePrompt.ts';
import { localReminderUtc } from '../../shared/timezoneReminders.ts';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

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

// When an already-synced event's task still exists, check whether the Google
// event's start/end changed since the last sync. If so, patch the task's
// event dates (next_reminder, due_date, end_date for one-time events) and
// refresh the sync record — so editing a Google event (e.g. extending a
// hotel stay to multi-day) actually updates the app on resync.
async function patchExistingTaskDates(base44, syncRec, taskRec, event) {
  const startRaw = event.start?.dateTime || event.start?.date || null;
  const endRaw = event.end?.dateTime || event.end?.date || null;
  const startChanged = (syncRec.start_time || null) !== startRaw;
  const endChanged = (syncRec.end_time || null) !== endRaw;
  // Backfill end_date for one-time events that are missing it (e.g. synced
  // before the multi-day span logic landed). Without this, a re-sync where the
  // Google dates are unchanged returns early and never records end_date, so the
  // event detail never shows the full date range.
  const needsEndBackfill = taskRec.reminder_interval === 'once' && !taskRec.end_date && !!endRaw;
  if (!startChanged && !endChanged && !needsEndBackfill) return false;

  // Recompute the event start the same way the create path does.
  let nextReminderDate: Date | null = null;
  if (startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
    const [y, m, d] = startRaw.split('-').map(n => parseInt(n, 10));
    nextReminderDate = new Date(y, m - 1, d, 9, 0, 0, 0);
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
      const freqDays = rrule.includes('FREQ=DAILY') ? 1
        : rrule.includes('FREQ=WEEKLY') ? 7
        : rrule.includes('FREQ=MONTHLY') ? 30 : 1;
      while (nextReminderDate < new Date()) {
        nextReminderDate.setDate(nextReminderDate.getDate() + freqDays);
      }
    }
  }

  const patch: any = {};

  // One-time events: the event start IS the reminder/due date, and end_date
  // records the multi-day span. Recurring tasks use now+gap for reminders, so
  // only refresh due_date/end_date from the calendar date.
  if (taskRec.reminder_interval === 'once') {
    if (startChanged && nextReminderDate) {
      patch.next_reminder = nextReminderDate.toISOString();
      patch.due_date = nextReminderDate.toISOString();
    }
    if (endRaw) {
      let endDate: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
        const [y, m, d] = endRaw.split('-').map(n => parseInt(n, 10));
        endDate = new Date(y, m - 1, d - 1, 9, 0, 0, 0); // all-day end is exclusive
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

async function classifyEventWithAI(base44, event) {
  // Build a task-like input string from the calendar event, then run it
  // through the SAME parseTask function + prompt the AddTask page uses, so
  // imported items get the exact same smart-AI decisions as manual adds
  // (urgency, energy, reminder type & frequency, event-vs-task).
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
  const inputText = `${summary}${when}${loc}`;

  const prompt = buildTaskParsePrompt(inputText);
  const res = await base44.asServiceRole.functions.invoke('parseTask', { prompt });
  const parsed = (res?.data || res)?.response;
  if (!parsed) throw new Error('parseTask returned no response');
  return parsed;
}

async function syncCalendarAccount(base44, user, accessToken, calendarEmail) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Fetch the connected Gmail account info
  let connectedEmail = calendarEmail;
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
  const events = (calData.items || []).filter(e => e.status !== 'cancelled');
  console.log('[syncGoogleCalendar] calendar fetch OK for=', connectedEmail, '| raw items=', (calData.items || []).length, '| active events=', events.length);

  // Load all existing synced events for this user
  const existingSynced = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({ user_email: user.email });
  const existingByGoogleId = {};
  for (const s of existingSynced) existingByGoogleId[s.google_event_id] = s;

  // Load existing tasks to check if adhd_task_id still exists (user-scoped so RLS applies).
  let created = 0, updated = 0, skipped = 0;
  const results = [];

  for (const event of events) {
    const googleId = event.id;
    const title = event.summary || 'Untitled event';
    const recurrenceRule = (event.recurrence || []).join(';');
    const startRaw = event.start?.dateTime || event.start?.date;
    const endRaw = event.end?.dateTime || event.end?.date;
    const isAllDay = !event.start?.dateTime;
    const attendeeCount = (event.attendees || []).length;

    let existing = existingByGoogleId[googleId];

    // If already synced, directly verify the task still exists by fetching it
    // by ID. This is reliable — a batch-loaded ID set (filtered by email) can
    // miss tasks created with a different recipient email or from older sync
    // runs, which would make the sync skip re-creating deleted tasks.
    if (existing && existing.adhd_task_id) {
      let taskStillExists = false;
      let existingTask = null;
      try {
        existingTask = await base44.asServiceRole.entities.Task.get(existing.adhd_task_id);
        taskStillExists = !!existingTask;
      } catch (e) {
        // Task.get throws when the record doesn't exist → was deleted
      }
      if (taskStillExists) {
        // Event still exists + task still exists → only re-sync if the Google
        // event's dates changed (e.g. user extended a multi-day stay).
        const didUpdate = await patchExistingTaskDates(base44, existing, existingTask, event);
        if (didUpdate) { updated++; } else { skipped++; }
        continue;
      }
      // The user deleted this task in the app. Respect that deletion — don't
      // re-import the Google event. Refresh last_synced_at so we don't keep
      // re-checking it every sync, then skip.
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(existing.id, {
        last_synced_at: new Date().toISOString(),
      });
      skipped++;
      continue;
    }

    // Run AI classification
    let ai;
    try {
      ai = await classifyEventWithAI(base44, event);
    } catch (e) {
      console.log('[syncGoogleCalendar] parseTask failed, defaulting to event:', e.message);
      // Fallback if AI fails — default to a one-time event so we don't spam
      // recurring reminders for something we couldn't classify.
      ai = { urgency: 'medium', energy_required: 'medium', reminder_interval: 'once', needs_date_pick: false, target_date: null };
    }

    // Re-check if this event was already synced (race condition guard with retry)
    let recheck = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({ 
      google_event_id: googleId, 
      user_email: user.email 
    });
    if (recheck.length === 0) {
      // Sleep briefly and retry to catch concurrent writes
      await new Promise(r => setTimeout(r, 150));
      recheck = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({ 
        google_event_id: googleId, 
        user_email: user.email 
      });
    }
    if (recheck.length > 0) {
      const rec = recheck[0];
      // Direct-existence check: only skip if the previously-synced task still
      // exists. If the user deleted it, respect the deletion and don't re-import.
      if (rec.adhd_task_id) {
        let recTaskExists = false;
        let recTask = null;
        try {
          recTask = await base44.asServiceRole.entities.Task.get(rec.adhd_task_id);
          recTaskExists = !!recTask;
        } catch (e) { /* deleted */ }
        if (recTaskExists) {
          const didUpdate = await patchExistingTaskDates(base44, rec, recTask, event);
          if (didUpdate) { updated++; } else { skipped++; }
          continue;
        }
        // User deleted the synced task — respect the deletion, don't re-import.
        await base44.asServiceRole.entities.CalendarSyncedEvent.update(rec.id, {
          last_synced_at: new Date().toISOString(),
        });
        skipped++;
        continue;
      }
      existing = rec;
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
      nextReminderDate = new Date(y, m - 1, d, 9, 0, 0, 0);
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
        const freqDays = recurrenceRule.includes('FREQ=DAILY') ? 1
          : recurrenceRule.includes('FREQ=WEEKLY') ? 7
          : recurrenceRule.includes('FREQ=MONTHLY') ? 30 : 1;
        while (nextReminderDate < new Date()) {
          nextReminderDate.setDate(nextReminderDate.getDate() + freqDays);
        }
      }
    }

    let taskRecord;
    let reminderInterval = 'once';
    if (isBirthday) {
      const birthdayPerson = extractBirthdayPerson(title);
      const birthdayDisplay = birthdayPerson ? `${birthdayPerson}'s Birthday` : 'Happy Birthday';
      taskRecord = {
        title: `🎂 ${birthdayDisplay}`,
        description: richDescription || `Imported from Google Calendar (${connectedEmail})`,
        notes: event.description || '',
        urgency: 'medium',
        energy_required: 'low',
        status: 'active',
        reminder_interval: 'once',
        recurrence_pattern: 'yearly',
        birthday_person: birthdayPerson || null,
        birthday_remind_week_before: true,
        birthday_remind_day_before: true,
        birthday_remind_day_of: true,
        classification: 'birthday',
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: user.email
      };
    } else {
      const validUrgency = ['low', 'medium', 'high', 'urgent'].includes(ai.urgency) ? ai.urgency : 'medium';
      const validEnergy = ['low', 'medium', 'high'].includes(ai.energy_required) ? ai.energy_required : 'medium';
      const recurringIntervals = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];
      const intervalMsMap = {
        '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };

      // Same once-vs-interval decision as AddTask: a one-time (or date-pick)
      // result = a scheduled event → single reminder at the event time;
      // an interval reminder = an actionable task → reminders until done.
      const isOnce = ai.reminder_interval === 'once' || ai.needs_date_pick || !recurringIntervals.includes(ai.reminder_interval);
      reminderInterval = isOnce ? 'once' : ai.reminder_interval;

      let nextReminderISO;
      let dueDateISO = null;
      let endDateISO = null;
      let startDateISO = null;
      if (isOnce) {
        // Event: fire the single reminder at the event's start time.
        nextReminderISO = nextReminderDate.toISOString();
        dueDateISO = nextReminderDate.toISOString();
        // Multi-day events: record the last day so the app shows the full
        // span (calendar grid + Home "Today" + event detail). For all-day
        // events Google's end date is exclusive, so the last day is one
        // day earlier than the raw end.
        if (endRaw) {
          let endDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
            const [y, m, d] = endRaw.split('-').map(n => parseInt(n, 10));
            endDate = new Date(y, m - 1, d - 1, 9, 0, 0, 0);
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
        const startGap = intervalMsMap[reminderInterval] || intervalMsMap['2hours'];
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
            endDate = new Date(y, m - 1, d - 1, 9, 0, 0, 0);
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
        notes: event.location ? `📍 ${event.location}` : (event.description ? event.description.substring(0, 200) : ''),
        urgency: validUrgency,
        energy_required: validEnergy,
        status: 'active',
        reminder_interval: reminderInterval,
        reminder_count: 0,
        next_reminder: nextReminderISO,
        start_date: startDateISO,
        due_date: dueDateISO,
        end_date: endDateISO,
        classification: isOnce ? 'event' : 'task',
        notification_recipient_email: user.email,
        recurrence_pattern: recurrenceRule ? (recurrenceRule.includes('FREQ=DAILY') ? 'daily' : recurrenceRule.includes('FREQ=WEEKLY') ? 'weekly' : recurrenceRule.includes('FREQ=MONTHLY') ? 'monthly' : recurrenceRule.includes('FREQ=YEARLY') ? 'yearly' : 'none') : 'none'
      };
    }

    // Use user-scoped create so created_by is set to the current user (making the task visible in the app)
    const createdTask = await base44.entities.Task.create(taskRecord);

    // For one-time events, use the LLM-powered reminder schedule generator
    // to determine optimal reminder times based on ADHD principles.
    // Cron only handles recurring tasks, so events must be scheduled here.
    if (!isBirthday && reminderInterval === 'once' && createdTask.next_reminder) {
      try {
        const scheduleRes = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
          title,
          scheduledDateISO: createdTask.next_reminder,
          urgency: createdTask.urgency,
          classification: createdTask.classification || 'event',
        });
        const scheduleData = scheduleRes?.data || scheduleRes || {};
        const rawReminders = scheduleData.reminders || [];

        // Convert reminder specs (ABSOLUTE: days_before/hour/minute or RELATIVE: relative_minutes_before)
        // to ISO times and filter past reminders
        const scheduledDate = new Date(createdTask.next_reminder);
        const bufferMs = Date.now() + 2 * 60 * 1000;
        const userTimeZone = (user as any)?.timezone || null;
        const reminderTimes = rawReminders
          .map(r => {
            let reminderTime;
            if (r.relative_minutes_before != null) {
              reminderTime = new Date(scheduledDate.getTime() - r.relative_minutes_before * 60 * 1000);
            } else {
              // ABSOLUTE reminders specify a local wall-clock time (e.g. 9 AM).
              // Convert via the user's timezone so a "morning of" reminder fires
              // at 9 AM local, not 9 AM UTC (which would be 4 AM US-Central).
              reminderTime = localReminderUtc(scheduledDate, r.days_before || 0, r.hour || 0, r.minute || 0, userTimeZone);
            }
            return { sendAtISO: reminderTime.toISOString(), label: r.label, notification_title: r.notification_title || '📅 Upcoming', notification_body: r.notification_body || title };
          })
          .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
          .filter(r => {
            // For events, never schedule a reminder after the event start time.
            // A "coming up in an hour" nudge 4 hours into the event is useless.
            if (createdTask.classification === 'event' && new Date(r.sendAtISO).getTime() > scheduledDate.getTime()) {
              console.log(`[syncGoogleCalendar] Dropping post-event reminder "${r.label}" at ${r.sendAtISO} (event at ${createdTask.next_reminder})`);
              return false;
            }
            // For events, never schedule a reminder more than 1 day before —
            // nobody wants a "2 months before" notification for a far-future event.
            if (createdTask.classification === 'event') {
              const advanceMs = scheduledDate.getTime() - new Date(r.sendAtISO).getTime();
              if (advanceMs > 24 * 60 * 60 * 1000) {
                console.log(`[syncGoogleCalendar] Dropping far-out event reminder "${r.label}" at ${r.sendAtISO} (${Math.round(advanceMs / 86400000)}d before event)`);
                return false;
              }
            }
            return true;
          })
          .sort((a, b) => new Date(a.sendAtISO).getTime() - new Date(b.sendAtISO).getTime())
          // Deduplicate by send time: the LLM sometimes returns two reminders
          // that resolve to the same (or near-same) clock time — e.g. "1 day
          // before at 6pm" + "evening before at 6pm" both land at 6:00 PM.
          // Keep only the first reminder within a 5-minute window so the user
          // gets one notification, not two near-identical duplicates.
          .filter((r, i, arr) => {
            if (i === 0) return true;
            const prevMs = new Date(arr[i - 1].sendAtISO).getTime();
            const thisMs = new Date(r.sendAtISO).getTime();
            return (thisMs - prevMs) > 5 * 60 * 1000;
          });

        const notificationIds = [];
        for (const reminder of reminderTimes) {
          try {
            const res = await base44.asServiceRole.functions.invoke('schedulePush', {
              toUserExternalId: user.email,
              title: reminder.notification_title,
              body: reminder.notification_body,
              sendAtISO: reminder.sendAtISO,
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
            if (result?.notificationId) notificationIds.push(result.notificationId);
          } catch (e) {
            console.log('[syncGoogleCalendar] reminder scheduling failed:', e.message);
          }
        }

        // Fallback: if no reminders were scheduled, send a single one at event start
        if (notificationIds.length === 0) {
          const sendAt = new Date(createdTask.next_reminder);
          if (sendAt.getTime() > Date.now() + 2 * 60 * 1000) {
            const res = await base44.asServiceRole.functions.invoke('schedulePush', {
              toUserExternalId: user.email,
              title: `📅 ${title}`,
              body: `You've got this! ${title} is coming up.`,
              sendAtISO: sendAt.toISOString(),
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
            if (result?.notificationId) {
              notificationIds.push(result.notificationId);
            }
          }
        }

        if (notificationIds.length > 0) {
          const structured = reminderTimes
            .slice(0, notificationIds.length)
            .map((r, i) => ({
              notification_id: notificationIds[i],
              send_at: r.sendAtISO,
              label: r.label,
              notification_title: r.notification_title,
              notification_body: r.notification_body,
            }));
          await base44.entities.Task.update(createdTask.id, {
            onesignal_notification_ids: notificationIds,
            reminder_schedule: structured,
          });
        }
      } catch (e) {
        console.log('[syncGoogleCalendar] event reminder scheduling failed:', e.message);
      }
    }

    const syncRecord = {
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
      adhd_task_id: createdTask.id,
      last_synced_at: new Date().toISOString(),
      user_email: user.email
    };

    if (existing) {
      // The previous task was deleted — create a brand-new task so fresh
      // scheduling (LLM reminders, OneSignal notifications) applies to it.
      console.log('[syncGoogleCalendar] RE-CREATING (old task was deleted):', googleId, '| old task=', existing.adhd_task_id, '| new task=', createdTask.id);
      await base44.asServiceRole.entities.CalendarSyncedEvent.delete(existing.id);
      await base44.asServiceRole.entities.CalendarSyncedEvent.create(syncRecord);
      created++;
    } else {
      await base44.asServiceRole.entities.CalendarSyncedEvent.create(syncRecord);
      created++;
    }

    results.push({ googleId, title, routedAs, urgency: ai.urgency });
  }

  return { created, updated, skipped, total_events: events.length, results, connectedEmail };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get the user's Google Calendar token from the platform
    let accessToken;
    let connectedEmail = user.email;
    
    const body = await req.json().catch(() => ({}));

    // Probe mode: check whether a Google Calendar connection exists without
    // running a full sync (used by the Calendar page to render connect state).
    if (body.probe) {
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

    // For app-user connector, fetch the current user's connection token
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
      accessToken = conn?.accessToken;
      if (conn?.email) connectedEmail = conn.email;
      console.log('[syncGoogleCalendar] platform conn.email =', conn?.email, '| user.email =', user.email);
    } catch (err) {
      console.log('[syncGoogleCalendar] No connection available:', err.message);
    }

    if (!accessToken) {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    const result = await syncCalendarAccount(base44, user, accessToken, user.email);

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
      connected_email: result.connectedEmail,
      results: result.results
    });

  } catch (error) {
    console.error('[syncGoogleCalendar] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});