import OpenAI from "npm:openai";
import { TASK_PARSE_SYSTEM_PROMPT, buildTaskParsePrompt, nowInTimezone } from "./taskParsePrompt.ts";
import { fixParsedTaskTitles } from "./fixMisheardVerbs.ts";
import { resolveParsedDates } from "./resolveDateWords.ts";

// Single place where task parsing actually runs, shared by parseTask and
// parseTask — the single parser every add method (typed, voice, quick add,
// shared text, calendar sync) goes through.
//
// Model choice matters here as much as the prompt: reading a pasted text
// thread and working out "this is an event, on Saturday, at this address,
// with this person" is real reasoning, not extraction. A cheap/older model
// pattern-matches and drops facts, which is exactly the class of bug this
// parser kept producing.
//
// Runs on OpenAI with the app's own key (RULES.md rule 1). It briefly ran on
// Base44's InvokeLLM, which draws on Base44 integration credits — and when
// those run out every call fails, taking task entry down for everyone at once.
// gpt-6-astra since Oct 17 2026; it had been gpt-5.4 since Sept 18 2026, the
// day after Anna asked for the newest model everywhere ("Move them to astra
// like I already asked weeks ago").
const MODEL = "gpt-6-astra";

// A recurring reminder rhythm can ONLY come from the user asking to be pinged
// repeatedly. The model is asked that one narrow question
// ("user_asked_to_repeat_every") instead of being handed the app's
// reminder_interval field — because "reminder interval" reads like "when should
// I remind them", so the model kept answering with lead times like "1 hour
// before", which the app then executed as an hourly nag forever. Whether a task
// is a one-shot "once" reminder is decided in code from the date and time, not
// by the model.
const REPEAT_VALUES = [
  '10min', '20min', '30min', '1hour', '2hours', '4hours',
  'daily', 'every_other_day',
];

// The answer is constrained to this shape by OpenAI (strict structured output),
// so every key is always present and every enum value is one the app knows.
const TASK_PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    location: { type: ["string", "null"] },
    business_name: { type: ["string", "null"] },
    urgency: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    energy_required: { type: "string", enum: ["low", "medium", "high"] },
    classification: { type: "string", enum: ["task", "event", "birthday", "payment"] },
    target_date: { type: ["string", "null"] },
    target_time: { type: ["string", "null"] },
    time_stated: { type: "boolean" },
    end_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    user_asked_to_repeat_every: { anyOf: [{ type: "string", enum: REPEAT_VALUES }, { type: "null" }] },
    repeat_words: { type: ["string", "null"] },
    recurrence_pattern: { type: "string" },
    deadline_style: { type: "string", enum: ["on", "by"] },
    day_only_task: { type: "boolean" },
    needs_date_pick: { type: "boolean" },
    is_flexible: { type: "boolean" },
    priority_uninferrable: { type: "boolean" },
    takes_time: { type: "boolean" },
    life_area: { type: "string", enum: ["work", "personal"] },
    follow_up_title: { type: ["string", "null"] },
    follow_up_minutes: { type: ["integer", "null"] },
    reminder_wish: { type: ["string", "null"] },
    recurrence_days: { type: ["array", "null"], items: { type: "integer" } },
  },
  required: [
    "title", "location", "business_name", "urgency", "energy_required", "classification",
    "target_date", "target_time", "time_stated", "end_date", "due_date",
    "user_asked_to_repeat_every", "repeat_words", "recurrence_pattern", "deadline_style",
    "day_only_task", "needs_date_pick", "is_flexible", "priority_uninferrable",
    "takes_time", "life_area", "follow_up_title", "follow_up_minutes", "reminder_wish",
    "recurrence_days",
  ],
};

// The quiet-hours line for the system prompt ("" when they're off or unknown).
function quietHoursNote(quiet?: { enabled: boolean; startMin: number; endMin: number }): string {
  if (!quiet || !quiet.enabled || quiet.startMin === quiet.endMin) return '';
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `\n\nTHEIR QUIET HOURS: ${hhmm(quiet.startMin)} to ${hhmm(quiet.endMin)} (the app stays silent then). `
    + 'When you pick the clock time yourself from a part of the day ("before bed", "tonight", "first thing in the morning"), '
    + 'pick one outside these hours: "before bed" is shortly before they start, "first thing in the morning" shortly after they end. '
    + 'Something to do "tonight" or on a named night ("trash night", "Wednesday night") is the evening, with time left to do it '
    + 'before they wind down — around two hours before quiet hours start, not the last minutes before them. '
    + 'If nothing outside them is left on the day they meant, pick what a reasonable person would mean anyway. '
    + 'A clock time the user stated stays exactly as they said it, even inside these hours.';
}

// `_base44` is kept so every caller's signature stays the same; the parser no
// longer needs the client. `aboutMe` is the user's own one-liner about their
// life from onboarding — it's what lets the model tell a work task from a
// personal one for THIS person rather than for a generic office worker.
// `asOfMs`: when the words were said (see nowInTimezone) — every date word
// is read against that moment, both in the prompt's calendar and in the
// resolver below.
// `quiet`: the user's quiet hours (resolveQuietHours). A clock time the model
// picks itself from "before bed" or "first thing in the morning" goes outside
// them, so the only time that can land inside them is one the user stated
// (RULES.md §9 Q4, Anna Oct 12 2026: "the only way that would ever happen is
// if a user explicitly says a time outside of their hours").
// Whether the person's words name a part of the day (see runTaskParse). Only
// their own words count: the block between the first pair of """ marks in
// the prompt (buildTaskParsePrompt); the instructions after it use the same
// phrases as examples.
// Only decides whether to take a second look; the model judges what the
// words mean. A bare "morning" or "night" ("tomorrow morning", "Wednesday and
// Sunday night") is caught too: gpt-6-astra left both of those untimed on the
// self-test (Oct 17 2026), which only "this morning" / "tonight" used to catch.
function namesPartOfDay(prompt: string): boolean {
  const text = String(prompt || '').split('"""')[1] || '';
  return /\b(tonight|morning|afternoon|evening|night|before bed|bedtime|after work|after dinner|after lunch|first thing|when i get up|when i wake up)\b/i.test(text);
}

export async function runTaskParse(_base44: any, prompt: string, tz?: string, aboutMe?: string, asOfMs?: number,
  quiet?: { enabled: boolean; startMin: number; endMin: number }) {
  // Callers are supposed to pass a prompt already built by
  // buildTaskParsePrompt, which carries the one thing the model cannot work out
  // for itself: today's real calendar. If raw text arrives instead, build it
  // here rather than asking the model to do date math it will get wrong —
  // without the calendar it answers "Saturday" (or nothing) instead of a date.
  const fullPrompt = prompt?.includes('THE CALENDAR')
    ? prompt
    : buildTaskParsePrompt(prompt || '', tz, asOfMs);

  // The calendar's "today" goes in the system message as well. gpt-6-astra is
  // handed the real date by OpenAI; with the said-at day only in the user
  // message it still counted "tomorrow" from the real date on 2 of 25 self-test
  // sentences (Oct 17 2026), which is Tabitha's bug for any capture that
  // finishes late. Read from the prompt itself, so the two can't disagree.
  const saidDay = /TODAY: (\d{4}-\d{2}-\d{2}) \((\w+)\)\s+CURRENT TIME: ([^\n]+)/.exec(fullPrompt);
  const saidNote = saidDay
    ? `\n\nTHE WORDS WERE SAID ON ${saidDay[2]} ${saidDay[1]} AT ${saidDay[3].trim()}. For this task that is today and now: count "today", "tomorrow", "tonight" and every day name from it, even if you were told a different date anywhere else.`
    : '';

  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const ask = async (nudge = '') => {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // A little thinking is what makes the model actually apply the prompt's
      // rules (mirror the date into due_date, "night" is a clock time, an errand
      // means leaving the house) instead of skimming them. Tested against the
      // previous parser on the same inputs before this was chosen.
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: TASK_PARSE_SYSTEM_PROMPT
            + saidNote
            + (aboutMe?.trim() ? `\n\nABOUT THE USER (in their own words): ${aboutMe.trim()}` : '')
            + quietHoursNote(quiet)
            + nudge,
        },
        { role: "user", content: fullPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "task_parse", strict: true, schema: TASK_PARSE_SCHEMA },
      },
    });
    return JSON.parse(completion.choices[0]?.message?.content || "{}");
  };

  let parsed = await ask();
  // The prompt already says a part of the day ("tonight", "after work") is a
  // time to pick, and the model mostly does; about half the time, on the
  // self-test (Oct 13 2026), it came back with no time at all, which turns
  // "take out the trash tonight" into an all-day task that nothing rings for.
  // One more ask when the words name a part of the day and no time came
  // back. Only a retry trigger: the model still picks the time.
  if (!parsed?.target_time && namesPartOfDay(fullPrompt)) {
    const again = await ask("\n\nLOOK AGAIN AT THE TIME. If the words name a part of the day for doing it (tonight, tomorrow morning, Sunday night, this evening, before bed, after work, this afternoon, after dinner, first thing), that is a time: pick the clock time a reasonable person would mean by it, on the day they meant, and target_time must not be null. If such a word is only part of a name (\"night cream\", \"Morning Glory seeds\"), there is no time and target_time stays null.");
    if (again?.target_time) parsed = again;
  }
  // A last look when the day may have been counted from the wrong moment, on
  // the final answer (the part-of-day retry above can bring the slip back).
  // gpt-6-astra is handed the real date by OpenAI, and even with the said-at
  // day in its system message it still sometimes counts "tonight" or
  // "tomorrow" from the real date (1 of 26 self-test sentences, Oct 17 2026).
  // That only matters when the words were said on an earlier day (a capture
  // that finished late, a re-read of an old task), and such a slip always
  // lands in the real coming week. Only a retry trigger: the model still
  // decides the day, and a date the person named themselves stays.
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const realNow = nowInTimezone(tz);
  const realToday = ymd(realNow);
  const saidToday = saidDay?.[1] || ymd(nowInTimezone(tz, asOfMs));
  if (saidToday < realToday) {
    const weekOut = new Date(realNow);
    weekOut.setDate(weekOut.getDate() + 7);
    const lastDay = ymd(weekOut);
    const inRealWeek = (v: any) => typeof v === 'string' && v.slice(0, 10) >= realToday && v.slice(0, 10) <= lastDay;
    if (inRealWeek(parsed?.target_date) || inRealWeek(parsed?.due_date)) {
      const again = await ask(`\n\nCHECK THE DAY YOU COUNTED FROM. The words were said on ${saidDay ? `${saidDay[2]} ${saidDay[1]}` : saidToday}, not on today's real date (${realToday}). "Today", "tonight", "tomorrow" and day names count from ${saidToday}. If a date you gave came from the real date, fix it; if the person named that date themselves, keep it.`);
      if (again && typeof again === 'object') {
        // Keep a time already picked for "tonight" if this answer dropped it.
        if (!again.target_time && parsed?.target_time && namesPartOfDay(fullPrompt)) again.target_time = parsed.target_time;
        parsed = again;
      }
    }
  }
  // A part of the day is never a stated time. "taking morning medication" came
  // back with 6:30 AM marked as stated (Chad, Oct 16 2026), so a time the app
  // picked rang inside his quiet hours every morning, unanswered; only a time
  // the person said themselves may (Anna, Oct 12 2026; RULES.md §9 Q4). When
  // the words name a part of the day and a "stated" time came back, one more
  // look at that one answer. Only a retry trigger: the model still judges, and
  // only its time_stated is taken from the second look.
  if (parsed?.time_stated === true && parsed?.target_time && namesPartOfDay(fullPrompt)) {
    const again = await ask(`\n\nCHECK time_stated. You gave ${parsed.target_time} and said the person stated that clock time. time_stated is true only when their own words give the clock time itself: a number ("6:30", "7am", "at 3"), "noon" or "midnight", or an exact amount of time from now ("in 20 minutes"). A part of the day ("morning", "tonight", "after work", "before bed") means you picked the clock time, so time_stated is false.`).catch(() => null);
    if (again?.time_stated === false) parsed.time_stated = false;
  }
  // A time can only be "stated" when there is one.
  parsed.time_stated = parsed?.time_stated === true && !!parsed?.target_time;
  // recurrence_pattern feeds a strict entity enum, so a free-text answer like
  // "every 20 minutes" has to fall back to "none" rather than fail the save.
  const PATTERNS = ['none', 'daily', 'every_other_day', 'weekly', 'every_other_week', 'monthly', 'yearly'];
  if (!PATTERNS.includes(parsed?.recurrence_pattern)) parsed.recurrence_pattern = 'none';
  // Specific weekdays ("Wednesdays and Thursdays") only make sense on a weekly
  // repeat: whole numbers 0-6, no duplicates, in week order.
  const days = Array.isArray(parsed?.recurrence_days)
    ? [...new Set(parsed.recurrence_days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a: number, b: number) => a - b)
    : [];
  parsed.recurrence_days = parsed.recurrence_pattern === 'weekly' && days.length > 0 ? days : null;
  // A follow-up only counts when both halves are usable: a real next step and
  // a wait between 5 minutes and a day.
  const fuMin = Number(parsed?.follow_up_minutes);
  const fuTitle = String(parsed?.follow_up_title || '').trim();
  if (!fuTitle || !Number.isFinite(fuMin) || fuMin < 5 || fuMin > 1440) {
    parsed.follow_up_title = null;
    parsed.follow_up_minutes = null;
  } else {
    parsed.follow_up_title = fuTitle;
    parsed.follow_up_minutes = Math.round(fuMin);
  }
  // The user's own words about how to remind them, if they gave any. Short,
  // trimmed, or nothing — it is shown to the reminder planners verbatim.
  const wish = String(parsed?.reminder_wish || '').trim().replace(/\s+/g, ' ');
  parsed.reminder_wish = wish ? wish.slice(0, 200) : null;
  // A rhythm only stands when the model can quote the words that named its
  // pace ("every hour"). "Keep reminding me until I do it" names none: the
  // wish carries it and the nudge planner keeps at them every 2-3 hours
  // instead (Anna, Oct 7 2026 — Take Pills had become a strict hourly ping).
  const paceWords = String(parsed?.repeat_words || '').trim();
  parsed.reminder_interval = REPEAT_VALUES.includes(parsed?.user_asked_to_repeat_every) && paceWords
    ? parsed.user_asked_to_repeat_every
    : null;
  // A day the user actually stated must never be lost to wording — "Saturday"
  // becomes a real date here rather than dying in the scheduler.
  resolveParsedDates(parsed, nowInTimezone(tz, asOfMs));
  keepPickedTimeOutOfQuietHours(parsed, quiet);
  return fixParsedTaskTitles(parsed);
}

// A clock time the model picked itself never sits inside quiet hours (RULES.md
// §9 Q4). The prompt says so, but the model doesn't always follow it (Oct 12
// 2026: "take trash to the curb every Wednesday and Sunday night" got 10:30 PM
// for someone whose quiet hours start at 10). Inside them, the reminder is
// moved to the next morning or dropped, so "night" would never ring at night.
// It goes to the nearer edge instead: two hours before they start (time left
// to do it that evening — Anna: "it should have chosen 8 pm or something"),
// or the moment they end. Across midnight, the day (and a weekly repeat's weekdays)
// moves with it. A time the user stated is never touched.
export function keepPickedTimeOutOfQuietHours(parsed: any,
  quiet?: { enabled: boolean; startMin: number; endMin: number }) {
  if (!parsed || parsed.time_stated === true) return parsed;
  if (!quiet || !quiet.enabled || quiet.startMin === quiet.endMin) return parsed;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(String(parsed.target_time || '').trim());
  if (!hm) return parsed;
  const DAY = 1440;
  const t = Number(hm[1]) * 60 + Number(hm[2]);
  const s = quiet.startMin;
  const e = quiet.endMin;
  const inside = s < e ? (t >= s && t < e) : (t >= s || t < e);
  if (!inside) return parsed;
  const toStart = (t - s + DAY) % DAY <= (e - t + DAY) % DAY;
  const moved = toStart ? (s - 120 + DAY) % DAY : e;
  const dayShift = toStart ? (moved > t ? -1 : 0) : (moved < t ? 1 : 0);
  const was = parsed.target_time;
  parsed.target_time = `${String(Math.floor(moved / 60)).padStart(2, '0')}:${String(moved % 60).padStart(2, '0')}`;
  if (dayShift) {
    const shift = (v: any) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
      if (!m) return v;
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayShift)).toISOString().slice(0, 10);
    };
    const oldDate = parsed.target_date;
    parsed.target_date = shift(parsed.target_date);
    // due_date mirrors the day it happens; a separate deadline stays put.
    if (parsed.due_date && parsed.due_date === oldDate) parsed.due_date = parsed.target_date;
    if (Array.isArray(parsed.recurrence_days)) {
      parsed.recurrence_days = [...new Set(parsed.recurrence_days.map((d: number) => (d + dayShift + 7) % 7))].sort((a: any, b: any) => a - b);
    }
  }
  console.log(`[runTaskParse] picked time ${was} was inside quiet hours → ${parsed.target_time}${dayShift ? ` (day ${dayShift > 0 ? '+1' : '-1'})` : ''}`);
  return parsed;
}

// ── Task families and completion habits ─────────────────────────────────────
// A family is ONE repeated thing a person does, the same however it's worded
// or whose it is: "Put away my laundry" and "Put away Antonio's laundry" are
// both "laundry" (Anna, Oct 10 2026: "both of those tasks' data should go
// towards laundry"). Time estimates and the "you usually do this around…"
// suggestions are kept per family. The model decides, handed the person's
// existing families so it reuses one when it fits; never a word list.
const FAMILY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    families: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, family: { type: "string" } },
        required: ["id", "family"],
      },
    },
  },
  required: ["families"],
};

export async function assignTaskFamilies(
  tasks: { id: string; title: string; said?: string | null }[],
  existing: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = (tasks || []).filter((t) => t?.id && String(t.title || "").trim()).slice(0, 25);
  if (!list.length) return out;
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `You sort one person's to-do items into families, so the app can learn how long each kind of thing takes them and what time of day they usually do it.

A family is ONE repeated thing they do, named in 1 to 3 lowercase words. It stays the same however the task is worded and whoever it's for: "Put away my laundry", "Put away Antonio's laundry" and "Fold the laundry" are all "laundry"; "Clean the litter box" and "Scoop the litter" are both "litter box". It is not a category: different things stay apart even when they're related, because they take different amounts of time and happen at different times. "Take Miralax" and "Take your pills" are two families; "Clean the bathroom" and "Clean the kitchen" are two families. A one-off gets a family of its own.

If an item is the same thing as one of their existing families, use that family's name exactly. Answer every id you're given.`,
      },
      {
        role: "user",
        content: `Their existing families: ${existing.length ? existing.join(", ") : "none yet"}

Items:
${list.map((t) => `- id ${t.id}: "${String(t.title).slice(0, 120)}"${t.said && String(t.said).trim().toLowerCase() !== String(t.title).trim().toLowerCase() ? ` (they said: "${String(t.said).slice(0, 160)}")` : ""}`).join("\n")}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "task_families", strict: true, schema: FAMILY_SCHEMA } },
  });
  const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  const ids = new Set(list.map((t) => t.id));
  for (const f of parsed?.families || []) {
    const fam = String(f?.family || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (ids.has(f?.id) && fam && !fam.startsWith("_")) out[f.id] = fam;
  }
  return out;
}

const HABIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    habit: { type: "boolean" },
    time: { type: ["string", "null"] },
    why: { type: ["string", "null"] },
  },
  required: ["habit", "time", "why"],
};

// Whether the times someone actually finished a repeated thing show a habit
// worth moving its reminder for, and to when. The person says yes or no to the
// suggestion; nothing moves on its own.
export async function judgeCompletionHabit(input: {
  titles: string[];
  reminder: string;
  finished: string[];
  minutes: number | null;
}): Promise<{ habit: boolean; time: string | null; why: string | null }> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `You look at when one person actually finished a task they do over and over, and decide whether there's a real habit worth moving their reminder for.

It's a habit when they reliably finish it around the same time of day: on most of the days listed, within about an hour of one time (if weekdays and weekends differ, go with the pattern that covers most days). Scattered times are not a habit. Several check-offs a few minutes apart late at night look like catching up on the list, not doing the thing; don't count those.

If there is a habit, pick the reminder time so it lands just before they'd usually start: their usual finishing time, minus how long it takes them (when you're told), minus about 5 minutes; without a duration, about 15 minutes before their usual finishing time. Round to 5 minutes, 24-hour HH:MM. If their current reminder is already within 30 minutes of that, or there's no habit, answer habit false with time null.

"why" is one short, friendly sentence shown to them, in plain words, only what the times show, like "You usually finish the litter box around 9:40 PM." Never invent anything.`,
      },
      {
        role: "user",
        content: `Task: ${input.titles.map((t) => `"${t}"`).join(" / ")}
Their reminder for it now: ${input.reminder}
${input.minutes ? `It usually takes them about ${Math.round(input.minutes)} minutes.\n` : ""}When they finished it (their local time, oldest first):
${input.finished.join("\n")}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "completion_habit", strict: true, schema: HABIT_SCHEMA } },
  });
  const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  const time = typeof parsed?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time) ? parsed.time : null;
  return {
    habit: parsed?.habit === true && !!time,
    time,
    why: typeof parsed?.why === "string" ? parsed.why.slice(0, 160) : null,
  };
}

// ── Two alarms at about the same time: one alarm or two? ────────────────────
// Anna, Oct 10 2026: "If two tasks would go well together and are closely
// scheduled, then yeah, combine. If two tasks are super different from each
// other, then no, don't combine." The model judges each pair; the phone carries
// it out (one alarm naming both, or the second waits 10 minutes).
const PAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, together: { type: "boolean" }, why: { type: "string" } },
        required: ["id", "together", "why"],
      },
    },
  },
  required: ["pairs"],
};

// The model's last raw answer, for debugTaskReminders' { pairs } check only.
export let lastPairRaw = "";

type PairTask = { title: string; said?: string | null; urgency?: string | null; location?: string | null; kind?: string | null };

export async function judgeAlarmPairs(
  pairs: { id: string; a: PairTask; b: PairTask }[],
): Promise<Record<string, { together: boolean; why: string }>> {
  const out: Record<string, { together: boolean; why: string }> = {};
  const list = (pairs || []).filter((p) => p?.id && p.a?.title && p.b?.title).slice(0, 20);
  if (!list.length) return out;
  const show = (t: PairTask) => {
    const bits = [`"${String(t.title).slice(0, 120)}"`];
    if (t.said && String(t.said).trim().toLowerCase() !== String(t.title).trim().toLowerCase()) bits.push(`they said: "${String(t.said).slice(0, 160)}"`);
    if (t.urgency) bits.push(`priority ${t.urgency}`);
    if (t.location) bits.push(`at ${String(t.location).slice(0, 80)}`);
    if (t.kind) bits.push(String(t.kind));
    return bits.join(", ");
  };
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `You help a reminder app for people with ADHD. Two of one person's reminders are about to go off within a couple of minutes of each other. For each pair, decide: one alarm that names both, or keep them apart (the second one waits 10 minutes and rings on its own).

Put them together when one moment naturally takes care of both, so seeing them side by side helps: the same trip or errand, the same room or object, the same routine, or one leads straight into the other. Keep them apart when they're different kinds of things that would muddle each other or when one would get lost inside the other: a call or appointment next to a chore, unrelated things in different places, or anything urgent next to something minor (the urgent one should ring alone). Think like a good assistant deciding whether to mention two things in one breath. When it's a close call, keep them apart.

"why" is one short plain sentence a person would understand.`,
      },
      {
        role: "user",
        content: `Answer every pair, using its id exactly as written.\n\n${list.map((p) => `id ${p.id}:\n- ${show(p.a)}\n- ${show(p.b)}`).join("\n\n")}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "alarm_pairs", strict: true, schema: PAIR_SCHEMA } },
  });
  lastPairRaw = String(completion.choices?.[0]?.message?.content || completion.choices?.[0]?.message?.refusal || "").slice(0, 2000);
  const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  const ids = new Set(list.map((p) => p.id));
  for (const r of parsed?.pairs || []) {
    const id = String(r?.id || "").replace(/^(pair|id)\s*/i, "").trim();
    if (ids.has(id) && typeof r.together === "boolean") out[id] = { together: r.together, why: String(r.why || "").slice(0, 160) };
  }
  if (!Object.keys(out).length) console.error("[judgeAlarmPairs] no usable answers:", JSON.stringify(parsed).slice(0, 400));
  return out;
}
