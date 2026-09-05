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
const MODEL = "claude_sonnet_4_6";

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

export async function runTaskParse(base44: any, prompt: string, tz?: string) {
  // Callers are supposed to pass a prompt already built by
  // buildTaskParsePrompt, which carries the one thing the model cannot work out
  // for itself: today's real calendar. If raw text arrives instead, build it
  // here rather than asking the model to do date math it will get wrong —
  // without the calendar it answers "Saturday" (or nothing) instead of a date.
  const fullPrompt = prompt?.includes('THE CALENDAR')
    ? prompt
    : buildTaskParsePrompt(prompt || '', tz);

  const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `${TASK_PARSE_SYSTEM_PROMPT}\n\n${fullPrompt}`,
    model: MODEL,
    response_json_schema: {
      type: "object",
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
        user_asked_to_repeat_every: { type: ["string", "null"], enum: [...REPEAT_VALUES, null] },
        recurrence_pattern: { type: "string" },
        deadline_style: { type: "string", enum: ["on", "by"] },
        day_only_task: { type: "boolean" },
        needs_date_pick: { type: "boolean" },
        is_flexible: { type: "boolean" },
        priority_uninferrable: { type: "boolean" },
      },
      required: ["title", "classification"],
    },
  });

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  // recurrence_pattern feeds a strict entity enum, so a free-text answer like
  // "every 20 minutes" has to fall back to "none" rather than fail the save.
  const PATTERNS = ['none', 'daily', 'weekly', 'every_other_week', 'monthly', 'yearly'];
  if (!PATTERNS.includes(parsed?.recurrence_pattern)) parsed.recurrence_pattern = 'none';
  parsed.reminder_interval = REPEAT_VALUES.includes(parsed?.user_asked_to_repeat_every)
    ? parsed.user_asked_to_repeat_every
    : null;
  // A day the user actually stated must never be lost to wording — "Saturday"
  // becomes a real date here rather than dying in the scheduler.
  resolveParsedDates(parsed, nowInTimezone(tz));
  return fixParsedTaskTitles(parsed);
}