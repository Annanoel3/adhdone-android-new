// LLM-powered reminder schedule generator.
// Takes a task title + scheduled date/time and returns an optimal reminder
// schedule based on ADHD research principles. The LLM determines how many
// reminders to send and when, relative to the scheduled time.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

// ── Deterministic EVENT schedule ───────────────────────────────────────────
// Events get a fixed, reliable ladder — night before, an hour before, at the
// time. This works and is deliberately not LLM-decided.
//
// This used to also cover "appointment" and "payment", chosen by scanning the
// title against ~40 regexes (/\bvisit\b/, /\bcleaning\b/, /\bpay \w/ …). That
// meant "Visit Grandma" and "Spring cleaning the garage" were handed the
// dentist-appointment ladder — including "time to head out 🚗" an hour before
// an all-day task with no time on it. A word in a title is not what a task IS,
// so the only signal now is the real `classification` field. Everything that
// isn't an event falls through to day-only handling and smart nudges, which is
// where non-event reminders were always meant to live.

function getEventSchedule() {
  return [
    { days_before: 1, hour: 20, minute: 0, relative_minutes_before: null, label: 'night before' },
    { days_before: null, hour: null, minute: null, relative_minutes_before: 60, label: '1 hour before' },
    { days_before: null, hour: null, minute: null, relative_minutes_before: 0, label: 'right now' },
  ];
}

function getEventNotificationText(label, title) {
  const t = title.length > 40 ? title.slice(0, 37) + '...' : title;

  const templates = {
    'night before': { title: `🎉 ${t}`, body: `Heads up! Your "${t}" is tomorrow. Don't forget to prep! ✨` },
    '1 hour before': { title: `⏰ ${t}`, body: `Almost time! Your "${t}" is in about an hour. Time to head out! 🚗` },
    'right now': { title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` },
  };

  return templates[label] || { title: `🎉 ${t}`, body: `Reminder: ${t}` };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const bodyText = await req.text();
    const { title, scheduledDateISO, urgency, dayOnly, classification, deadlineStyle } = JSON.parse(bodyText);
    // "on Friday" (happens that day) vs "by Friday" (deadline — work can start
    // earlier). Only meaningful for day-only tasks, and they behave differently:
    // 'on' = night-before + day-of only, 'by' = lead-up reminders in advance.
    const isDeadline = dayOnly && deadlineStyle === 'by';

    if (!title || !scheduledDateISO) {
      return Response.json({ error: 'title and scheduledDateISO required' }, { status: 400 });
    }

    const priority = urgency || 'medium';

    const scheduled = new Date(scheduledDateISO);
    const now = new Date();

    // Determine if this is a same-day task (scheduled date is today).
    // We compute this ourselves rather than trusting the LLM, since the LLM
    // often misclassifies past-today scheduled times as "tomorrow."
    const isSameDay = scheduled.toDateString() === now.toDateString();
    const hoursRemainingToday = 23 - now.getHours();

    // ── Events: fixed ladder, no LLM ──────────────────────────────────────
    // Driven only by the real classification (set by the parser / calendar
    // sync), never by words in the title. Keeping this deterministic also
    // prevents "2 months before" reminders for far-future events.
    if (classification === 'event') {
      const schedule = getEventSchedule();
      const reminders = schedule.map(r => {
        const text = getEventNotificationText(r.label, title);
        return {
          days_before: r.days_before,
          hour: r.hour,
          minute: r.minute,
          relative_minutes_before: r.relative_minutes_before,
          label: r.label,
          notification_title: text.title,
          notification_body: text.body,
        };
      });
      console.log(`[generateReminderSchedule] Deterministic event schedule for "${title}" — ${reminders.length} reminders (no LLM call)`);
      return Response.json({ reminders });
    }

    // ── Day-only tasks ("remind me to do X on [day]") ──────────────────────
    // One "heads up, due tomorrow" the night before, then hourly nudges on the
    // day of based on priority. No reminders fire in the days leading up.
    if (dayOnly && !isDeadline) {
      // Day-only tasks get ONE night-before heads-up. The day-of hourly nudges
      // are handled by cronSmartTaskNudge, which looks at ALL the user's due-today
      // day-only tasks and uses the LLM to pick ONE to surface at a time — instead
      // of each task independently firing its own hourly notifications (which
      // floods the notification tray and causes ADHD paralysis).
      const t = title.length > 40 ? title.slice(0, 37) + '...' : title;
      const reminders = [
        {
          days_before: 1, hour: 20, minute: 0, relative_minutes_before: null,
          label: 'night before',
          notification_title: `Heads up 🌙 ${t}`,
          notification_body: `Just a heads up — "${t}" is due tomorrow. You've got this! ✨`,
        },
      ];
      console.log(`[generateReminderSchedule] Day-only schedule for "${title}" (${priority}) — ${reminders.length} reminder (night-before only; day-of handled by smart cron)`);
      return Response.json({ reminders });
    }

    const scheduledStr = scheduled.toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    const nowStr = now.toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    const prompt = `You are an ADHD productivity expert helping someone with ADHD manage their task reminders.

TASK TITLE: "${title}"
TASK PRIORITY: ${priority}
TASK CLASSIFICATION: ${classification || 'task'}
SCHEDULED FOR: ${scheduledStr}
CURRENT TIME: ${nowStr}
TASK TIMING: ${isSameDay ? 'SAME-DAY TASK — this task is scheduled for TODAY. The scheduled time may have already passed, but the task is still owed today. Generate reminders for the remaining hours of today using days_before: 0.' : 'FUTURE TASK — this task is scheduled for a future date. Use days_before to schedule advance reminders.'}
${isSameDay ? `HOURS REMAINING TODAY: ~${hoursRemainingToday} hours until end of day. Spread reminders across these remaining hours.` : ''}
${isDeadline ? `CRITICAL DEADLINE RULE: The user said this must be done BY ${scheduledStr} — that is a DEADLINE, not an appointment. There is NO clock time; the work can be done any time before the deadline, so reminders MUST start IN ADVANCE and build toward the due day.
- YOU decide how far ahead to start, based on how much actual work this specific task takes:
  * Quick one-step things (pay a bill, send an email, make a call, order something): start 1-2 days before.
  * Errands or things that need a trip, a form, or another person (DMV, doctor's office, mail something, get a signature): start 3-5 days before.
  * Multi-step or heavy tasks (taxes, a report, a big cleanout, applications, packing for a trip, anything with paperwork or research): start 1-2 weeks before — long tasks need runway.
- Use ABSOLUTE reminders only (days_before + hour, typically hour 9 or 18). NEVER use relative_minutes_before — there is no clock time to be relative to.
- ALWAYS include a reminder the day before (days_before: 1) and one on the due day (days_before: 0).
- Total 2-5 reminders spread across the runway; escalate the tone as the deadline gets close.
- The body should reference how much time is LEFT ("you've got about a week", "this is due tomorrow") and, for bigger tasks, nudge toward a small first step.
` : ''}${classification === 'event' ? 'CRITICAL EVENT RULE: This is an EVENT (a scheduled occurrence the user attends — meeting, concert, appointment, party, class, meetup). NEVER schedule a reminder AFTER the event start time. The event is over once it starts — a "coming up in an hour" reminder 4 hours after the event is useless and confusing. All reminders must fire BEFORE the scheduled time. If the event time has already passed, do NOT schedule any reminders at all.' : ''}

Based on ADHD research and behavioral psychology, determine the optimal reminder schedule for this specific task.

KEY ADHD REMINDER PRINCIPLES:
- People with ADHD struggle with executive function — they often forget things, so multiple reminders help for important tasks
- BUT too many reminders can create anxiety and overwhelm — find the right balance (usually 1-4 reminders)
- "Just-in-time" reminders work well for time-sensitive tasks (right before the task)
- Advance reminders help for tasks that need preparation or travel
- Externalizing future thoughts reduces cognitive load — a well-timed reminder is like a "body double"
- People with ADHD benefit from reminders that create a gentle sense of urgency without overwhelming

FIRST, DETERMINE IF THIS IS A SAME-DAY TASK OR A FUTURE TASK:
- SAME-DAY: The scheduled date is TODAY — the same calendar date as the current time. This includes tasks where the scheduled time has ALREADY PASSED today (e.g. it was scheduled for 9 AM but it's now 5 PM — the task is still owed today!). Same-day tasks are things like "drink water", "take medication", "call the doctor", "pick up groceries", "eat lunch", "cancel subscription", "pay a bill today", "drink coffee", "exercise", "check email", "take a shower".
- FUTURE: The scheduled date is tomorrow or further out — appointments, deadlines, events on other days.

IMPORTANT: If the scheduled date is TODAY, even if the scheduled time has already passed, this is a SAME-DAY task. Do NOT push it to tomorrow. Generate reminders for the remaining hours of today.

=== SAME-DAY TASKS (scheduled for today) ===
For same-day tasks, do NOT use days_before. Spread reminders across the REMAINING hours of today using ABSOLUTE times with days_before: 0 and specific hours, OR use RELATIVE reminders tied to the scheduled time.

ADHD PRINCIPLE FOR SAME-DAY TASKS: People with ADHD lose track of time during the day. They need reminders spread across the day at different intervals — not just one at 9 AM. A reminder at 9 AM does NOT guarantee the task gets done by 5 PM. Spread reminders across morning, afternoon, and evening to maximize the chance of actually completing the task.

SAME-DAY REMINDER SPACING BY PRIORITY:
- URGENT (same-day): 3-4 reminders spread across the day. E.g. if it's 10 AM now: one soon (e.g. 11 AM), one midday (1 PM), one afternoon (4 PM), one evening (6 PM). Use ABSOLUTE times with days_before: 0.
- HIGH (same-day): 2-3 reminders spread across the day. E.g. one soon, one midday, one evening.
- MEDIUM (same-day): 1-2 reminders. One at a well-chosen time, and optionally a second later in the day.
- LOW (same-day): Exactly 1 reminder at a single well-chosen time later today.

SAME-DAY TASK TYPE EXAMPLES:
- SELF-CARE (drink water, take medication, exercise, shower, eat lunch): Spread 2-3 reminders across the day — these are easy to forget during a busy day.
- QUICK ACTIONS (cancel subscription, call someone, send email, pay bill): 1-2 reminders; people often intend to do it "later" and forget.
- PICKUP / DELIVERY (pick up groceries, fetch package): 1-2 reminders, one ahead of time and one just-in-time.
- URGENT SAME-DAY (pay bill due today, call before closing): 3-4 reminders spread across remaining hours.

=== FUTURE TASKS (scheduled for tomorrow or later) ===

PRIORITY-BASED REMINDER PERSISTENCE (for future tasks):
- URGENT: 3-4 reminders spread across multiple days. Start further in advance (e.g. 3 days before) and escalate closer to the event. Include a just-in-time reminder.
- HIGH: 2-3 reminders. Start 1-2 days in advance, include a day-of morning reminder, and a just-in-time reminder.
- MEDIUM: 1-2 reminders (day-of morning and/or just-in-time).
- LOW: Exactly 1 reminder, well-timed shortly before the event.

FUTURE TASK TYPE GUIDELINES:
- DEADLINES (submissions, reports): 3 days before, 1 day before, morning of
- ROUTINE / HABIT: 1-2 reminders at the right time
- ONE-TIME SIMPLE (pickup, delivery, call): 1-2 reminders before the task time
- TIME-SENSITIVE / PERISHABLE: 2-3 reminders within a few hours of the task
- GENERAL: Use your judgment based on the task nature and priority

NOTE: Calendar events are handled by a separate deterministic system — you do not need to handle those. Everything else reaching you is a task, a deadline, or a one-time action, including things like appointments and bills.

GENERAL RULES:
- Always include at least 1 reminder
- Never schedule more than 4 reminders (overwhelming)
- Scale reminder count by priority: URGENT=3-4, HIGH=2-3, MEDIUM=1-2, LOW=1
- For "morning" = 9 (hour 9), "afternoon" = 13 (hour 13, 1 PM), "evening" = 18 (hour 18, 6 PM)
- CRITICAL: Only include reminders that would fire AFTER the current time (${nowStr}). If a reminder time would already be in the past, skip it or move it later.
- For same-day tasks: if it's already past morning, start reminders from the next available hour — don't schedule a 9 AM reminder at 2 PM.

Return a JSON object with a "reminders" array. Each reminder is either ABSOLUTE (tied to a specific clock time on a specific day) or RELATIVE (tied to the event time itself).

ABSOLUTE reminders use days_before + hour + minute:
- "days_before": integer (0 = day of the event, 1 = day before, 2 = two days before, etc.)
- "hour": integer (0-23, 24-hour format: 9 = 9 AM, 13 = 1 PM, 18 = 6 PM)
- "minute": integer (0-59)
- "relative_minutes_before": null

RELATIVE reminders use relative_minutes_before (minutes before the event time):
- "relative_minutes_before": integer (e.g. 60 = 1 hour before, 30 = 30 min before, 120 = 2 hours before)
- "days_before": null, "hour": null, "minute": null
- Use this for "1 hour before", "30 minutes before", etc. — NO math needed, just the number of minutes.

WORKED EXAMPLE — FUTURE TASK: If the event is at 1:00 PM on July 31:
- "2 days before at 9 AM" → ABSOLUTE: { days_before: 2, hour: 9, minute: 0, relative_minutes_before: null, label: "2 days before" }
- "1 day before at 9 AM" → ABSOLUTE: { days_before: 1, hour: 9, minute: 0, relative_minutes_before: null, label: "1 day before" }
- "morning of at 9 AM" → ABSOLUTE: { days_before: 0, hour: 9, minute: 0, relative_minutes_before: null, label: "morning of" }
- "1 hour before" → RELATIVE: { days_before: null, hour: null, minute: null, relative_minutes_before: 60, label: "1 hour before" }
- "evening at 6 PM" → ABSOLUTE: { days_before: 0, hour: 18, minute: 0, relative_minutes_before: null, label: "evening" }

WORKED EXAMPLE — SAME-DAY TASK: If the task is "Drink water" scheduled for today at 9 AM, and current time is 10 AM:
- "mid-morning" → ABSOLUTE: { days_before: 0, hour: 11, minute: 0, relative_minutes_before: null, label: "mid-morning nudge" }
- "midday" → ABSOLUTE: { days_before: 0, hour: 13, minute: 0, relative_minutes_before: null, label: "midday reminder" }
- "afternoon" → ABSOLUTE: { days_before: 0, hour: 16, minute: 0, relative_minutes_before: null, label: "afternoon reminder" }
- "evening" → ABSOLUTE: { days_before: 0, hour: 18, minute: 0, relative_minutes_before: null, label: "evening nudge" }
All with days_before: 0 because it's today.

RULES:
- For clock-time reminders (morning, afternoon, evening, X days before at Y AM): use ABSOLUTE
- For "N minutes/hours before" reminders: use RELATIVE with just the number of minutes
- Only include reminders that would fire AFTER the current time (${nowStr})

NOTIFICATION TEXT:
For each reminder, also write a personalized, friendly notification title and body.
TONE: Warm, supportive, and encouraging — like a friend giving a gentle nudge. Never cold, dry, or demanding. Match the ADHD-friendly vibe of the app.
- notification_title: Short (2-6 words), warm, include a relevant emoji. Use the task name or a friendly reference.
- notification_body: Supportive and encouraging. Reference the RELATIVE timing (e.g. "due today", "coming up in 2 days", "in about an hour") — do NOT mention the specific calendar date.
  - For advance reminders (future task, days before): be gentle and anticipatory ("Heads up!", "Don't forget", "Just a nudge")
  - For same-day reminders: be motivating and confident, as a supportive friend ("You got this!", "Hey, don't forget to...", "Quick nudge — time to...")
  - For just-in-time reminders: be action-oriented ("Time to head out!", "Almost time!")
Examples:
  - notification_title: "Carmax payment 💰" / notification_body: "This is your morning reminder — your CarMax payment is due today. You got this! 💧"
  - notification_title: "Therapist appointment 🏥" / notification_body: "Your appointment is coming up in about an hour. Time to head out! 🚗"
  - notification_title: "Register microchips 🔬" / notification_body: "Heads up! You need to register those microchips today. You've got this! 💪"`;

    const schemaInstruction = `\n\nReturn ONLY valid JSON with this shape:
{
  "reminders": [
    {
      "days_before": number|null,
      "hour": number|null,
      "minute": number|null,
      "relative_minutes_before": number|null,
      "label": "string",
      "notification_title": "string",
      "notification_body": "string"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an ADHD productivity expert. Always respond with valid JSON only.' },
        { role: 'user', content: prompt + schemaInstruction }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(completion.choices[0].message.content);

    let reminders = (result.reminders || []).map(r => ({
      days_before: r.days_before != null ? Number(r.days_before) : null,
      hour: r.hour != null ? Number(r.hour) : null,
      minute: r.minute != null ? Number(r.minute) : null,
      relative_minutes_before: r.relative_minutes_before != null ? Number(r.relative_minutes_before) : null,
      label: r.label,
      notification_title: r.notification_title || title,
      notification_body: r.notification_body || title,
    }));

    // Deadlines have no clock time, so a "45 minutes before" reminder is
    // meaningless — convert/drop anything relative and guarantee a day-before
    // heads-up so a deadline can never sneak up silently.
    if (isDeadline) {
      const t = title.length > 40 ? title.slice(0, 37) + '...' : title;
      reminders = reminders.filter(r => r.relative_minutes_before == null);
      if (!reminders.some(r => r.days_before === 1)) {
        reminders.push({
          days_before: 1, hour: 18, minute: 0, relative_minutes_before: null,
          label: 'day before deadline',
          notification_title: `Due tomorrow ⏳ ${t}`,
          notification_body: `Heads up — "${t}" needs to be done by tomorrow. Even a small start counts. ✨`,
        });
      }
      if (!reminders.some(r => r.days_before === 0)) {
        reminders.push({
          days_before: 0, hour: 9, minute: 0, relative_minutes_before: null,
          label: 'deadline day',
          notification_title: `Deadline day 🔔 ${t}`,
          notification_body: `Today's the deadline for "${t}". You've got this! 💪`,
        });
      }
    }

    // ── Time-specific tasks: nothing fires after the scheduled time ─────────
    // A task set for a specific clock time (not day-only) should only be
    // nudged BEFORE it happens. Reminders after the fact are noise — the
    // overdue system handles what happens once the time has passed.
    // Guarantee the two that actually matter: 1 hour before, and at the time.
    if (!dayOnly) {
      const t = title.length > 40 ? title.slice(0, 37) + '...' : title;
      const fireTime = (r) => {
        if (r.relative_minutes_before != null) {
          return new Date(scheduled.getTime() - r.relative_minutes_before * 60000);
        }
        const d = new Date(scheduled);
        d.setDate(d.getDate() - (r.days_before || 0));
        d.setHours(r.hour ?? 9, r.minute ?? 0, 0, 0);
        return d;
      };

      const before = reminders.length;
      reminders = reminders.filter(r => fireTime(r) <= scheduled);
      if (reminders.length < before) {
        console.log(`[generateReminderSchedule] Dropped ${before - reminders.length} reminder(s) scheduled after the task time`);
      }

      const hasOneHourBefore = reminders.some(r => r.relative_minutes_before === 60);
      const hasAtTime = reminders.some(r => r.relative_minutes_before === 0);

      if (!hasOneHourBefore && new Date(scheduled.getTime() - 60 * 60000) > now) {
        reminders.push({
          days_before: null, hour: null, minute: null, relative_minutes_before: 60,
          label: '1 hour before',
          notification_title: `⏰ ${t}`,
          notification_body: `Coming up in about an hour: "${t}". Time to start wrapping up! ✨`,
        });
      }
      if (!hasAtTime && scheduled > now) {
        reminders.push({
          days_before: null, hour: null, minute: null, relative_minutes_before: 0,
          label: 'right now',
          notification_title: `🔔 ${t}`,
          notification_body: `It's time — "${t}". You've got this! 💪`,
        });
      }
    }

    // Safety cap for events: never schedule a reminder more than 1 day before.
    // The LLM sometimes generates "60 days before" reminders for far-future
    // events, which fires immediately and is completely useless.
    if (classification === 'event') {
      const maxAdvanceMinutes = 24 * 60; // 1 day
      const before = reminders.length;
      reminders = reminders.filter(r => {
        if (r.relative_minutes_before != null) return r.relative_minutes_before <= maxAdvanceMinutes;
        if (r.days_before != null && r.days_before > 1) return false;
        return true;
      });
      if (reminders.length < before) {
        console.log(`[generateReminderSchedule] Dropped ${before - reminders.length} event reminder(s) more than 1 day before`);
      }
    }

    console.log(`[generateReminderSchedule] Generated ${reminders.length} reminders for "${title}"`);

    return Response.json({ reminders });
  } catch (error) {
    console.error('[generateReminderSchedule] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}