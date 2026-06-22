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

function buildTaskDescription(event) {
  const parts = [];

  if (event.description && event.description.trim()) {
    parts.push(event.description.trim());
  }

  if (event.location && event.location.trim()) {
    parts.push(`📍 Location: ${event.location.trim()}`);
  }

  const startRaw = event.start?.dateTime || event.start?.date;
  const endRaw = event.end?.dateTime || event.end?.date;
  if (startRaw) {
    const isAllDay = !event.start?.dateTime;
    const startStr = isAllDay
      ? new Date(startRaw).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(startRaw).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const endStr = endRaw && !isAllDay
      ? new Date(endRaw).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null;
    parts.push(`🗓 ${startStr}${endStr ? ` – ${endStr}` : ''}`);
  }

  if (event.attendees && event.attendees.length > 0) {
    const attendeeList = event.attendees
      .filter(a => !a.self)
      .map(a => a.displayName ? `${a.displayName} (${a.email})` : a.email)
      .slice(0, 10)
      .join(', ');
    if (attendeeList) parts.push(`👥 Attendees: ${attendeeList}`);
  }

  if (event.conferenceData?.entryPoints) {
    const videoLink = event.conferenceData.entryPoints.find(e => e.entryPointType === 'video');
    if (videoLink) parts.push(`🎥 Video call: ${videoLink.uri}`);
  }

  const recurrence = (event.recurrence || []).join(', ');
  if (recurrence) parts.push(`🔁 Repeats: ${recurrence}`);

  return parts.join('\n\n').substring(0, 1000);
}

async function classifyEventWithAI(openai, event) {
  const now = new Date();
  const eventStart = event.start?.dateTime || event.start?.date || '';
  const hoursUntilEvent = eventStart
    ? (new Date(eventStart).getTime() - now.getTime()) / (1000 * 60 * 60)
    : 999;
  const attendeeCount = (event.attendees || []).length;
  const recurrence = (event.recurrence || []).join(', ');

  const prompt = `You are an ADHD productivity assistant. Analyze this Google Calendar event and decide how to route it.

Event title: "${event.summary || 'Untitled'}"
Start: ${eventStart}
Hours until event: ${Math.round(hoursUntilEvent)}
Attendee count: ${attendeeCount}
Recurrence rule: ${recurrence || 'none'}
Description snippet: "${(event.description || '').substring(0, 200)}"
Location: "${event.location || 'none'}"

Decide:
1. importance: "low" | "medium" | "high"
   - high: work deadlines, meetings with many people, exams, urgent appointments, <24h away
   - medium: personal appointments, meetings with 1-3 people, events 1-7 days away
   - low: casual reminders, social events, recurring low-stakes events

2. reminder_interval: choose ONE from this list based on importance and lead time:
   - high importance: "2hours" if <24h away, "daily" if 1-7 days away
   - medium importance: "daily" if <3 days, "every_other_day" if >3 days
   - low importance: "once"

Return ONLY valid JSON, no markdown:
{"importance":"medium","reminder_interval":"daily","reasoning":"brief 1-sentence reason"}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  });

  return JSON.parse(completion.choices[0].message.content);
}

async function getGoogleAccountEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      return data.email || null;
    }
  } catch {}
  return null;
}

async function syncCalendarForToken(base44, openai, accessToken, appUserEmail, calendarAccountEmail) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Fetch upcoming events (next 60 days), including fields for location and conferenceData
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100&singleEvents=false&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&fields=items(id,summary,start,end,attendees,recurrence,description,status,location,conferenceData)`;

  const calRes = await fetch(calUrl, { headers: authHeader });
  if (!calRes.ok) {
    const err = await calRes.json().catch(() => ({}));
    throw new Error(`Calendar API error: ${JSON.stringify(err)}`);
  }

  const calData = await calRes.json();
  const events = (calData.items || []).filter(e => e.status !== 'cancelled');

  // Load existing synced events for this specific calendar account
  const existingSynced = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({
    user_email: appUserEmail,
    calendar_account_email: calendarAccountEmail
  });
  const existingByGoogleId = {};
  for (const s of existingSynced) existingByGoogleId[s.google_event_id] = s;

  // Load existing tasks
  const existingTasks = await base44.asServiceRole.entities.Task.filter({ notification_recipient_email: appUserEmail });
  const existingTaskIds = new Set(existingTasks.map(t => t.id));

  let created = 0, updated = 0, skipped = 0;

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

    const isBirthday = isBirthdayEvent(title, recurrenceRule);
    const routedAs = isBirthday ? 'birthday' : 'task';

    const nextReminderDate = startRaw ? new Date(startRaw) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const taskDescription = buildTaskDescription(event);

    let taskRecord;
    if (isBirthday) {
      const birthdayPerson = extractBirthdayPerson(title);
      taskRecord = {
        title: `🎂 ${birthdayPerson}'s Birthday`,
        description: taskDescription || `Imported from Google Calendar`,
        urgency: 'medium',
        energy_required: 'low',
        status: 'active',
        reminder_interval: 'once',
        recurrence_pattern: 'yearly',
        birthday_person: birthdayPerson,
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: appUserEmail
      };
    } else {
      const urgencyMap = { low: 'low', medium: 'medium', high: 'high' };
      taskRecord = {
        title: title,
        description: taskDescription,
        urgency: urgencyMap[ai.importance] || 'medium',
        energy_required: ai.importance === 'high' ? 'high' : ai.importance === 'low' ? 'low' : 'medium',
        status: 'active',
        reminder_interval: ai.reminder_interval || 'daily',
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: appUserEmail,
        recurrence_pattern: recurrenceRule ? 'none' : 'none'
      };
    }

    const createdTask = await base44.asServiceRole.entities.Task.create(taskRecord);

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
      user_email: appUserEmail,
      calendar_account_email: calendarAccountEmail
    };

    if (existing) {
      await base44.asServiceRole.entities.CalendarSyncedEvent.update(existing.id, syncRecord);
      updated++;
    } else {
      await base44.asServiceRole.entities.CalendarSyncedEvent.create(syncRecord);
      created++;
    }
  }

  return { total_events: events.length, created, updated, skipped };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // --- probe: just check if connected, return account info ---
    if (body.probe) {
      try {
        const conn = await base44.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        if (!conn || !conn.accessToken) {
          return Response.json({ error: 'not_connected' }, { status: 400 });
        }
        const googleEmail = await getGoogleAccountEmail(conn.accessToken);
        return Response.json({ connected: true, google_email: googleEmail });
      } catch {
        return Response.json({ error: 'not_connected' }, { status: 400 });
      }
    }

    // --- Normal sync ---
    let accessToken;
    let googleEmail;
    try {
      const conn = await base44.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
      accessToken = conn.accessToken;
      googleEmail = await getGoogleAccountEmail(accessToken);
    } catch {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const result = await syncCalendarForToken(
      base44,
      openai,
      accessToken,
      user.email,
      googleEmail || user.email
    );

    return Response.json({
      success: true,
      synced_at: new Date().toISOString(),
      google_email: googleEmail,
      ...result
    });

  } catch (error) {
    console.error('[syncGoogleCalendar] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});