import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

function isBirthdayEvent(title, recurrenceRule) {
  if (!recurrenceRule) return false;
  const isYearly = recurrenceRule.includes('FREQ=YEARLY');
  if (!isYearly) return false;
  const lower = (title || '').toLowerCase();
  return lower.includes('birthday') || lower.includes('bday');
}

function extractBirthdayPerson(title) {
  let t = title.replace(/birthday|bday/gi, '').replace(/['s\-:,]/g, ' ').trim();
  t = t.replace(/\s+/g, ' ').trim();
  return t || title;
}

async function classifyEventWithAI(openai, event) {
  const now = new Date();
  const eventStart = event.start?.dateTime || event.start?.date || '';
  const hoursUntilEvent = eventStart
    ? (new Date(eventStart).getTime() - now.getTime()) / (1000 * 60 * 60)
    : 999;
  const attendeeCount = (event.attendees || []).length;
  const recurrence = (event.recurrence || []).join(', ');
  
  // Quick heuristic: if <2 hours away, it's urgent regardless
  const isImminentDeadline = hoursUntilEvent < 2 && hoursUntilEvent > 0;

  const eventDateOnly = eventStart ? (eventStart.split('T')[0] || '') : '';

  const prompt = `You are an ADHD productivity assistant. Analyze this Google Calendar event and decide its importance, type, and due/event date.

Event title: "${event.summary || 'Untitled'}"
Start: ${eventStart}
Event date (YYYY-MM-DD): ${eventDateOnly}
Hours until event: ${Math.round(hoursUntilEvent)}
Attendee count: ${attendeeCount}
Recurrence rule: ${recurrence || 'none'}
Location: "${event.location || 'none'}"
Description: "${(event.description || '').substring(0, 200)}"
Imminent (<2h): ${isImminentDeadline}

URGENCY (same SMART INFERENCE as the app's task add — decide firmly, do NOT default to medium):
- "urgent": Hard deadline today/tomorrow with serious consequences (rent due now, court, exam today, flight today)
- "high": Time-sensitive/can't-miss event (<2h away OR 3+ attendees OR title contains "deadline/exam/urgent/interview/presentation/court"), perishable tasks (food, meds, laundry), hard financial/legal deadlines within 7 days
- "medium": 1-2 attendee meetings, personal appointments 1-7 days away, classes, social plans, important-but-flexible obligations
- "low": Recurring routines, casual social, >7 days away, gym/workout, daily standups, nice-to-haves

ENERGY REQUIRED: low (casual/routine) | medium (normal) | high (demanding/exam/presentation/move)

REMINDER TYPE (match the app's quick-add / task-add logic):
- For "event" items: this is a ONE-TIME event reminder — set reminder_interval="once". The app sends a single reminder at the event's start time.
- For "task" items: this is a RECURRING reminder (keep reminding until done). Infer the interval from the task's nature:
  * Hard deadline today/tomorrow, perishable, or time-sensitive → "1hour" or "2hours"
  * Important obligation (pay bills, submit work, financial/legal) → "2hours"
  * Important but flexible (selling, errands, projects, organizing) → "4hours"
  * Routine/habit/wellness/daily chore → "daily"
  * Low-stakes nice-to-have → "daily"
  * When in doubt → "2hours"

ITEM TYPE (classify what this calendar entry actually is):
- "task": An actionable to-do the user must DO/complete by a deadline — e.g. "Pay rent", "Submit report", "Renew license", "File taxes", "Buy groceries". It has a due action, not just attendance.
- "event": A scheduled occurrence the user attends or is present at — meetings, appointments, classes, doctor visits, social gatherings, travel, workouts, concerts.
- Default to "event" unless the title clearly describes an actionable to-do with a deadline. Most calendar entries are events.
- NAME-ONLY TITLES: If the title is just a person's name (1-3 words, no action verb, no obvious deadline object) — e.g. "Sarah", "Mom", "John Smith", "Dr. Patel" — treat it as "event" (likely a catch-up, call, or meeting with that person), NOT a task.

DUE DATE:
- For "event" items: set due_date to the event's start date (${eventDateOnly}).
- For "task" items: set due_date to the deadline date (YYYY-MM-DD). If the event start IS the deadline, use the start date. If no clear deadline, use null.
- Always use the format "YYYY-MM-DD" or null.

Return ONLY valid JSON:
{"urgency":"medium","energy_required":"medium","reminder_interval":"once","item_type":"event","due_date":"${eventDateOnly}"}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100
  });

  return JSON.parse(completion.choices[0].message.content);
}

async function syncCalendarAccount(base44, openai, user, accessToken, calendarEmail) {
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

  // Fetch upcoming events (next 60 days)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100&singleEvents=false&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&fields=items(id,summary,start,end,attendees,recurrence,description,location,status,organizer,conferenceData)`;

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

  // Load existing tasks to check if adhd_task_id still exists (user-scoped so RLS applies)
  const existingTasks = await base44.entities.Task.list();
  const existingTaskIds = new Set(existingTasks.map(t => t.id));

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

    const existing = existingByGoogleId[googleId];

    // If already synced and task still exists → skip
    if (existing && existing.adhd_task_id && existingTaskIds.has(existing.adhd_task_id)) {
      skipped++;
      continue;
    }

    // Run AI classification
    let ai;
    try {
      ai = await classifyEventWithAI(openai, event);
    } catch {
      // Fallback if AI fails — default to a one-time event so we don't spam
      // recurring reminders for something we couldn't classify.
      ai = { urgency: 'medium', energy_required: 'medium', reminder_interval: 'once', item_type: 'event', due_date: null };
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
      skipped++;
      continue;
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
    // the ORIGINAL occurrence (often a past year). For yearly events (birthdays),
    // advance to the next upcoming occurrence so the reminder isn't set to a
    // past date.
    if (recurrenceRule.includes('FREQ=YEARLY') && nextReminderDate < new Date()) {
      while (nextReminderDate < new Date()) {
        nextReminderDate.setFullYear(nextReminderDate.getFullYear() + 1);
      }
    }

    let taskRecord;
    if (isBirthday) {
      const birthdayPerson = extractBirthdayPerson(title);
      taskRecord = {
        title: `🎂 ${birthdayPerson}'s Birthday`,
        description: richDescription || `Imported from Google Calendar (${connectedEmail})`,
        notes: event.description || '',
        urgency: 'medium',
        energy_required: 'low',
        status: 'active',
        reminder_interval: 'once',
        recurrence_pattern: 'yearly',
        birthday_person: birthdayPerson,
        classification: 'birthday',
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: user.email
      };
    } else {
      const validUrgency = ['low', 'medium', 'high', 'urgent'].includes(ai.urgency) ? ai.urgency : 'medium';
      const validEnergy = ['low', 'medium', 'high'].includes(ai.energy_required) ? ai.energy_required : 'medium';
      const isEventItem = ai.item_type === 'event';

      // Reminder type matches the app's add-task logic:
      //  - events get a ONE-TIME reminder at the event start time
      //  - tasks get RECURRING reminders (interval inferred from the task's nature)
      const recurringIntervals = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];
      const intervalMsMap = {
        '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };
      const reminderInterval = isEventItem
        ? 'once'
        : (recurringIntervals.includes(ai.reminder_interval) ? ai.reminder_interval : '2hours');

      // next_reminder: events fire at the event start; tasks start recurring now.
      let nextReminderISO;
      if (isEventItem) {
        nextReminderISO = nextReminderDate.toISOString();
      } else {
        const startGap = intervalMsMap[reminderInterval] || intervalMsMap['2hours'];
        nextReminderISO = new Date(Date.now() + startGap).toISOString();
      }

      // due_date: events → event date; tasks → AI-detected deadline (or null).
      let dueDateISO = null;
      if (isEventItem) {
        dueDateISO = nextReminderDate.toISOString();
      } else if (ai.due_date) {
        const [y, m, d] = String(ai.due_date).split('-').map(n => parseInt(n, 10));
        if (y && m && d) dueDateISO = new Date(y, m - 1, d, 17, 0, 0, 0).toISOString();
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
        due_date: dueDateISO,
        classification: isEventItem ? 'event' : 'task',
        notification_recipient_email: user.email,
        recurrence_pattern: recurrenceRule ? (recurrenceRule.includes('FREQ=DAILY') ? 'daily' : recurrenceRule.includes('FREQ=WEEKLY') ? 'weekly' : recurrenceRule.includes('FREQ=MONTHLY') ? 'monthly' : recurrenceRule.includes('FREQ=YEARLY') ? 'yearly' : 'none') : 'none'
      };
    }

    // Use user-scoped create so created_by is set to the current user (making the task visible in the app)
    const createdTask = await base44.entities.Task.create(taskRecord);

    // For one-time events, schedule a single event reminder at the event start
    // (cron only handles recurring tasks, so events must be scheduled here).
    if (!isBirthday && ai.item_type === 'event' && createdTask.next_reminder) {
      try {
        const sendAt = new Date(createdTask.next_reminder);
        if (sendAt.getTime() > Date.now() + 2 * 60 * 1000) {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
            toUserExternalId: user.email,
            title: '📅 Event Reminder',
            body: `${title}\n\nTap to view details.`,
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
            await base44.entities.Task.update(createdTask.id, {
              onesignal_notification_ids: [result.notificationId],
            });
          }
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
      ai_importance: ai.importance || 'medium',
      ai_reminder_interval: ai.reminder_interval || 'daily',
      item_type: isBirthday ? 'event' : (ai.item_type === 'task' ? 'task' : 'event'),
      routed_as: routedAs,
      adhd_task_id: createdTask.id,
      last_synced_at: new Date().toISOString(),
      user_email: user.email
    };

    if (existing) {
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(existing.id, syncRecord);
      updated++;
    } else {
      await base44.asServiceRole.entities.CalendarSyncedEvent.create(syncRecord);
      created++;
    }

    results.push({ googleId, title, routedAs, importance: ai.importance });
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

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const result = await syncCalendarAccount(base44, openai, user, accessToken, user.email);

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