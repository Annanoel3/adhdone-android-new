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
// (or, as for r49, the live text with passages swapped:
//   const SWAPS: [string, string][] = [[`old passage`, `new passage`], ...];
//   export const REMINDER_BRIEF_CANDIDATE = SWAPS.reduce((t, [a, b]) => t.split(a).join(b), REMINDER_BRIEF);
// and check a replay's brief_chars changed, so every swap found its passage),
// re-save cronSmartTaskNudge, replay the moments the change is about, and only
// then move the text into reminderBrief.ts (bump the version, update Anna's
// doc). Afterwards put this file back to the one line below so the two never
// drift. First used Nov 15 2026 for r48 (the lists taken out of the brief),
// then Nov 16 2026 for r49.
//
// IN USE (Nov 16 2026, evening): the r50 candidate. On r49's first evening the
// planner sent Anna one alarm every 30 minutes (5:29, 5:59, 6:29 PM), each put
// off with Later inside a minute, working down the come-back times it had
// handed out at 5:19. Two passages gain a sentence.
import { REMINDER_BRIEF } from './reminderBrief.ts';

const SWAPS: [string, string][] = [
  [
    `it just hasn't been heard yet, and it comes back like anything put off, at a good moment and in different words, not at once.`,
    `it just hasn't been heard yet, and it comes back like anything put off, at a good moment and in different words, not at once. And when they put off one thing after another in a short stretch, that is about the moment, not the things: they are in the middle of something, and whatever it is rarely ends in the next half hour. Leave them alone for a good while, long enough to be a real break and not the same interruption again, and when you do come back, bring the one thing that matters most, not the next thing in line. What truly cannot wait still goes at its time.`,
  ],
  [
    `And a task you've brought up day after day with nothing happening needs a different approach, never more of the same.`,
    `And a task you've brought up day after day with nothing happening needs a different approach, never more of the same.

When several things are waiting at once, don't hand each one a turn. Decide how much this stretch of their day can take, pick the few that most need it, and let the rest wait for a later stretch or for tomorrow, and say so. A turn for everything, one after another, is flooding with a reason attached to each ping.`,
  ],
  [
    `The same reason given look after look is a task being left out.`,
    `The same reason given look after look is a task being left out. A time you gave is a time to look again, not a booking: by then they may have shown you something about the moment, and that counts as what changed.`,
  ],
];

export const REMINDER_BRIEF_CANDIDATE = SWAPS.reduce((text, [from, to]) => text.split(from).join(to), REMINDER_BRIEF);
