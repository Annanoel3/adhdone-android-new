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
  const titleLower = (event.summary || '').toLowerCase();

  // Hard-code urgent detection from title keywords — don't let AI downgrade these
  const isUrgentKeyword = /urgent|asap|critical|emergency|deadline|due today|!!/.test(titleLower);

  const prompt = `You are an ADHD productivity assistant. Analyze this Google Calendar event and assign its importance and reminder frequency.

Use REAL-WORLD STAKES to judge importance — not just wording. Think: "what actually happens if this is missed or forgotten?"

Event title: "${event.summary || 'Untitled'}"
Start: ${eventStart}
Hours until event: ${Math.round(hoursUntilEvent)}
Attendee count: ${attendeeCount}
Recurrence rule: ${recurrence || 'none'}
Description snippet: "${(event.description || '').substring(0, 200)}"
Location: "${event.location || 'none'}"

IMPORTANCE RULES — use real-world consequences:
- "urgent": explicit urgency keywords (urgent/asap/critical/emergency/deadline), OR event is <6h away
- "high": anything with serious real-world consequences if missed
  Examples: doctor/dentist/therapist/vet appointments, medication reminders, job interviews, court dates, flights, surgeries, school exams, work presentations, feeding or caring for a pet or child, paying bills, picking someone up
- "medium": personally meaningful but recoverable if missed once
  Examples: friend meetups, gym classes, haircuts, hobby events, work check-ins, moderate errands
- "low": low stakes, can easily be rescheduled or forgotten without real harm
  Examples: finding/buying a low-priority item (e.g. "find that shirt"), casual browsing tasks, generic reminders with no time pressure, low-stakes shopping

REMINDER INTERVAL — based on importance:
- "urgent" → "1hour"
- "high" → "2hours" if <24h away, "daily" if further out
- "medium" → "daily" if <3 days, "every_other_day" if further
- "low" → "once"
Valid values ONLY: "10min","20min","30min","1hour","2hours","daily","every_other_day","once"

Also decide: is this a real scheduled EVENT (appointment, meeting, class — something happening at a specific time that the user attends) or a TASK/REMINDER (something to do, buy, find, check)?
- is_event: true if it's a time-bound appointment/meeting/class/flight/etc.
- is_event: false if it's a to-do, errand, or reminder not tied to attending something

Return ONLY valid JSON, no markdown:
{"importance":"medium","reminder_interval":"daily","is_event":true,"reasoning":"brief 1-sentence reason"}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  });

  const result = JSON.parse(completion.choices[0].message.content);

  // Override: if title has urgent keywords, force urgent+1hour regardless of AI
  if (isUrgentKeyword) {
    result.importance = 'urgent';
    result.reminder_interval = '1hour';
  }

  return result; // result may include is_event: true/false
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

  // Load existing tasks to check if adhd_task_id still exists
  const existingTasks = await base44.asServiceRole.entities.Task.list();
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
      const urgencyMap = { low: 'low', medium: 'medium', high: 'high', urgent: 'urgent' };
      taskRecord = {
        title: title,
        description: richDescription,
        notes: event.location ? `📍 ${event.location}` : (event.description ? event.description.substring(0, 200) : ''),
        urgency: urgencyMap[ai.importance] || 'medium',
        energy_required: (ai.importance === 'high' || ai.importance === 'urgent') ? 'high' : ai.importance === 'low' ? 'low' : 'medium',
        status: 'active',
        reminder_interval: ai.reminder_interval || 'daily',
        next_reminder: nextReminderDate.toISOString(),
        notification_recipient_email: user.email,
        recurrence_pattern: recurrenceRule ? (recurrenceRule.includes('FREQ=DAILY') ? 'daily' : recurrenceRule.includes('FREQ=WEEKLY') ? 'weekly' : recurrenceRule.includes('FREQ=MONTHLY') ? 'monthly' : recurrenceRule.includes('FREQ=YEARLY') ? 'yearly' : 'none') : 'none'
      };
    }

    const createdTask = await base44.entities.Task.create(taskRecord);

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

    results.push({ googleId, title, routedAs, importance: ai.importance, taskId: createdTask.id, start_time: startRaw || null, is_all_day: isAllDay, reminder_interval: ai.reminder_interval || 'daily', is_event: ai.is_event !== false });
  }

  return { created, updated, skipped, total_events: events.length, results, connectedEmail };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get the user's Google Calendar token
    let accessToken;
    let connectedEmail = user.email;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
      accessToken = conn.accessToken;
    } catch {
      return Response.json({ error: 'not_connected', message: 'Google Calendar not connected' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // If just probing for connection status, return connected email without full sync
    if (body.probe) {
      // Fetch the actual Gmail account info
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          connectedEmail = profile.email || user.email;
        }
      } catch { /* fallback to user.email */ }
      return Response.json({ connected: true, connected_email: connectedEmail });
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