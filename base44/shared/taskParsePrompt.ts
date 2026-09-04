// Shared "smart add" prompt used by BOTH the AddTask page and the Google
// Calendar sync, so manually-added and imported items go through the EXACT
// same AI decision process (urgency, energy, event-vs-task, due date).
//
// REMINDER PHILOSOPHY (CRITICAL):
// Recurring interval reminders (10min/20min/30min/1hour/2hours/4hours/daily/
// every_other_day) are ONLY created when the user EXPLICITLY asks for them
// ("remind me every 10 minutes", "remind me every 2 hours", "remind me daily",
// "every other day"). For EVERYTHING else, set reminder_interval=null. The
// app's LLM smart-nudge system decides when/how often to remind — it acts as
// a personal assistant, looking at the full task list and the week ahead to
// intelligently decide what to surface each day. Never auto-assign a recurring
// interval based on the task's perceived importance.

export const TASK_PARSE_SYSTEM_PROMPT = "You are a task parsing assistant for an ADHD productivity app. Always respond with valid JSON. Populate every field in the schema. READ THE INPUT LIKE A PERSON FIRST: find the WHEN (any reference to a point in time, in any wording — not just the phrasings listed in the prompt), the WHAT (the verb and everything it acts on), and every person/place/thing named. The example phrasings in the prompt are illustrations, NOT a list of the only phrasings that count. Dropping a day, date, time, or subject the user actually stated is the worst possible failure. CRITICAL REMINDER RULE: reminder_interval must ONLY be set to a recurring value (10min/20min/30min/1hour/2hours/4hours/daily/every_other_day) when the user EXPLICITLY uses recurring language ('every 10 minutes', 'every hour', 'daily', 'every day', 'every other day'). For ALL other tasks, set reminder_interval=null — the app's LLM smart-nudge system decides when/how often to remind based on urgency and due date. NEVER auto-assign a recurring interval based on urgency, task type, or perceived importance. Use 'once' ONLY for one-time precise reminders tied to a specific moment ('in 10 minutes', 'at 3pm'). ALWAYS infer urgency yourself (low/medium/high/urgent) based on the nature of the task. Only set priority_uninferrable=true as an ABSOLUTE LAST RESORT if the task is so vague that importance genuinely cannot be determined; otherwise default to urgency='medium', reminder_interval=null. CRITICAL: NEVER infer, guess, or hallucinate a target_time. Only set target_time when the user EXPLICITLY states a time (e.g., 'at 5pm', 'at 3:30', 'by noon'). If the user did not mention a specific time, set target_time=null.";

export function buildTaskParsePrompt(inputText: string): string {
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  // Calculate end of this week (Sunday). getDay(): 0=Sun, 1=Mon, ... 6=Sat.
  // Days until Sunday: if today is Sunday (0), end of week is today; otherwise (7 - getDay()).
  const endOfThisWeek = new Date(now);
  const daysUntilSunday = now.getDay() === 0 ? 0 : 7 - now.getDay();
  endOfThisWeek.setDate(now.getDate() + daysUntilSunday);
  const endOfThisWeekISO = `${endOfThisWeek.getFullYear()}-${String(endOfThisWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfThisWeek.getDate()).padStart(2, '0')}`;

  // End of next week (Sunday of next week)
  const endOfNextWeek = new Date(endOfThisWeek);
  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);
  const endOfNextWeekISO = `${endOfNextWeek.getFullYear()}-${String(endOfNextWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfNextWeek.getDate()).padStart(2, '0')}`;

  // Calculate next occurrence of a given weekday (0=Sun..6=Sat) from today.
  function nextWeekdayISO(targetDay: number): string {
    const d = new Date(now);
    let diff = targetDay - now.getDay();
    if (diff <= 0) diff += 7; // next occurrence, not today
    d.setDate(now.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const nextFridayISO = nextWeekdayISO(5);
  const nextSaturdayISO = nextWeekdayISO(6);
  const nextSundayISO = nextWeekdayISO(0);

  // ── Precomputed date table ──────────────────────────────────────────────
  // The model is bad at calendar arithmetic, so every phrasing the user might
  // use ("this Wednesday", "next Wednesday", "the first Wednesday of next
  // month", "the 28th of next month") gets a literal date computed here and
  // handed over as a lookup table. Nothing is left for the model to calculate.
  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // "this <weekday>" = the next upcoming occurrence within the next 7 days.
  // "next <weekday>" = the occurrence one week after that.
  const weekdayTable = WEEKDAY_NAMES.map((name, i) => {
    const thisOne = new Date(now);
    let diff = i - now.getDay();
    if (diff <= 0) diff += 7;
    thisOne.setDate(now.getDate() + diff);
    const nextOne = new Date(thisOne);
    nextOne.setDate(thisOne.getDate() + 7);
    return `      this ${name}: ${fmt(thisOne)}   |   next ${name}: ${fmt(nextOne)}`;
  }).join('\n');

  // Nth <weekday> of a month (n = 1..4, or -1 for last)
  function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): string {
    if (n === -1) {
      const d = new Date(year, monthIndex + 1, 0); // last day of month
      while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
      return fmt(d);
    }
    const d = new Date(year, monthIndex, 1);
    while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + (n - 1) * 7);
    return fmt(d);
  }

  const thisMonthIndex = now.getMonth();
  const thisMonthYear = now.getFullYear();
  const nextMonthDate = new Date(thisMonthYear, thisMonthIndex + 1, 1);
  const nextMonthIndex = nextMonthDate.getMonth();
  const nextMonthYear = nextMonthDate.getFullYear();
  const monthName = (y: number, m: number) =>
    new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const ordinalWeekdayTable = WEEKDAY_NAMES.map((name, i) => {
    const parts = [1, 2, 3, 4, -1].map((n) => {
      const label = n === -1 ? 'last' : `${n}${['st', 'nd', 'rd', 'th'][n - 1] || 'th'}`;
      return `${label}=${nthWeekdayOfMonth(thisMonthYear, thisMonthIndex, i, n)}`;
    });
    const nextParts = [1, 2, 3, 4, -1].map((n) => {
      const label = n === -1 ? 'last' : `${n}${['st', 'nd', 'rd', 'th'][n - 1] || 'th'}`;
      return `${label}=${nthWeekdayOfMonth(nextMonthYear, nextMonthIndex, i, n)}`;
    });
    return `      ${name} — this month: ${parts.join(', ')}\n      ${name} — next month: ${nextParts.join(', ')}`;
  }).join('\n');

  const thisMonthPrefix = `${thisMonthYear}-${String(thisMonthIndex + 1).padStart(2, '0')}`;
  const nextMonthPrefix = `${nextMonthYear}-${String(nextMonthIndex + 1).padStart(2, '0')}`;
  const daysInThisMonth = new Date(thisMonthYear, thisMonthIndex + 1, 0).getDate();
  const daysInNextMonth = new Date(nextMonthYear, nextMonthIndex + 1, 0).getDate();

  return `Parse task: "${inputText}"

      TODAY IS: ${todayISO} (YYYY-MM-DD) — ${dayOfWeek}
      TOMORROW IS: ${tomorrowISO} (YYYY-MM-DD)
      END OF THIS WEEK (Sunday): ${endOfThisWeekISO}
      END OF NEXT WEEK (Sunday): ${endOfNextWeekISO}
      NEXT FRIDAY: ${nextFridayISO}
      CURRENT TIME: ${currentTime}

      ═══════════════════════════════════════════════════════════════════════
      HOW TO READ THIS PROMPT (most important instruction here)
      ═══════════════════════════════════════════════════════════════════════
      Everything below contains lots of example phrasings. They are EXAMPLES, NOT
      A CHECKLIST. Never conclude "the user didn't use one of the listed phrases,
      so there's no date / no time / no place." People phrase things a thousand
      ways and only a handful are written down here. Reason about MEANING the way
      a person would, then use the lists only to decide what to DO once you've
      understood the input.

      So, on EVERY input, before anything else, read it like a human and answer:
        WHEN  — is there ANY reference to a point in time, in any wording? A day
                name, a date, a clock time, "today", "tonight", "in the morning",
                "after work", "this weekend", "end of the month", "before my trip",
                "when the store opens", "on my day off", "payday". If you can name
                the day a human would put it on, it HAS a when — resolve it off the
                date table and never return null. Only truly timeless input
                ("sell the old laptop") has no when.
        WHAT  — the action: the VERB plus everything it acts on. If there's no verb
                at all, the input is still a task (a bare place or thing = go
                there / deal with it) — keep it as the user wrote it.
        WHO/WHERE — every person, business, place, or thing named. These always
                survive into the title (and a place also goes in location).
      Then apply the rules below to what you understood. A date, time, or subject
      the user actually stated and you dropped is a HARD FAILURE — that is the
      single worst mistake you can make, worse than guessing the category wrong.

      Two things you must NOT invent, no matter how obvious they feel: a clock
      time, and a location. Those only ever come from the user's own words.
      ═══════════════════════════════════════════════════════════════════════

      ═══════════════════════════════════════════════════════════════════════
      DATE LOOKUP TABLE — USE THESE EXACT DATES, NEVER CALCULATE YOUR OWN
      ═══════════════════════════════════════════════════════════════════════
      Every date below is already computed for you. If the user names a day in
      ANY form, copy the matching date out of this table. Never do calendar math
      yourself, and NEVER return a null date when the user named a day — a
      dropped date is a hard failure.

      DAY NAMES ("this Wednesday" / "next Wednesday"):
${weekdayTable}
      - "this <day>" = the next upcoming one (within 7 days). "next <day>" = one week later.
      - A bare day name with no this/next ("do it Wednesday", "on Friday") = the "this <day>" value.
      - "a week from Wednesday" = the "next <day>" value.

      ORDINAL WEEKDAYS ("the first Wednesday of next month", "last Friday of the month"):
${ordinalWeekdayTable}
      - "this month" / "the month" = the this-month row. "next month" = the next-month row.
      - If the "this month" date has ALREADY PASSED, use the next-month value instead.

      DAY NUMBERS ("the 28th", "the 28th of next month"):
      - THIS MONTH (${monthName(thisMonthYear, thisMonthIndex)}, ${daysInThisMonth} days) → "${thisMonthPrefix}-DD"
      - NEXT MONTH (${monthName(nextMonthYear, nextMonthIndex)}, ${daysInNextMonth} days) → "${nextMonthPrefix}-DD"
      - Zero-pad the day: the 5th → "-05", the 28th → "-28".
      - "the 28th" / "on the 28th" with no month → this month, UNLESS that day already
        passed (today is day ${now.getDate()}), in which case use next month.
      - "the 28th of next month" / "next month on the 28th" → next-month prefix.
      - If the day number does not exist in that month (e.g. the 31st of a 30-day
        month, the 30th of February), use the LAST day of that month.

      MONTH + DAY ("March 15th", "Dec 24", "the 3rd of January", "11/1", "1/5/27"):
      - Build "YYYY-MM-DD" for that month/day.
      - YEAR: current year (${now.getFullYear()}) if still in the future; otherwise NEXT year (${now.getFullYear() + 1}).
      - Numeric dates are US order: MM/DD or MM/DD/YY.
      - If the user gave an explicit year, use it as given.

      ANY OF THESE + A TIME ("next Wednesday at 3", "the 28th at 9am", "March 15 at 5:30pm"):
      - Resolve the date from the table above AND set target_time (24h "HH:MM").
      - target_time="15:00" for "at 3" / "3pm"; "09:00" for "9am"; "17:30" for "5:30pm".
      - A bare hour with no am/pm: pick the interpretation within normal waking hours
        (7am–9pm) — "at 3" → 15:00, "at 8" → 08:00 if morning context, else 20:00.
      - With a time set: reminder_interval="once", needs_date_pick=false, day_only_task=false.
      - Without a time: day_only_task=true (task) or needs_date_pick=true (event), per the rules below.

      REPEATING DATES ("every month on the 1st", "the first Thursday of every month",
      "every Wednesday", "every year on June 3rd"):
      - Set target_date (and due_date) to the NEXT occurrence from the table above, so the
        first one is never lost.
      - Set recurrence_pattern to the repeat rhythm: "monthly" (every month / first-X-of-every-month
        / the Nth of every month), "weekly" (every <weekday>), "every_other_week" (every other
        <weekday> / biweekly), "yearly" (every year on <date>), "daily" (every day).
      - Do NOT use reminder_interval for these — reminder_interval stays null (or "once" if a
        clock time was given). recurrence_pattern is what makes the task come back after completion.
      ═══════════════════════════════════════════════════════════════════════

      ═══════════════════════════════════════════════════════════════════════
      MESSY / PASTED / SHARED TEXT (CRITICAL — read this FIRST)
      ═══════════════════════════════════════════════════════════════════════
      The input is NOT always a clean single instruction. Users paste and share raw
      text straight out of other apps: text-message threads, group chats, emails,
      event pages, screenshots-turned-text. That text is messy, out of order, and
      full of things that are not the task.

      When the input looks like a CONVERSATION or a PASTED BLOCK (multiple lines,
      back-and-forth messages, quoted replies, "Hey ...?" questions, timestamps,
      names as labels), DO NOT try to read it as one sentence. Instead SCAN THE WHOLE
      THING for the four facts a task needs, wherever they appear:
        WHAT  — the actual plan/activity being discussed ("the Renaissance Festival",
                "dinner", "the concert", "helping move")
        WHEN  — any day, date, or clock time anywhere in the text ("this Saturday",
                "the 14th", "4:08 PM", "next Friday at 7")
        WHERE — any address, business, or place anywhere in the text. An address does
                NOT need "at" in front of it and is usually on its OWN line with no
                other words ("1234 Any Street Dr.", "Kroger on Elm", "their house").
        WHO   — the other person involved, if a name is present (the contact name at
                the top of a thread, or whoever is being replied to).

      Rules for assembling the task from messy text:
      - The facts are SCATTERED. The day may be in the first message and the address
        three messages later. Collect them from anywhere in the input — never assume
        they're in one sentence.
      - TWO SPEAKERS. Half the text is the user, half is someone else. Questions like
        "are you still down to go?" or "where are we meeting again?" are CONVERSATION,
        not the task. Never let a question become the title.
      - IGNORE JUNK. Strip app chrome and anything that isn't the plan: phone-carrier
        text ("Sprint LTE", "75%"), clock/battery readouts, message timestamps,
        "Messages"/"Details"/"Search" buttons, website names/URLs, phone-number
        placeholders like "EX: (888) 555-0100", "Tutorial", ads, signatures,
        "Sent from my iPhone", reply headers ("On Tue, X wrote:").
      - BUILD A CLEAN TITLE yourself — do NOT copy a whole message in as the title.
        Write the short action the user needs to do, and include WHO when a name is
        there: "Meet Sarah at the Renaissance Festival".
      - SET location to the address/place you found, EXACTLY as written in the text
        ("1234 Any Street Dr."). Leave location null only if the text truly names no
        place. This is the one case where a location may be pulled from surrounding
        text instead of an explicit "at <place>" — because the user shared the whole
        conversation precisely so the address wouldn't get lost.
      - Apply all the normal date/time/classification rules to the WHEN you found:
        "this Saturday" resolves off the DATE LOOKUP TABLE, a day with no clock time
        for an outing → needs_date_pick=true, etc.
      - A pasted conversation about ONE plan is ONE task, no matter how many messages
        it contains. Do not create a task per message.
      - Example. Input (a pasted thread):
          "Sarah
           Hey, are you still down to go to the Renaissance Festival this Saturday?
           Yeah! I've got my outfit picked out! Where are we meeting again?
           1234 any street dr. See you!"
        → title="Meet Sarah at the Renaissance Festival",
          location="1234 any street dr.", target_date=<this Saturday from the table>,
          target_time=null, classification="event", needs_date_pick=true,
          energy_required="high"
      ═══════════════════════════════════════════════════════════════════════

      TITLE EXTRACTION RULES (CRITICAL):
      - ALWAYS strip the outer "remind me to" or "remind me" wrapper from the title.
      - The title should be the actual action the user needs to do, not the meta-instruction.
      - The time/date phrase can appear BEFORE the action ("remind me at 12:50 tomorrow to go to X").
        Strip ONLY the wrapper and the time/date words — keep the ENTIRE action phrase, including
        the verb's object/destination. NEVER cut the title down to just the verb.
      - Examples:
        "remind me to call dentist tomorrow" → title: "Call dentist"
        "remind me at 12:50 tomorrow to go to RideNow" → title: "Go to RideNow" (NOT "Go")
        "remind me tomorrow at 3 to pick up the cake from Kroger" → title: "Pick up the cake from Kroger"
        "remind me to remind my dad to check the door tomorrow" → title: "Remind dad to check the door"
        "remind me to take my medicine" → title: "Take medicine"
      - Keep the inner action intact; only strip the outermost "remind me to" phrase.
      - Capitalize the first word. Remove time/date references from the title.
      - SANITY CHECK: a title must contain the action AND what it applies to. Single-word titles
        like "Go", "Call", "Pick" are ALWAYS wrong — include the destination/object.
      - FIX SPEECH-TO-TEXT MIS-HEARS OF THE ACTION VERB. Voice input often turns the verb into a
        homophone. A title must start with a real action verb — never a conjunction/preposition
        like "But", "By", "Bye", "To", "Two", "For", "Four". When the first word is one of those
        and the sentence clearly means an action, correct it to the intended verb:
        "but Trevi" → "Buy Trevi"    "by cat food" → "Buy cat food"
        "bye milk" → "Buy milk"      "cal the vet" → "Call the vet"
        "pick of the kids" → "Pick up the kids"
        Correct ONLY the mis-heard function word — never change or drop the subject/object
        ("Trevi" stays "Trevi", even if it's an unfamiliar name).
      - NEVER DROP THE SUBJECT. Every person, place, business, provider, or thing the user named
        MUST stay in the title. Only the wrapper ("remind me to") and date/time words are removed.
        Generic titles like "Make an appointment", "Call them", "Schedule it", "Pick it up",
        "Send the email" are ALWAYS wrong when the user said who/where/what — without that the
        user won't know what the task is for when they see it later.
        "remind me to make an appointment for Skyler at the dentist next week" → "Make an appointment for Skyler at the dentist"
        "make an appointment with Dr. Patel tomorrow" → "Make an appointment with Dr. Patel"
        "call the vet about Max's meds" → "Call the vet about Max's meds"
        "schedule the oil change at Firestone" → "Schedule the oil change at Firestone"
      - If the user genuinely gave no subject ("make an appointment", nothing else), keep the title
        as-is — do not invent one.

      ═══════════════════════════════════════════════════════════════════════
      REMINDER INTERVAL RULES (CRITICAL — read carefully)
      ═══════════════════════════════════════════════════════════════════════
      reminder_interval must ONLY be set to a recurring value (10min/20min/30min/
      1hour/2hours/4hours/daily/every_other_day) when the user EXPLICITLY uses
      recurring language:
        - "every 10 minutes" → "10min"
        - "every 20 minutes" → "20min"
        - "every hour" / "hourly" → "1hour"
        - "every 2 hours" → "2hours"
        - "every 4 hours" → "4hours"
        - "every day" / "daily" / "everyday" → "daily"
        - "every other day" → "every_other_day"
      For ALL other tasks, set reminder_interval=null. The app's LLM smart-nudge
      system handles when to remind — it acts as a personal assistant, looking at
      the full task list and the week ahead to decide what to surface each day.
      NEVER auto-assign a recurring interval based on urgency, task type, or
      perceived importance. If the user wants frequent recurring reminders, they
      ask for them.

      "once" is ONLY for one-time precise reminders tied to a specific moment
      (see ONE-TIME below). If a task is not an explicit recurring request AND not
      a precise one-time moment, reminder_interval=null.
      ═══════════════════════════════════════════════════════════════════════

      TIMING RULES:

      "in X" vs "every X":
      - If user says "in 10 minutes" or "in 1 hour" → ONE-TIME PRECISE
        Set: reminder_interval="once", target_date=TODAY, target_time=CALCULATED_TIME
      - If user says "every 10 minutes" or "every hour" → EXPLICIT RECURRING
        Set: reminder_interval="10min" or "1hour", no target_date/target_time

      "tomorrow" with NO specific time (CRITICAL — commonly misclassified):
      - If it is a GENERAL ACTIONABLE TASK (research, "look into", "check on", sell, organize, clean, errands, projects, chores, posting, returning, fixing) → This is a DAY-ONLY task: reminder_interval=null, target_date=TOMORROW, target_time=null, needs_date_pick=false, day_only_task=true. The app sends ONE "heads up, this is due tomorrow" reminder TONIGHT, then the LLM smart-nudge system surfaces it TOMORROW. Do NOT assign a recurring interval.
      - If it is a genuine SCHEDULED EVENT or APPOINTMENT (dentist, doctor, therapist, concert, wedding, party, meeting, class, "make lunch", "pick up cake", travel) → reminder_interval="once", target_date=TOMORROW, target_time=null, needs_date_pick=true (the app asks the user to pick a time).
      - When in doubt, default to DAY-ONLY for tasks (day_only_task=true), or needs_date_pick for events.

      "tomorrow at X":
      - Set: reminder_interval="once", target_date=TOMORROW, target_time=<specified time>

      SPECIFIC DAY-OF-MONTH (CRITICAL — this is commonly missed):
      - "on the 28th", "the 28th" (a TASK tied to that day, no "by") → DAY-ONLY: reminder_interval=null, day_only_task=true
        → target_date = current month + that day number, format YYYY-MM-DD
        → If that day has already passed this month, use next month
        → target_time = null unless a time is also specified; if no time, needs_date_pick=false, day_only_task=true
        → Example: today is ${todayISO}, "pay zx4rr on the 28th" → target_date="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28", reminder_interval=null, target_time=null, needs_date_pick=false, day_only_task=true
      - "by the 28th", "by the 15th" (a DEADLINE) → DEADLINE (see RELATIVE DEADLINES), NOT day-only.
      - "on the 1st" → same DAY-ONLY logic as "on the 28th".
      - If it's an EVENT/appointment on that day (dentist, concert) → needs_date_pick=true, day_only_task=false.

      NAMED CALENDAR DATE — "on November 1st" (CRITICAL — NEVER DROP THE DATE):
      - Any explicit month + day the user names must ALWAYS become a real date. This covers every
        form: "November 1st", "Nov 1", "November 1", "on the 1st of November", "11/1", "Jan 3rd",
        "March 15th", "Dec 24".
        → target_date = "YYYY-MM-DD" for that month/day
        → YEAR: use the CURRENT year (${now.getFullYear()}) if that date is still in the future.
          If it has ALREADY PASSED this year, use NEXT year (${now.getFullYear() + 1}).
        → A TASK on that day (fill out forms, pay something, drop something off) → day_only_task=true,
          reminder_interval=null, target_time=null, needs_date_pick=false
        → An EVENT/appointment on that day (concert, dentist, wedding) → reminder_interval="once",
          needs_date_pick=true, day_only_task=false
        → Example: today is ${todayISO}. "remind me to fill out travel forms for the Dominican
          Republic on November 1st" → title="Fill out the Dominican Republic travel forms",
          target_date="${now.getFullYear()}-11-01", due_date="${now.getFullYear()}-11-01",
          day_only_task=true, reminder_interval=null, target_time=null, needs_date_pick=false,
          classification="task"
      - Dropping a date the user explicitly said is a HARD FAILURE. If the user named any day at all,
        target_date MUST NOT be null.

      DATED DAY-ONLY TASKS MUST ALSO SET due_date (CRITICAL):
      - Whenever day_only_task=true AND you set a target_date, set due_date to that SAME date.
        due_date is the field the app displays and uses to know when the task comes due; a day-only
        task with a target_date but no due_date shows up with no date on it at all, which looks
        broken to the user.
      - NEVER return day_only_task=true with both target_date=null AND due_date=null when the user
        named a specific day.

      "ON [specific day]" TASKS — DAY-ONLY RULE (CRITICAL):
      - If the user says "remind me to do X on Friday", "remind me to do X on the 20th",
        "remind me to do X next Monday" — a TASK (not event) tied to a specific future day with NO time:
        → reminder_interval=null
        → target_date = that day (YYYY-MM-DD)
        → due_date = that SAME day (so the task actually shows its date and comes due correctly)
        → target_time = null
        → needs_date_pick = false (do NOT ask for a time — the user wants day-of nudges)
        → day_only_task = true
        → deadline_style = "on"
        → classification = "task"
        → is_flexible = false
      - The app sends ONE "heads up, X is due tomorrow" reminder the night before, then the
        LLM smart-nudge system surfaces it on the day of (prioritized by urgency). NO reminders
        fire in the days leading up — the task isn't due until that day.
      - This does NOT apply to EVENTS/appointments (dentist, concert, party) → those use needs_date_pick.
      - This does NOT apply to "by Friday" deadlines → those are DEADLINES (due_date set, day_only_task=true).
      - This does NOT apply to "today" tasks → those use the TODAY rule (day_only_task=true, due_date=today).

      "ON [date]" vs "BY [date]" — deadline_style (CRITICAL, they are NOT the same):
      Both are day-only tasks with no clock time, but they get completely different reminders.
      - "ON that day" → deadline_style="on". The user is saying the thing HAPPENS that day and
        can't be done sooner ("mail the package on Friday", "pay the babysitter on the 1st",
        "water the neighbor's plants on Saturday"). Nothing fires in the days leading up —
        just a night-before heads-up and day-of nudges.
        Sounds like (examples only): "on", "this Friday", "the 28th", "November 1st" with no
        "by"/"before". Judge the MEANING — does the thing itself happen that day?
      - "BY that day" → deadline_style="by". The user gave a DEADLINE — the work can (and often
        should) start earlier ("get the taxes done by the 15th", "finish the report by Friday",
        "renew the registration before the end of the month"). Reminders start IN ADVANCE and
        build toward the due day.
        Sounds like (examples only): "by", "before", "no later than", "due", "deadline",
        "end of the week", "sometime this week", "at some point before". Judge the MEANING —
        is the date a limit the work has to fit inside?
      - When the user gives a window rather than a day ("this week", "next week", "sometime
        before the 15th") that is ALWAYS deadline_style="by".
      - If it's genuinely ambiguous, use "on" for a single named day and "by" for anything
        phrased as a limit or a window.
      - deadline_style only matters when day_only_task=true. For events and timed tasks, return "on".

      MULTI-DAY EVENTS / DATE RANGES (CRITICAL):
      - If the user describes a SPAN of days, set target_date to the FIRST day and
        end_date to the LAST day (inclusive, YYYY-MM-DD). The event shows on each day
        from target_date through end_date.
        Examples:
          "conference July 20 to 24" → target_date=first day, end_date=last day
          "vacation Aug 5 - Aug 10" → target_date=Aug 5, end_date=Aug 10
          "festival from the 12th to the 15th" → target_date=12th, end_date=15th
          "hotel Dec 3 through Dec 7" → target_date=Dec 3, end_date=Dec 7
        - Only set end_date when the user explicitly gave a RANGE (to/until/through/–/-).
        - If start and end are the SAME day, do NOT set end_date (single-day event).
        - end_date only applies to ONE-TIME events (reminder_interval="once").

      RELATIVE DEADLINES / DUE DATES (CRITICAL — commonly missed):
      If the user mentions a relative deadline or time boundary, you MUST set due_date to the
      calculated date. These are DEADLINES (the task must be done by then). The LLM smart-nudge
      system picks the task up WHEN IT IS ACTUALLY DUE (on the due date) — no recurring reminders
      fire in the days leading up. A single "heads up, due tomorrow" reminder fires the night
      before, then day-of LLM nudges.
      - "by Friday" / "by [day of week]" → due_date = NEXT [that day] (use the NEXT dates provided above)
      - "before the end of this week" / "end of the week" / "this week" / "by the end of the week"
        → due_date = END OF THIS WEEK (${endOfThisWeekISO})
      - "next week" / "by next week" / "end of next week"
        → due_date = END OF NEXT WEEK (${endOfNextWeekISO})
      - "by tomorrow" → due_date = TOMORROW (${tomorrowISO})
      - "by [month] [day]" or "by the [Nth]" → due_date = that date (YYYY-MM-DD)
      - "before [date]" / "by [date]" → due_date = that date (YYYY-MM-DD)
      When a due_date is set for a relative deadline:
      - reminder_interval=null (NOT a recurring interval — the LLM handles nudges on the due day).
      - day_only_task=true (so the night-before heads-up + day-of LLM nudges apply).
      - Do NOT set needs_date_pick — the deadline was already specified by the user.
      - Do NOT set target_date/target_time — due_date is the deadline field.
      - deadline_style="by" (these are DEADLINES — reminders start in advance, not just day-of).
      - Set is_flexible=false (a deadline was mentioned).
      - urgency: "high" if the deadline is soon (within 2-3 days), otherwise "medium".

      Other rules:
      - "at 2pm" → ONE-TIME PRECISE, reminder_interval="once", target_time="14:00"
      - "daily"/"every day"/"everyday" → EXPLICIT RECURRING, reminder_interval="daily"
      - "every other day" → EXPLICIT RECURRING, reminder_interval="every_other_day"

      ═══════════════════════════════════════════════════════════════════════
      TODAY OVERRIDE (CRITICAL — commonly missed)
      ═══════════════════════════════════════════════════════════════════════
      If the user says "today" or "tonight" (e.g., "I need to clean the dishes and the floor today",
      "do the dishes tonight", "do laundry today", "pay rent today"), the task needs to get done TODAY.
      - reminder_interval=null (NOT a recurring interval — the LLM handles day-of nudges).
      - day_only_task=true (so the LLM smart-nudge system picks it up today, prioritized by urgency).
      - due_date = today's date (${todayISO}) so that if it isn't finished by end of today, it
        becomes an OVERDUE task the next day.
      - This applies to CHORES too: "clean the dishes today", "clean the floor today" → day_only_task=true, reminder_interval=null.
      - URGENCY: "today" is a WINDOW, not automatically an emergency. Judge urgency by what actually
        HAPPENS IF IT DOESN'T GET DONE TODAY — the real-world consequence, not the fact that a date
        was attached. Ask: does something spoil, stink, break, cost money, get missed, or does a
        person go without?
        * "urgent" → a real deadline or someone/something depends on it today: medication, a payment
          due today, picking someone up, a form that closes today, food left out that will spoil.
        * "high" → genuine same-day consequences that pile up or get worse: make dinner (nobody eats),
          take out the trash (it stinks), do the dishes (they get crusty/gross), put the groceries
          away, move the wet laundry, feed the pets, water the plants.
        * "medium" → should happen today but nothing bad happens if it slides: tidy the desk, reply
          to a non-urgent message, vacuum, return an email.
        * "low" → an errand or nice-to-have the user just hoped to get to today: "buy Skittles",
          "look up that show", "grab a coffee", "check the mail".
        Do NOT inflate a low-stakes task to high just because the user said "today" — a day full of
        fake-urgent tasks makes the real ones invisible.
      - "tonight" leans one step higher than the same task would be earlier in the day, since the
        window is closing — but a genuinely low-stakes task ("buy Skittles tonight") still stays low.
      - "tonight" specifically: same as today (due_date=today, day_only_task=true), and the current
        time is ${currentTime} — if it's already evening, this is the LAST window of the day.
      - "daily" is ONLY for ongoing habits/routines where the user EXPLICITLY said "daily"/"every day".
      - Example: "clean the dishes today" → reminder_interval=null, day_only_task=true, due_date="${todayISO}", urgency="high", needs_date_pick=false
      - Example: "make dinner tonight" → day_only_task=true, due_date="${todayISO}", urgency="high" (nobody eats otherwise)
      - Example: "take the trash out today" → day_only_task=true, due_date="${todayISO}", urgency="high" (it stinks otherwise)
      - Example: "buy Skittles today" → day_only_task=true, due_date="${todayISO}", urgency="low" (nothing happens if it waits)
      - Example: "vacuum today" → day_only_task=true, due_date="${todayISO}", urgency="medium"
      - Example: "do laundry today" → reminder_interval=null, day_only_task=true, due_date="${todayISO}", urgency="medium"
      - Do NOT set due_date for one-time events (those use target_date/target_time instead).

      ONE-TIME PRECISE (single notification at a specific moment) — ONLY for these cases:
      - User explicitly mentions a specific clock time: "at 3pm", "tomorrow morning", "in 2 hours", "at 2pm tomorrow"
      - Genuine scheduled events/appointments tied to a specific moment: "dentist tomorrow", "concert on the 28th", "make lunch tomorrow", "reminder for my dentist at 2pm"
      - NEVER use "once" for a general actionable task just because the user said "tomorrow" with no time — those are DAY-ONLY (reminder_interval=null, day_only_task=true).
      - Use: reminder_interval="once", target_date=YYYY-MM-DD, target_time=HH:MM
      - Examples:
        "remind me to make lunch tomorrow" → once, target_date=TOMORROW, target_time=null, needs_date_pick=true
        "pick up cookies" → once, target_date=TODAY, target_time=null, needs_date_pick=true
        "remind me at 5pm to call John" → once, target_date=TODAY, target_time="17:00"
        "find the pasta" → once, target_date=TODAY, target_time=null, needs_date_pick=true

      EXPLICIT RECURRING (keep reminding at a fixed interval until done):
      - ONLY when the user EXPLICITLY says "every X", "daily", "every day", "every other day", "hourly".
      - Use the matching reminder_interval (10min/20min/30min/1hour/2hours/4hours/daily/every_other_day).
      - No target_date/target_time (unless the user also gave a start time).
      - Examples:
        "remind me every 10 minutes to check the oven" → reminder_interval="10min"
        "remind me daily to take my vitamins" → reminder_interval="daily"
        "remind me every other day to water the plants" → reminder_interval="every_other_day"
      - If the user did NOT use explicit recurring language, reminder_interval=null (LLM handles it).

      NEVER set target_time to the current moment unless user said "now" or "right now".
      CRITICAL: NEVER infer, guess, or hallucinate a target_time. Only set target_time when the user EXPLICITLY states a time (e.g., "at 5pm", "at 3:30", "by noon"). If the user did not mention a specific time, set target_time=null. Do not use domain knowledge to guess times (e.g., don't assume daycare pickup is 5pm, don't assume work starts at 9am).

      SMART PRIORITY SUGGESTIONS (always infer urgency, even when reminder_interval=null):
      - Time-sensitive or deadline-based → "urgent" or "high"
      - Important but flexible → "high" or "medium"
      - Routine maintenance → "medium"
      - Nice-to-have → "low"
      The LLM smart-nudge system uses urgency to decide WHEN to surface a task and HOW
      often, so always set a meaningful urgency. A high-urgency task due today takes
      precedence; a high-urgency task with no due date is still surfaced, just not ahead
      of one due today.

      SMART INFERENCE (when user does NOT specify a time, frequency, or date):
      Infer urgency and energy from the NATURE of the task. Do NOT infer a recurring
      reminder_interval — set reminder_interval=null for all of these; the LLM handles
      nudges. Only set reminder_interval when the user explicitly asked for recurring.

      PERISHABLE / TIME-SENSITIVE (degrades or has consequences if delayed):
      - Food/perishables: "move food to freezer", "put leftovers in fridge", "defrost chicken"
      - Laundry: "move laundry to dryer", "take clothes out of washer"
      - Medication: "take meds", "take medicine", "take antibiotics"
      - Cooking: "check on the oven", "stir the pot", "flip the food"
      - Pets/plants: "feed the cat", "water the plants"
      - → reminder_interval=null, urgency="high", needs_date_pick=false, day_only_task=false
      - If the user wants frequent reminders for these, they will say "every X minutes".
        Otherwise the LLM surfaces them with appropriate urgency.

      HARD DEADLINE / IMPORTANT OBLIGATION (serious consequences if missed):
      - Financial: "pay rent", "pay electric bill", "transfer money", "pay credit card"
      - Legal/admin: "submit form", "file taxes", "renew license", "submit application"
      - Work: "submit report", "send email to boss", "turn in project"
      - Appointments: "call doctor", "confirm appointment", "reschedule meeting"
      - If the user gave a deadline ("by Friday") → due_date set, day_only_task=true, reminder_interval=null (see RELATIVE DEADLINES).
      - If NO deadline given → reminder_interval=null, urgency="high", no due_date (LLM handles).

      ROUTINE / HABIT (recurring wellness or maintenance):
      - Wellness: "stretch", "take vitamins", "drink water", "meditate", "do pushups"
      - Chores: "make bed", "water plants", "tidy desk"
      - If the user EXPLICITLY said "daily"/"every day" → reminder_interval="daily".
      - Otherwise → reminder_interval=null, urgency="low" or "medium" (LLM handles).
      - CRITICAL: Only use "daily" when the user EXPLICITLY said "daily"/"every day". If the user
        said "today" (e.g., "clean the dishes today"), use the TODAY OVERRIDE (day_only_task=true, reminder_interval=null).

      GENERAL ACTIONABLE TASKS (not perishable, not a hard deadline, not a routine/habit):
      Tasks that need to get done but have no specific deadline or schedule.
      Examples: "post the Subaru parts on Marketplace", "sell the old laptop", "fix the leaky faucet",
      "organize the garage", "research vacuum cleaners", "list items on eBay", "clean the car",
      "Amazon returns", "drop off donation"
      - reminder_interval=null (the LLM smart-nudge system handles these — do NOT auto-assign an interval).
      - Do NOT ask for a date (needs_date_pick=false) unless it's a scheduled event.
      - ALWAYS infer urgency based on the task's nature:
        * Real consequences if delayed (deadline today, someone waiting, time-sensitive) → urgency="high"
        * Important but flexible — no deadline pressure (selling items, errands, projects, organizing) → urgency="medium"
        * Low-stakes, nice-to-have, no rush → urgency="low"
        * When in doubt, default to medium.
      - Set priority_uninferrable=false, is_flexible=true (task can be done any day)

      PRIORITY UNINFERRABLE (ABSOLUTE LAST RESORT — almost never use):
      Only set priority_uninferrable=true if the task is SO VAGUE that you genuinely cannot
      determine any reasonable urgency level. This should be extremely rare — almost every task
      has enough context to infer at least a medium priority. When in doubt, default to
      urgency="medium", reminder_interval=null rather than asking the user.

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
      - General actionable tasks (selling, posting, errands, chores, projects) → reminder_interval=null, LLM handles
      - PERISHABLE/TIME-SENSITIVE tasks → reminder_interval=null, LLM handles
      - HARD DEADLINE tasks → due_date set (if deadline given) or reminder_interval=null (LLM handles)
      - Routine/habit tasks → reminder_interval="daily" ONLY if explicit, otherwise null (LLM handles)

      If needs_date_pick=true:
      - Still provide reminder_interval="once" as a fallback (used if user picks "any day")
      - Do NOT set target_date or target_time — let the user pick

      CLASSIFICATION (Event vs Task — CRITICAL):
      Determine whether this is a TASK, EVENT, or BIRTHDAY:
      - EVENT: A happening that has its OWN start time set by someone else — it begins at that time
        whether or not the user shows up, and arriving late means missing it.
        Examples: concerts, car shows, expos, weddings, parties, meetings, booked appointments,
        classes, sports games, festivals, conferences, flights/travel, social gatherings, shows,
        "go to the Import Expo car show", "attend the wedding on Saturday", "see the concert"
        → classification="event"
      - THE PHRASE "go to" DOES NOT MAKE SOMETHING AN EVENT. Going somewhere to get something DONE
        is an ERRAND, which is a TASK. The place having a name changes nothing.
        Errands (→ classification="task"): "go to Jared for ring maintenance", "go to the bank",
        "go to Target", "go to the post office", "take the car to the shop", "drop off the dry cleaning",
        "go get an oil change", "swing by the pharmacy".
        Test: does this thing START at a set time without the user (event), or does it happen WHENEVER
        the user goes and take as long as it takes (errand → task)?
      - A SOFT OR RELATIVE DEADLINE IS NEVER AN EVENT. If the user said "this week", "by Friday",
        "sometime", "when I get a chance", "next week" — they gave a window to fit something into, not
        an appointment. That is ALWAYS classification="task" with due_date set + day_only_task=true +
        reminder_interval=null, so the smart-nudge system decides when to surface it.
        Example: "remind me to go to Jared for ring maintenance this week"
          → classification="task", due_date="${endOfThisWeekISO}", day_only_task=true,
            reminder_interval=null, target_time=null, needs_date_pick=false
        Getting this wrong is a real failure: it turns a flexible errand into a fake appointment with
        rigid "night before" and "1 hour before" alarms for a time the user never chose.
      - TASK: An actionable to-do that needs doing — paying bills, submitting reports, chores,
        errands, selling items, cleaning, organizing, calling, researching, buying, cooking,
        fixing, posting, returning. Something you DO and complete, not something you attend.
        → classification="task"
      - PAYMENT: Any bill or financial obligation — paying money to someone/something.
        Examples: "pay rent", "pay the electric bill", "pay credit card", "pay the water bill",
        "transfer money to savings", "pay zx4rr", "renew car insurance payment", "pay daycare",
        "send Venmo to Jake", "pay off the loan".
        STRONG PAYMENT SIGNALS in the title: the words "pay"/"payment"/"bill"/"rent"/"due",
        a "$" amount, or the name of a financial institution or payment app (Chase, Wells Fargo,
        Discover, Amex, Capital One, Citi, Venmo, Zelle, PayPal, Cash App, Klarna, Affirm, etc.).
        A bare institution name like "Discover" or "$450" as a calendar entry is a payment.
        → classification="payment"
        All OTHER rules still apply exactly as if it were a task: deadlines set due_date +
        day_only_task=true, "today" uses the TODAY OVERRIDE, no deadline → reminder_interval=null.
        Payment is a TAG on top of task behavior, not a different scheduling model.
      - BIRTHDAY: Only when explicitly about someone's birthday.
        → classification="birthday"
      When in doubt between event and task, ask: "Is the user going somewhere / attending
      something at a scheduled time?" → event. "Is the user doing a thing that needs doing?" → task.

      LEAVING THE HOUSE (drives the energy field — CRITICAL):
      energy_required is about EFFORT, and getting in the car and going somewhere is
      real effort. Set energy_required="high" whenever the task means leaving the house:
      - It names a business, store, or place: "RideNow", "Jared", "the DMV", "Kroger", "the bank".
      - A BARE NAME WITH NO VERB IS ALMOST ALWAYS A PLACE YOU GO. If the whole title is
        just a name ("RideNow", "Jared", "Costco"), treat it as an out-of-the-house errand
        → classification="task", energy_required="high". Do NOT treat it as a low-effort note.
      - It names a person you'd go see or meet in person ("Jared", "Jennifer's office").
      - It uses a going-somewhere verb: drop off, pick up, return, deliver, mail, sign,
        test drive, stop by, go see, go to, appointment, in-person meeting.
      At-home tasks (dishes, laundry, emails, phone calls, online orders) stay
      energy_required="low" or "medium". This matters: the app groups high-energy
      out-of-the-house errands into a single trip, so mislabeling one costs the user a drive.

      Extract:
      1. Clean title (strip "remind me to/I need to/in X minutes" — keep inner action)
      2. Urgency: ALWAYS suggest (low/medium/high/urgent)
      3. Energy: ALWAYS suggest (low/medium/high)
      4. target_date: for "in X" (TODAY), "tomorrow", or specific dates — format YYYY-MM-DD
      5. target_time: for "in X" (calculate), "at X" (specific), or null if no time mentioned
      6. reminder_interval: null UNLESS the user explicitly asked for recurring ("every X"/"daily"/"every other day"), or "once" for a precise one-time moment. NEVER auto-infer a recurring interval.
      7. classification: "task" | "event" | "birthday" | "payment"

      JSON:
      {
      "title": "clean title",
      "location": "address, business name, or place — or null. Set this when the user EXPLICITLY named a place, and ALSO when scanning messy/pasted/shared text that contains an address or venue anywhere in it (see MESSY TEXT rules). Copy it as written. NEVER invent or infer a place that isn't in the text.",
      "urgency": "medium",
      "energy_required": "medium",
      "classification": "task",
      "target_date": "YYYY-MM-DD or null",
      "target_time": "HH:MM or null",
      "end_date": "YYYY-MM-DD or null (LAST day of a multi-day event span; only when the user gave a date range; null for single-day)",
      "reminder_interval": "10min|20min|30min|1hour|2hours|4hours|daily|every_other_day|once|null",
      "due_date": "YYYY-MM-DD or null — ALSO set this to target_date whenever day_only_task=true and the user named a specific day (e.g. 'on November 1st', 'on Friday', 'on the 28th'). Set when the user mentions a DEADLINE (e.g., 'by Friday', 'end of the week', 'by tomorrow', 'by the 15th', 'today' tasks). For 'today' tasks, set due_date=today. For relative deadline phrases, use the calculated date from the RELATIVE DEADLINES rules above.",
      "priority_uninferrable": false,
      "is_flexible": false,
      "needs_date_pick": false,
      "day_only_task": false,
      "recurrence_pattern": "none|daily|weekly|every_other_week|monthly|yearly — 'none' unless the user described a REPEATING date ('every month on the 1st', 'the first Thursday of every month', 'every Wednesday', 'every year on June 3rd'). Always also set target_date/due_date to the NEXT occurrence.",
      "deadline_style": "on|by — 'on' when the task happens ON that specific day, 'by' when the date is a deadline the task must be finished by (work can start earlier). See the ON vs BY rules above. Default 'on'."
      }`;
}