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

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

// Quiet hours: 3 AM – 2 PM UTC covers 10 PM – 9 AM for US timezones
const QUIET_START_HOUR = 3;
const QUIET_END_HOUR = 14;

function adjustForQuietHours(isoString) {
  const d = new Date(isoString);
  const h = d.getUTCHours();
  if (h < QUIET_START_HOUR || h >= QUIET_END_HOUR) return isoString;
  const adjusted = new Date(d);
  adjusted.setUTCHours(QUIET_END_HOUR, 0, 0, 0);
  if (adjusted <= d) adjusted.setUTCDate(adjusted.getUTCDate() + 1);
  return adjusted.toISOString();
}

async function scheduleOneSignalNotification(email, title, body, sendAfterISO, taskId, urgency) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[syncGoogleCalendar] OneSignal credentials missing, skipping schedule');
    return null;
  }
  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: body },
      include_external_user_ids: [email],
      send_after: adjustForQuietHours(sendAfterISO),
      data: { screen: '/TaskNotification', taskId, urgency, type: 'task_reminder' },
      buttons: [
        { id: 'snooze_15', text: 'Snooze 15 min' },
        { id: 'snooze_60', text: 'Snooze 1 hour' },
        { id: 'complete', text: '✅ Done' }
      ]
    };
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('[syncGoogleCalendar] OneSignal API error:', await res.json().catch(() => ({})));
      return null;
    }
    const result = await res.json();
    return result.id || null;
  } catch (e) {
    console.error('[syncGoogleCalendar] OneSignal schedule failed:', e);
    return null;
  }
}

async function scheduleTaskReminders(task, email) {
  const intervalMs = {
    '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
    '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000,
    'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000
  };
  const interval = task.reminder_interval;
  const startTime = task.next_reminder ? new Date(task.next_reminder) : new Date(Date.now() + 60 * 60 * 1000);
  const title = 'Task Reminder 📋';
  const body = `${task.title}\n\nTap to mark as complete!`;

  if (interval === 'once' || !intervalMs[interval]) {
    const id = await scheduleOneSignalNotification(email, title, body, startTime.toISOString(), task.id, task.urgency);
    return { ids: id ? [id] : [], lastScheduledUntil: id ? startTime.toISOString() : null };
  }

  const ms = intervalMs[interval];
  const now = Date.now();
  const ids = [];
  let scheduleTime = startTime.getTime();
  for (let i = 0; i < 10; i++) {
    if (scheduleTime > now) {
      const id = await scheduleOneSignalNotification(email, title, body, new Date(scheduleTime).toISOString(), task.id, task.urgency);
      if (id) ids.push(id);
    }
    scheduleTime += ms;
  }
  const lastScheduledUntil = ids.length > 0 ? new Date(startTime.getTime() + ms * (ids.length - 1)).toISOString() : null;
  return { ids, lastScheduledUntil };
}

async function classifyEventWithAI(openai, event) {
  const now = new Date();
  const eventStart = event.start?.dateTime || event.start?.date || '';
  const hoursUntilEvent = eventStart
    ? (new Date(eventStart).getTime() - now.getTime()) / (1000 * 60 * 60)
    : 999;
  const attendeeCount = (event.attendees || []).length;
  const recurrence = (event.recurrence || []).join(', ');
  
  // Client-side urgency detection: check title/description for critical keywords
  const fullText = `${event.summary || ''} ${event.description || ''}`.toLowerCase();
  const urgentKeywords = ['urgent', 'deadline', 'asap', 'critical', 'exam', 'interview', 'presentation'];
  const hasUrgentKeyword = urgentKeywords.some(kw => fullText.includes(kw));
  
  // If contains urgent keyword and within 7 days, immediately mark high
  if (hasUrgentKeyword && hoursUntilEvent > 0 && hoursUntilEvent <= 168) {
    const interval = hoursUntilEvent < 2 ? '1hour' : hoursUntilEvent < 24 ? '2hours' : 'daily';
    return { importance: 'high', reminder_interval: interval };
  }
  
  // Quick heuristic: if <2 hours away, it's urgent regardless
  const isImminentDeadline = hoursUntilEvent < 2 && hoursUntilEvent > 0;

  const prompt = `You are an ADHD productivity assistant. Analyze this Google Calendar event and decide importance level.

Event title: "${event.summary || 'Untitled'}"
Start: ${eventStart}
Hours until event: ${Math.round(hoursUntilEvent)}
Attendee count: ${attendeeCount}
Recurrence rule: ${recurrence || 'none'}
Location: "${event.location || 'none'}"
Description: "${(event.description || '').substring(0, 200)}"
Imminent (<2h): ${isImminentDeadline}

URGENCY RULES (strict):
- HIGH: Imminent (<2h away) OR meetings with 3+ attendees OR mentions "deadline/exam/urgent/meeting" AND <7 days away
- MEDIUM: Personal appointments 1-7 days away OR 1-2 attendee meetings
- LOW: Recurring events, social/casual, >7 days away, or birthdays

REMINDER INTERVALS:
- Urgent (<2h): 1hour
- High urgency (<24h): 2hours
- High urgency (1-7d): daily
- Medium/Low: daily

Return ONLY valid JSON:
{"importance":"medium","reminder_interval":"daily"}`;

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

  // Fetch upcoming events (next 60 days)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100&singleEvents=false&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&fields=items(id,summary,start,end,attendees,recurrence,description,location,status,organizer,conferenceData)`;

  const calRes = await fetch(calUrl, { headers: authHeader });
  if (!calRes.ok) {
    const err = await calRes.json().catch(() => ({}));
    return { error: 'calendar_api_error', details: err, connectedEmail };
  }

  const calData = await calRes.json();
  const events = (calData.items || []).filter(e => e.status !== 'cancelled');

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
      ai = { importance: 'medium', reminder_interval: 'daily' };
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
    const nextReminderDate = startRaw ? new Date(startRaw) : new Date(Date.now() + 24 * 60 * 60 * 1000);

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
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: user.email
      };
    } else {
      const urgencyMap = { low: 'low', medium: 'medium', high: 'high' };
      
      // For urgent tasks, don't limit reminders—let them continue until completion
      const reminderCount = (ai.importance === 'high' || ai.reminder_interval === '1hour') ? 0 : 0;
      
      taskRecord = {
        title: title,
        description: richDescription,
        notes: event.location ? `📍 ${event.location}` : (event.description ? event.description.substring(0, 200) : ''),
        urgency: urgencyMap[ai.importance] || 'medium',
        energy_required: ai.importance === 'high' ? 'high' : ai.importance === 'low' ? 'low' : 'medium',
        status: 'active',
        reminder_interval: ai.reminder_interval || 'daily',
        reminder_count: reminderCount,
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: user.email,
        recurrence_pattern: recurrenceRule ? (recurrenceRule.includes('FREQ=DAILY') ? 'daily' : recurrenceRule.includes('FREQ=WEEKLY') ? 'weekly' : recurrenceRule.includes('FREQ=MONTHLY') ? 'monthly' : recurrenceRule.includes('FREQ=YEARLY') ? 'yearly' : 'none') : 'none'
      };
    }

    // Use user-scoped create so created_by is set to the current user (making the task visible in the app)
    const createdTask = await base44.entities.Task.create(taskRecord);

    // Schedule OneSignal push notifications (calendar sync runs in the backend, so the
    // frontend scheduling flow never runs — we must schedule directly here)
    const { ids: notificationIds, lastScheduledUntil } = await scheduleTaskReminders(createdTask, user.email);
    if (notificationIds.length > 0) {
      await base44.entities.Task.update(createdTask.id, {
        onesignal_notification_ids: notificationIds,
        ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
      });
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

    // Probe mode: just check if connection can be established
    if (body.probe) {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    // For app-user connector, fetch the current user's connection token
    try {
      const conn = await base44.connectors.getConnection('googlecalendar');
      accessToken = conn?.accessToken;
      if (conn?.email) connectedEmail = conn.email;
    } catch (err) {
      console.log('[syncGoogleCalendar] No connection available:', err.message);
    }

    if (!accessToken) {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const result = await syncCalendarAccount(base44, openai, user, accessToken, user.email);

    if (result.error) {
      return Response.json({ error: result.error, details: result.details }, { status: 502 });
    }

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