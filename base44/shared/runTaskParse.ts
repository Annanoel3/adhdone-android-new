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
const MODEL = "gpt-5.4";

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
    urgency: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    energy_required: { type: "string", enum: ["low", "medium", "high"] },
    classification: { type: "string", enum: ["task", "event", "birthday", "payment"] },
    target_date: { type: ["string", "null"] },
    target_time: { type: ["string", "null"] },
    end_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    user_asked_to_repeat_every: { anyOf: [{ type: "string", enum: REPEAT_VALUES }, { type: "null" }] },
    recurrence_pattern: { type: "string" },
    deadline_style: { type: "string", enum: ["on", "by"] },
    day_only_task: { type: "boolean" },
    needs_date_pick: { type: "boolean" },
    is_flexible: { type: "boolean" },
    priority_uninferrable: { type: "boolean" },
    life_area: { type: "string", enum: ["work", "personal"] },
    follow_up_title: { type: ["string", "null"] },
    follow_up_minutes: { type: ["integer", "null"] },
  },
  required: [
    "title", "location", "urgency", "energy_required", "classification",
    "target_date", "target_time", "end_date", "due_date",
    "user_asked_to_repeat_every", "recurrence_pattern", "deadline_style",
    "day_only_task", "needs_date_pick", "is_flexible", "priority_uninferrable",
    "life_area", "follow_up_title", "follow_up_minutes",
  ],
};

// `_base44` is kept so every caller's signature stays the same; the parser no
// longer needs the client. `aboutMe` is the user's own one-liner about their
// life from onboarding — it's what lets the model tell a work task from a
// personal one for THIS person rather than for a generic office worker.
export async function runTaskParse(_base44: any, prompt: string, tz?: string, aboutMe?: string) {
  // Callers are supposed to pass a prompt already built by
  // buildTaskParsePrompt, which carries the one thing the model cannot work out
  // for itself: today's real calendar. If raw text arrives instead, build it
  // here rather than asking the model to do date math it will get wrong —
  // without the calendar it answers "Saturday" (or nothing) instead of a date.
  const fullPrompt = prompt?.includes('THE CALENDAR')
    ? prompt
    : buildTaskParsePrompt(prompt || '', tz);

  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
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
        content: aboutMe?.trim()
          ? `${TASK_PARSE_SYSTEM_PROMPT}\n\nABOUT THE USER (in their own words): ${aboutMe.trim()}`
          : TASK_PARSE_SYSTEM_PROMPT,
      },
      { role: "user", content: fullPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "task_parse", strict: true, schema: TASK_PARSE_SCHEMA },
    },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  // recurrence_pattern feeds a strict entity enum, so a free-text answer like
  // "every 20 minutes" has to fall back to "none" rather than fail the save.
  const PATTERNS = ['none', 'daily', 'weekly', 'every_other_week', 'monthly', 'yearly'];
  if (!PATTERNS.includes(parsed?.recurrence_pattern)) parsed.recurrence_pattern = 'none';
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
  parsed.reminder_interval = REPEAT_VALUES.includes(parsed?.user_asked_to_repeat_every)
    ? parsed.user_asked_to_repeat_every
    : null;
  // A day the user actually stated must never be lost to wording — "Saturday"
  // becomes a real date here rather than dying in the scheduler.
  resolveParsedDates(parsed, nowInTimezone(tz));
  return fixParsedTaskTitles(parsed);
}