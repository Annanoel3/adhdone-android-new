// A place to try a change to the brief before anyone gets it.
//
// cronSmartTaskNudge plans with this text instead of the live brief ONLY on an
// owner replay that asks for it ({ email, preview: true, as_of, candidate:
// true }; add dry: true to see what the planner would be shown without paying
// for the look, and task_overrides to put back fields a replay cannot rewind).
// Nothing is saved or sent on a replay.
//
// To test a wording change: replace the line below with
//   export const REMINDER_BRIEF_CANDIDATE = `...the whole candidate text...`;
// re-save cronSmartTaskNudge, replay the moments the change is about, and only
// then move the text into reminderBrief.ts (bump the version, update Anna's
// doc). Afterwards put this file back to the one line below so the two never
// drift. First used Nov 15 2026 for r48 (the lists taken out of the brief).
import { REMINDER_BRIEF } from './reminderBrief.ts';

export const REMINDER_BRIEF_CANDIDATE = REMINDER_BRIEF;
