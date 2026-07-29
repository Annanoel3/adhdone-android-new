// LLM-powered reminder schedule generator.
// Takes a task title + scheduled date/time and returns an optimal reminder
// schedule based on ADHD research principles. The LLM determines how many
// reminders to send and when, relative to the scheduled time.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ── Deterministic task type classification & schedules ─────────────────────
// Appointments, events, and payments use fixed, reliable schedules instead of
// LLM-generated ones. This ensures consistent timing and saves integration credits.

function classifyTaskType(title) {
  const lower = title.toLowerCase().trim();

  // Payments — check first since "pay" is a common verb
  if ([
    /\bpayment\b/, /\bbill\b/, /\brent\b/, /\binvoice\b/, /\bsubscription\b/,
    /\bfee\b/, /\bdues\b/, /\btuition\b/, /\bmortgage\b/, /\bpremium\b/,
    /\bautopay\b/, /\bauto pay\b/, /\bpay \w/, /\belectric\b/, /\butility\b/,
    /\btax\b/, /\binsurance\b/, /\bcredit card\b/,
  ].some(p => p.test(lower))) return 'payment';

  // Appointments — meeting a specific person for a scheduled visit
  if ([
    /\bappointment\b/, /\bdentist\b/, /\bdoctor\b/, /\bgastroenterologist\b/,
    /\btherapist\b/, /\bconsultation\b/, /\bclinic\b/, /\bcheckup\b/,
    /\bvisit\b/, /\bsession\b/, /\bcounseling\b/, /\bpsychologist\b/,
    /\bpsychiatrist\b/, /\borthodontist\b/, /\bhygienist\b/, /\bexam\b/,
    /\bphysical\b/, /\bcleaning\b/, /\binspection\b/, /\breunion\b/,
    /\binterview\b/, /\bmeet up with\b/, /\bsee the\b/, /\bmeet with\b/,
    /\bsurgery\b/, /\bfollow.?up\b/, /\bscreening\b/,
  ].some(p => p.test(lower))) return 'appointment';

  // Events — social gatherings, concerts, meetups
  if ([
    /\bconcert\b/, /\bmeetup\b/, /\bmeet up\b/, /\bparty\b/, /\bcelebration\b/,
    /\bfestival\b/, /\bgathering\b/, /\bwebinar\b/, /\bconference\b/,
    /\bretreat\b/, /\bworkshop\b/, /\bseminar\b/, /\bevent\b/, /\battend\b/,
    /\brsvp\b/,
  ].some(p => p.test(lower))) return 'event';

  return null;
}

function getDeterministicSchedule(taskType) {
  switch (taskType) {
    case 'appointment':
      return [
        { days_before: 2, hour: 9, minute: 0, relative_minutes_before: null, label: '2 days before' },
        { days_before: 1, hour: 9, minute: 0, relative_minutes_before: null, label: '1 day before' },
        { days_before: 0, hour: 9, minute: 0, relative_minutes_before: null, label: 'morning of' },
        { days_before: null, hour: null, minute: null, relative_minutes_before: 60, label: '1 hour before' },
      ];
    case 'event':
      return [
        { days_before: 0, hour: 9, minute: 0, relative_minutes_before: null, label: 'morning of' },
        { days_before: null, hour: null, minute: null, relative_minutes_before: 60, label: '1 hour before' },
      ];
    case 'payment':
      return [
        { days_before: 0, hour: 9, minute: 0, relative_minutes_before: null, label: 'morning reminder' },
        { days_before: 0, hour: 13, minute: 0, relative_minutes_before: null, label: 'afternoon reminder' },
        { days_before: 0, hour: 18, minute: 0, relative_minutes_before: null, label: 'evening reminder' },
      ];
    default:
      return null;
  }
}

function getDeterministicNotificationText(taskType, label, title) {
  const emoji = taskType === 'appointment' ? '📅' : taskType === 'event' ? '🎉' : '💲';
  const t = title.length > 40 ? title.slice(0, 37) + '...' : title;

  const templates = {
    appointment: {
      '2 days before': { title: `${emoji} ${t}`, body: `Heads up! Your "${t}" is coming up in 2 days. You've got this! 🌟` },
      '1 day before': { title: `${emoji} ${t}`, body: `Tomorrow's the day! Your "${t}" is tomorrow. Don't forget to prep! ✨` },
      'morning of': { title: `${emoji} ${t}`, body: `Good morning! Your "${t}" is today. You got this! 🚀` },
      '1 hour before': { title: `⏰ ${t}`, body: `Almost time! Your "${t}" is in about an hour. Time to head out! 🚗` },
    },
    event: {
      'morning of': { title: `${emoji} ${t}`, body: `Good morning! Your "${t}" is today. You got this! ✨` },
      '1 hour before': { title: `⏰ ${t}`, body: `Almost time! Your "${t}" is in about an hour. Time to head out! 🚗` },
    },
    payment: {
      'morning reminder': { title: `${emoji} ${t}`, body: `Good morning! Your "${t}" is due today. You got this! ✨` },
      'afternoon reminder': { title: `${emoji} ${t}`, body: `Hey! Just a nudge — your "${t}" is due today. Don't forget! 💪` },
      'evening reminder': { title: `${emoji} ${t}`, body: `Final reminder! Your "${t}" is due today. Get it done before the day ends! 🌙` },
    },
  };

  return (templates[taskType] && templates[taskType][label]) || { title: `${emoji} ${t}`, body: `Reminder: ${t}` };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const bodyText = await req.text();
    const { title, scheduledDateISO, urgency } = JSON.parse(bodyText);

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

    // ── Deterministic classification ──────────────────────────────────────
    // Appointments, events, and payments use fixed schedules (no LLM needed).
    const taskType = classifyTaskType(title);
    if (taskType) {
      const schedule = getDeterministicSchedule(taskType);
      const reminders = schedule.map(r => {
        const text = getDeterministicNotificationText(taskType, r.label, title);
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
      console.log(`[generateReminderSchedule] Deterministic "${taskType}" schedule for "${title}" — ${reminders.length} reminders (no LLM call)`);
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
SCHEDULED FOR: ${scheduledStr}
CURRENT TIME: ${nowStr}
TASK TIMING: ${isSameDay ? 'SAME-DAY TASK — this task is scheduled for TODAY. The scheduled time may have already passed, but the task is still owed today. Generate reminders for the remaining hours of today using days_before: 0.' : 'FUTURE TASK — this task is scheduled for a future date. Use days_before to schedule advance reminders.'}
${isSameDay ? `HOURS REMAINING TODAY: ~${hoursRemainingToday} hours until end of day. Spread reminders across these remaining hours.` : ''}

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

NOTE: Appointments (doctors, therapists), social events (concerts, meetups), and payments (bills, rent) are handled by a separate deterministic system — you do not need to handle those types. Focus on general tasks, deadlines, and one-time actions.

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
                },
                notification_title: {
                  type: "string",
                  description: "Short friendly title (2-6 words) with a relevant emoji"
                },
                notification_body: {
                  type: "string",
                  description: "Warm, supportive message referencing relative timing (not specific dates)"
                }
              },
              required: ["label", "notification_title", "notification_body"]
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
      label: r.label,
      notification_title: r.notification_title || title,
      notification_body: r.notification_body || title,
    }));

    console.log(`[generateReminderSchedule] Generated ${reminders.length} reminders for "${title}"`);

    return Response.json({ reminders });
  } catch (error) {
    console.error('[generateReminderSchedule] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}