// Shared "smart add" prompt used by BOTH the AddTask page and the Google
// Calendar sync, so manually-added and imported items go through the EXACT
// same AI decision process (urgency, energy, reminder type & frequency,
// event-vs-task, due date). Keep this in sync with nothing — this IS the
// single source of truth for the smart-add prompt.

export function buildTaskParsePrompt(inputText: string): string {
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return `Parse task: "${inputText}"

      TODAY IS: ${todayISO} (YYYY-MM-DD)
      TOMORROW IS: ${tomorrowISO} (YYYY-MM-DD)
      CURRENT TIME: ${currentTime}

      TITLE EXTRACTION RULES (CRITICAL):
      - ALWAYS strip the outer "remind me to" or "remind me" wrapper from the title.
      - The title should be the actual action the user needs to do, not the meta-instruction.
      - Examples:
        "remind me to call dentist tomorrow" → title: "Call dentist"
        "remind me to remind my dad to check the door tomorrow" → title: "Remind dad to check the door"
        "remind me to take my medicine" → title: "Take medicine"
      - Keep the inner action intact; only strip the outermost "remind me to" phrase.
      - Capitalize the first word. Remove time/date references from the title.

      TIMING RULES:

      "in X" vs "every X":
      - If user says "in 10 minutes" or "in 1 hour" → ONE-TIME ONLY
        Set: reminder_interval="once", target_date=TODAY, target_time=CALCULATED_TIME
      - If user says "every 10 minutes" or "every hour" → RECURRING
        Set: reminder_interval="10min" or "1hour", no target_date/target_time

      "tomorrow" with NO specific time:
      - Set: reminder_interval="once", target_date=TOMORROW, target_time=null, needs_date_pick=true
      - The app will ask the user to pick a time.

      "tomorrow at X":
      - Set: reminder_interval="once", target_date=TOMORROW, target_time=<specified time>

      SPECIFIC DAY-OF-MONTH (CRITICAL — this is commonly missed):
      - "on the 28th", "by the 28th", "the 28th" → ONE-TIME, reminder_interval="once"
        → target_date = current month + that day number, format YYYY-MM-DD
        → If that day has already passed this month, use next month
        → target_time = null unless a time is also specified; if no time, set needs_date_pick=true
        → Example: today is ${todayISO}, "pay zx4rr on the 28th" → target_date="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28", reminder_interval="once", target_time=null, needs_date_pick=true
      - "on the 1st", "by the 15th" → same logic

      Other rules:
      - "at 2pm" → ONE-TIME, reminder_interval="once", target_time="14:00"
      - "daily"/"every day" → reminder_interval="daily"
      - "every other day" → reminder_interval="every_other_day"

      REMINDER STRATEGY (when user does NOT specify a time):

      "TODAY" OVERRIDE (CRITICAL — commonly missed):
      If the user says "today" (e.g., "I need to clean the dishes and the floor today",
      "do laundry today"), the task needs to get done TODAY — it is NOT an ongoing daily habit.
      - Treat it as RECURRING with reminder_interval="2hours" (remind every 2 hours until completed).
      - This applies to CHORES too: "clean the dishes today", "clean the floor today",
        "do the dishes today" → reminder_interval="2hours", NOT "daily".
      - urgency based on the task (chores → "medium", time-sensitive → "high").
      - "daily" is ONLY for ongoing habits/routines where the user did NOT say "today".
      - Example: "clean the dishes today" → reminder_interval="2hours", urgency="medium", needs_date_pick=false
      - Example: "do laundry today" → reminder_interval="2hours", urgency="high", needs_date_pick=false

      STEP 1 — Decide: is this RECURRING or ONE-TIME?

      RECURRING (keep reminding until done):
      - Important obligations that need to get done: paying bills, submitting reports, calling someone important, taking medicine, deadlines
      - Anything where forgetting has real consequences
      - Habits or routines: "walk the dog every day", "take vitamins"
      - Use: reminder_interval = "2hours", "daily", or "every_other_day" (NO target_date/target_time)
      - Examples:
        "pay my electric bill" → reminder_interval="2hours" (important, needs doing today)
        "pay rent" → reminder_interval="2hours" (urgent financial obligation)
        "submit the report" → reminder_interval="1hour" (work deadline, high stakes)
        "call the doctor" → reminder_interval="2hours" (health-related, important)
        "take my medication" → reminder_interval="daily"
        "finish project by Friday" → reminder_interval="2hours"

      ONE-TIME (single notification, then done):
      - User explicitly mentions a time: "at 3pm", "tomorrow morning", "in 2 hours"
      - Low-stakes reminders where one nudge is enough: "pick up cookies", "find the pasta", "check the mail"
      - Things tied to a specific moment: "make lunch tomorrow", "reminder for my dentist at 2pm"
      - Use: reminder_interval="once", target_date=YYYY-MM-DD, target_time=HH:MM
      - Examples:
        "remind me to make lunch tomorrow" → once, target_date=TOMORROW, target_time=null, needs_date_pick=true
        "pick up cookies" → once, target_date=TODAY, target_time=null, needs_date_pick=true
        "remind me at 5pm to call John" → once, target_date=TODAY, target_time="17:00"
        "find the pasta" → once, target_date=TODAY, target_time=null, needs_date_pick=true

      STEP 2 — Pick the right interval for recurring tasks:
      - "2hours" → important tasks needing to be done today (bills, deadlines, work tasks)
      - "1hour" → very urgent/time-sensitive work tasks with hard deadlines
      - "daily" → habits, routines, or things due in a few days
      - "every_other_day" → lower-importance ongoing things

      NEVER set target_time to the current moment unless user said "now" or "right now".
      CRITICAL: NEVER infer, guess, or hallucinate a target_time. Only set target_time when the user EXPLICITLY states a time (e.g., "at 5pm", "at 3:30", "by noon"). If the user did not mention a specific time, set target_time=null. Do not use domain knowledge to guess times (e.g., don't assume daycare pickup is 5pm, don't assume work starts at 9am).

      SMART PRIORITY SUGGESTIONS:
      - Time-sensitive or deadline-based → "urgent" or "high"
      - Important but flexible → "high" or "medium"
      - Routine maintenance → "medium"
      - Nice-to-have → "low"

      SMART INFERENCE (when user does NOT specify a time, frequency, or date):
      Infer the best reminder_interval and urgency from the NATURE of the task:

      PERISHABLE / TIME-SENSITIVE (degrades or has consequences if delayed):
      - Food/perishables: "move food to freezer", "put leftovers in fridge", "defrost chicken"
      - Laundry: "move laundry to dryer", "take clothes out of washer"
      - Medication: "take meds", "take medicine", "take antibiotics"
      - Cooking: "check on the oven", "stir the pot", "flip the food"
      - Pets/plants: "feed the cat", "water the plants"
      - → reminder_interval="2hours", urgency="high"
      - CRITICAL: These are RECURRING tasks, NOT one-time. Set needs_date_pick=false.
        They must start recurring reminders immediately — never show the date picker for these.
        "move food to the freezer" → reminder_interval="2hours", urgency="high", needs_date_pick=false

      HARD DEADLINE / IMPORTANT OBLIGATION (serious consequences if missed):
      - Financial: "pay rent", "pay electric bill", "transfer money", "pay credit card"
      - Legal/admin: "submit form", "file taxes", "renew license", "submit application"
      - Work: "submit report", "send email to boss", "turn in project"
      - Appointments: "call doctor", "confirm appointment", "reschedule meeting"
      - → reminder_interval="1hour" if deadline is today or tomorrow, otherwise "2hours", urgency="high"

      ROUTINE / HABIT (recurring wellness or maintenance, low urgency):
      - Wellness: "stretch", "take vitamins", "drink water", "meditate", "do pushups"
      - Chores: "make bed", "water plants", "tidy desk"
      - → reminder_interval="daily", urgency="low" or "medium"
      - CRITICAL: Only use "daily" when the user did NOT say "today". If the user said
        "today" (e.g., "clean the dishes today", "clean the floor today"), this is a
        TODAY task, not a daily habit → use reminder_interval="2hours" instead (see TODAY OVERRIDE above).

      GENERAL ACTIONABLE TASKS (not perishable, not a hard deadline, not a routine/habit):
      Tasks that need to get done but have no specific deadline or schedule.
      Examples: "post the Subaru parts on Marketplace", "sell the old laptop", "fix the leaky faucet",
      "organize the garage", "research vacuum cleaners", "list items on eBay", "clean the car",
      "Amazon returns", "drop off donation"
      - These are RECURRING — remind until done. Do NOT ask for a date.
      - ALWAYS infer urgency and reminder_interval yourself based on the task's nature:
        * Real consequences if delayed (deadline today, someone waiting, time-sensitive) → urgency="high", reminder_interval="2hours"
        * Important but flexible — no deadline pressure (selling items, errands, projects, organizing) → urgency="medium", reminder_interval="4hours"
        * Low-stakes, nice-to-have, no rush → urgency="low", reminder_interval="daily"
        * When in doubt, default to medium.
      - Set priority_uninferrable=false, is_flexible=true (task can be done any day)

      PRIORITY UNINFERRABLE (ABSOLUTE LAST RESORT — almost never use):
      Only set priority_uninferrable=true if the task is SO VAGUE that you genuinely cannot
      determine any reasonable urgency level. This should be extremely rare — almost every task
      has enough context to infer at least a medium priority. When in doubt, default to
      urgency="medium", reminder_interval="4hours" rather than asking the user.

      If the task DOES fit a SMART INFERENCE category, or has a specific time/date:
      - Set priority_uninferrable=false
      - Set is_flexible=false if a specific time/date/deadline is mentioned
      - Set is_flexible=true if no specific time/date is mentioned but the task fits an inference category

      NEEDS DATE PICK (VERY RESTRICTIVE — only for scheduled events):
      ONLY set needs_date_pick=true for tasks tied to a SPECIFIC calendar date/event that the user
      explicitly referenced but didn't give a time for:
      - Appointments: "dentist tomorrow", "doctor on Friday", "therapy at 12pm"
      - Events: "concert on the 28th", "wedding Saturday", "Martin's party on the 30th"
      - Scheduled activities: "make lunch tomorrow", "pick up cake Tuesday"

      NEVER use needs_date_pick for:
      - General actionable tasks (selling, posting, errands, chores, projects) → infer urgency and set recurring reminder_interval
      - PERISHABLE/TIME-SENSITIVE tasks → recurring (reminder_interval set)
      - HARD DEADLINE tasks → recurring (reminder_interval set)
      - Routine/habit tasks → recurring (reminder_interval="daily")

      If needs_date_pick=true:
      - Still provide reminder_interval as a fallback (used if user picks "any day")
      - Do NOT set target_date or target_time — let the user pick

      Extract:
      1. Clean title (strip "remind me to/I need to/in X minutes" — keep inner action)
      2. Urgency: ALWAYS suggest (low/medium/high/urgent)
      3. Energy: ALWAYS suggest (low/medium/high)
      4. target_date: for "in X" (TODAY), "tomorrow", or specific dates — format YYYY-MM-DD
      5. target_time: for "in X" (calculate), "at X" (specific), or null if no time mentioned
      6. reminder_interval: ALWAYS provide (10min/20min/30min/1hour/2hours/4hours/daily/every_other_day/once)

      JSON:
      {
      "title": "clean title",
      "urgency": "medium",
      "energy_required": "medium",
      "target_date": "YYYY-MM-DD or null",
      "target_time": "HH:MM or null",
      "reminder_interval": "10min|20min|30min|1hour|2hours|4hours|daily|every_other_day|once",
      "priority_uninferrable": false,
      "is_flexible": false,
      "needs_date_pick": false
      }`;
}