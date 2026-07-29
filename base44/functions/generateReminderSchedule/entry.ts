// LLM-powered reminder schedule generator.
// Takes a task title + scheduled date/time and returns an optimal reminder
// schedule based on ADHD research principles. The LLM determines how many
// reminders to send and when, relative to the scheduled time.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const bodyText = await req.text();
    const { title, scheduledDateISO } = JSON.parse(bodyText);

    if (!title || !scheduledDateISO) {
      return Response.json({ error: 'title and scheduledDateISO required' }, { status: 400 });
    }

    const scheduled = new Date(scheduledDateISO);
    const now = new Date();

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
SCHEDULED FOR: ${scheduledStr}
CURRENT TIME: ${nowStr}

Based on ADHD research and behavioral psychology, determine the optimal reminder schedule for this specific task.

KEY ADHD REMINDER PRINCIPLES:
- People with ADHD struggle with executive function — they often forget things, so multiple reminders help for important tasks
- BUT too many reminders can create anxiety and overwhelm — find the right balance (usually 1-4 reminders)
- "Just-in-time" reminders work well for time-sensitive tasks (right before the task)
- Advance reminders help for tasks that need preparation or travel
- Externalizing future thoughts reduces cognitive load — a well-timed reminder is like a "body double"
- People with ADHD benefit from reminders that create a gentle sense of urgency without overwhelming

REMINDER SCHEDULE GUIDELINES BY TASK TYPE:

APPOINTMENTS (doctors, therapists, dentists, interviews, consultations):
- These require travel time and mental preparation
- Schedule: 2 days before (at 9 AM), 1 day before (at 9 AM), morning of (at 9 AM), 1 hour before
- The early reminders help them prepare; the later ones are "just-in-time" for travel

SOCIAL EVENTS / MEETUPS (meets, concerts, parties, gatherings):
- Need time to prepare and travel, but less advance prep than appointments
- Schedule: morning of (at 9 AM), 1 hour before

PAYMENTS / BILLS (rent, utilities, subscriptions, loan payments):
- Need to remember throughout the day to actually do it
- Schedule: morning (9 AM), afternoon (1 PM), evening (6 PM) of the due date
- Spreading reminders across the day increases the chance of completion

DEADLINES (project submissions, reports, applications):
- Start gentle a few days before, escalate as it gets closer
- Schedule: 3 days before, 1 day before, morning of

ROUTINE / HABIT tasks (medication, stretching, daily chores):
- 1-2 reminders at the right time is enough
- Don't over-remind — these are familiar tasks

ONE-TIME SIMPLE tasks (pickup, delivery, call someone):
- 1-2 reminders, usually just before the task time

TIME-SENSITIVE / PERISHABLE tasks (food, laundry, medication timing):
- 2-3 reminders within a few hours of the task

GENERAL RULES:
- Always include at least 1 reminder
- Never schedule more than 4 reminders (overwhelming)
- For "morning" = 9 (hour 9)
- For "afternoon" = 13 (hour 13, i.e. 1 PM)
- For "evening" = 18 (hour 18, i.e. 6 PM)
- Only include reminders that would fire AFTER the current time (${nowStr})

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

WORKED EXAMPLE: If the event is at 1:00 PM on July 31:
- "2 days before at 9 AM" → ABSOLUTE: { days_before: 2, hour: 9, minute: 0, relative_minutes_before: null, label: "2 days before" }
- "1 day before at 9 AM" → ABSOLUTE: { days_before: 1, hour: 9, minute: 0, relative_minutes_before: null, label: "1 day before" }
- "morning of at 9 AM" → ABSOLUTE: { days_before: 0, hour: 9, minute: 0, relative_minutes_before: null, label: "morning of" }
- "1 hour before" → RELATIVE: { days_before: null, hour: null, minute: null, relative_minutes_before: 60, label: "1 hour before" }
- "evening at 6 PM" → ABSOLUTE: { days_before: 0, hour: 18, minute: 0, relative_minutes_before: null, label: "evening" }

RULES:
- For clock-time reminders (morning, afternoon, evening, X days before at Y AM): use ABSOLUTE
- For "N minutes/hours before" reminders: use RELATIVE with just the number of minutes
- Only include reminders that would fire AFTER the current time (${nowStr})`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          reminders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                days_before: {
                  type: ["number", "null"],
                  description: "0 = day of event, 1 = day before. Null for RELATIVE reminders."
                },
                hour: {
                  type: ["number", "null"],
                  description: "0-23. Null for RELATIVE reminders."
                },
                minute: {
                  type: ["number", "null"],
                  description: "0-59. Null for RELATIVE reminders."
                },
                relative_minutes_before: {
                  type: ["number", "null"],
                  description: "Minutes before event time (e.g. 60 = 1 hour before). Null for ABSOLUTE reminders."
                },
                label: {
                  type: "string",
                  description: "Short description like '2 days before', '1 hour before', 'morning of'"
                }
              },
              required: ["label"]
            }
          }
        },
        required: ["reminders"]
      }
    });

    const reminders = (result.reminders || []).map(r => ({
      days_before: r.days_before != null ? Number(r.days_before) : null,
      hour: r.hour != null ? Number(r.hour) : null,
      minute: r.minute != null ? Number(r.minute) : null,
      relative_minutes_before: r.relative_minutes_before != null ? Number(r.relative_minutes_before) : null,
      label: r.label
    }));

    console.log(`[generateReminderSchedule] Generated ${reminders.length} reminders for "${title}"`);

    return Response.json({ reminders });
  } catch (error) {
    console.error('[generateReminderSchedule] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}