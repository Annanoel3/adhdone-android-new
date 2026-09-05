// Shared "smart add" prompt used by BOTH the AddTask page and the Google
// Calendar sync, so manually-added and imported items go through the EXACT
// same AI decision process.
//
// DESIGN NOTE (read before adding anything here):
// This prompt is deliberately SHORT. An earlier version was ~600 lines of
// keyword lists ("go to" means X, these words mean event, these words mean
// deadline...). That made the model WORSE, not better: it stopped reading the
// input like a person and started pattern-matching phrases, which is how a
// shared text thread about attending a festival on Saturday came out as an
// hourly-reminder "task" with a "[Name]" placeholder in the title.
// A capable model already understands what a human means. Our job is to give
// it (a) the facts it cannot compute — today's real calendar — and (b) the
// exact meaning of each output field. Nothing else. DO NOT add keyword lists.

export const TASK_PARSE_SYSTEM_PROMPT =
  "You read what a person wrote and turn it into one structured task, the way a thoughtful human assistant would. " +
  "Understand the meaning first — what is happening, when, where, and with whom — then fill in the fields. " +
  "You are not matching keywords; there is no list of magic words. Judge intent. " +
  "Two hard rules: never invent a clock time and never invent a place (both come only from the user's own words), " +
  "and never lose a day, time, place, or person the user did state. " +
  "Never put a placeholder in any field. If you don't know someone's name, leave the name out of the title entirely — " +
  "text like '[Name]', 'TBD' or 'someone' must never appear. " +
  "Respond with valid JSON only, populating every field in the requested schema.";

// The server runs in UTC, but "today" has to be the USER's today. At 9pm
// Friday in Central America it's already Saturday in UTC — so without this,
// "this Saturday" resolved to a week out. Returns a Date whose local getters
// (getDay/getDate/getHours) read the wall-clock in the given zone.
export function nowInTimezone(tz?: string): Date {
  if (!tz) return new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

export function buildTaskParsePrompt(inputText: string, tz?: string): string {
  const now = nowInTimezone(tz);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const todayISO = fmt(now);
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = fmt(tomorrow);
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  // End of this week (Sunday) / next week
  const endOfThisWeek = new Date(now);
  endOfThisWeek.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
  const endOfThisWeekISO = fmt(endOfThisWeek);
  const endOfNextWeek = new Date(endOfThisWeek);
  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);
  const endOfNextWeekISO = fmt(endOfNextWeek);

  // ── Precomputed calendar ────────────────────────────────────────────────
  // The ONE thing a language model genuinely cannot do reliably is calendar
  // arithmetic. Everything it might need is computed here and handed over.
  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayTable = WEEKDAY_NAMES.map((name, i) => {
    const thisOne = new Date(now);
    let diff = i - now.getDay();
    if (diff <= 0) diff += 7;
    thisOne.setDate(now.getDate() + diff);
    const nextOne = new Date(thisOne);
    nextOne.setDate(thisOne.getDate() + 7);
    return `        this ${name}: ${fmt(thisOne)}   |   next ${name}: ${fmt(nextOne)}`;
  }).join('\n');

  function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): string {
    if (n === -1) {
      const d = new Date(year, monthIndex + 1, 0);
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
    const row = (y: number, m: number) => [1, 2, 3, 4, -1].map((n) => {
      const label = n === -1 ? 'last' : `${n}${['st', 'nd', 'rd', 'th'][n - 1] || 'th'}`;
      return `${label}=${nthWeekdayOfMonth(y, m, i, n)}`;
    }).join(', ');
    return `        ${name} — this month: ${row(thisMonthYear, thisMonthIndex)}\n        ${name} — next month: ${row(nextMonthYear, nextMonthIndex)}`;
  }).join('\n');

  const thisMonthPrefix = `${thisMonthYear}-${String(thisMonthIndex + 1).padStart(2, '0')}`;
  const nextMonthPrefix = `${nextMonthYear}-${String(nextMonthIndex + 1).padStart(2, '0')}`;

  return `Read this and turn it into one task:

"""
${inputText}
"""

────────────────────────────────────────────────────────────────────────
HOW TO THINK ABOUT IT
────────────────────────────────────────────────────────────────────────
Read it the way a person would and work out what's actually going on. The
input might be one clean sentence, a rambling voice transcription, or a whole
text thread / email / event page the user pasted or shared into the app.

If it's messy, that's normal — reason through it:
  • A conversation has two speakers, and questions between them ("are you
    still down to go?", "where are we meeting again?") are chatter, not the
    task. Work out the PLAN being discussed and describe it yourself.
  • The facts are scattered. The day might be in the first message and the
    address four messages later. Pull them from wherever they are.
  • Ignore the junk that came along for the ride — carrier/battery/clock
    readouts, app buttons, timestamps, signatures, ads, URLs.
  • Never echo the raw input back as the title, and never quote a message as
    the title. Write a short, natural title for the plan, like a person would
    put on their calendar.
  • Only name a person in the title if their real name is actually in the text.
    No placeholders, ever.

Then be honest about what you do and don't know:
  • If the user named a day in any wording at all, it HAS a date — resolve it
    from the calendar below. Dropping a stated date is the worst failure here.
  • If the user did NOT give a clock time, target_time is null. Never guess one.
  • If the user did NOT name a place, location is null. Never guess one. But an
    address sitting on its own line in pasted text IS a stated place — a human
    reading that thread would obviously catch it, and so should you.
  • Reminder frequency is not yours to invent. See reminder_interval below.

────────────────────────────────────────────────────────────────────────
THE CALENDAR (use these dates — never do the math yourself)
────────────────────────────────────────────────────────────────────────
TODAY: ${todayISO} (${dayOfWeek})   CURRENT TIME: ${currentTime}
TOMORROW: ${tomorrowISO}
END OF THIS WEEK (Sun): ${endOfThisWeekISO}   END OF NEXT WEEK (Sun): ${endOfNextWeekISO}

Day names — "this X" is the next one coming up, "next X" is a week later; a
bare day name ("on Friday", "Saturday") means the "this X" value:
${weekdayTable}

Nth weekday of a month ("first Monday of next month", "last Friday"):
${ordinalWeekdayTable}

Day numbers ("the 28th"): this month → ${thisMonthPrefix}-DD
(${monthName(thisMonthYear, thisMonthIndex)}), next month → ${nextMonthPrefix}-DD
(${monthName(nextMonthYear, nextMonthIndex)}). Today is day ${now.getDate()}, so a day
number that already passed means next month. Zero-pad (the 5th → -05).

Month + day ("March 15", "Dec 24", "11/1"): use ${now.getFullYear()} if still
upcoming, otherwise ${now.getFullYear() + 1}. Numeric dates are US order (MM/DD).

────────────────────────────────────────────────────────────────────────
WHAT THE FIELDS MEAN
────────────────────────────────────────────────────────────────────────
title — the short action or plan, capitalized. Keep every person, business,
  place and thing the user named; strip the "remind me to" wrapper and the
  date/time words. Never a single word ("Go"), never a placeholder, never a
  whole pasted message.

location — a real address, business, or place taken verbatim from the text.
  Otherwise null.

classification — what KIND of thing this is:
  "event"   something that happens at a set time whether or not the user shows
            up, and that they attend — a festival, concert, wedding, party,
            appointment, meeting, class, flight, meeting up with someone.
  "task"    something the user DOES and finishes, on their own schedule —
            chores, errands, calls, paperwork, selling, fixing, buying. Going
            somewhere to get something done is an errand, i.e. a task.
  "payment" a task that is specifically paying money — a bill, rent, a card, a
            transfer, a "$" amount, a bank/payment-app name. Behaves exactly
            like a task; this is just a tag.
  "birthday" only when it's genuinely about someone's birthday.

target_date / target_time — WHEN the thing happens (YYYY-MM-DD / 24h "HH:MM").
  target_date must ALWAYS be a real calendar date copied from the table above —
  "2026-09-05", never a day word like "Saturday" or "tomorrow". Repeating the
  user's wording here is a broken answer; look the day up and write the date.
  Time only if the user actually said one.

end_date — for a stated multi-day range, the LAST day. Otherwise null.

due_date — when the thing must be DONE by. Set it for deadlines ("by Friday",
  "this week", "today"), and also mirror target_date into it whenever
  day_only_task is true, so the task actually shows a date in the app.

day_only_task — true when this is tied to a specific day but has NO clock time.
  The app then sends one heads-up the night before and lets its smart-nudge
  system surface it that day.

deadline_style — "on" if the thing happens ON that day and can't be done
  sooner; "by" if the date is a limit the work has to fit inside (so reminders
  can start earlier). Only matters when day_only_task is true.

needs_date_pick — almost always false. A day with no clock time is an ALL-DAY
  thing and needs nothing from the user, so never set this just because a time
  is missing: set day_only_task instead. Only true when the user gave NO day at
  all and the thing genuinely can't exist without one (an appointment they said
  they need to schedule). Never true when target_date is filled in.

user_asked_to_repeat_every — answer ONLY this narrow question: did the user
  ask to be pinged OVER AND OVER at a fixed rhythm until they've done it?
  ("remind me every 20 minutes", "nag me hourly", "remind me daily", "every
  other day"). If yes, give that rhythm: 10min / 20min / 30min / 1hour /
  2hours / 4hours / daily / every_other_day. If they didn't ask for repeated
  pings — which is the overwhelming majority of the time — this is null.
  Do NOT use this field to say WHEN to remind them or how far ahead. That is
  not what it means, and the app works that part out on its own from the date,
  the time and how the task looks; it has an LLM that reads the whole week and
  decides what to surface. Something being important, urgent, or soon NEVER
  earns a rhythm here. A wrong value here means the user gets pinged every
  hour forever, which is the most damaging mistake you can make.

recurrence_pattern — "none" unless the thing itself repeats on the calendar
  ("every Wednesday", "the 1st of every month", "every year on June 3rd"); then
  use weekly/every_other_week/monthly/yearly/daily AND set target_date to the
  next occurrence so the first one isn't lost.

urgency — judge the real consequence of it not happening: what breaks, spoils,
  costs money, or leaves someone waiting. "urgent" for real same-day stakes,
  down to "low" for nice-to-haves. A date attached does not make something
  urgent; inflating everything makes the real ones invisible.

energy_required — effort. Anything that means leaving the house is "high"
  (the app batches those into one trip). At-home and online things are low or
  medium.

is_flexible — true when the task can be done any day. priority_uninferrable —
  true only if the input is so vague that no urgency can be guessed at all;
  this should be almost never, so default urgency "medium" instead.

────────────────────────────────────────────────────────────────────────
Return JSON with exactly these keys:
{
  "title": string,
  "location": string | null,
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high",
  "classification": "task" | "event" | "birthday" | "payment",
  "target_date": "YYYY-MM-DD" | null,
  "target_time": "HH:MM" | null,
  "end_date": "YYYY-MM-DD" | null,
  "due_date": "YYYY-MM-DD" | null,
  "user_asked_to_repeat_every": "10min" | "20min" | "30min" | "1hour" | "2hours" | "4hours" | "daily" | "every_other_day" | null,
  "recurrence_pattern": "none" | "daily" | "weekly" | "every_other_week" | "monthly" | "yearly",
  "deadline_style": "on" | "by",
  "day_only_task": boolean,
  "needs_date_pick": boolean,
  "is_flexible": boolean,
  "priority_uninferrable": boolean
}`;
}