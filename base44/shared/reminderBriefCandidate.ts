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
//
// IN USE (Nov 16 2026): the r49 candidate, tried together with PLANNER V2 in
// cronSmartTaskNudge (a replay with candidate: true turns both on). Written as
// the live text with five passages swapped, so the two cannot drift while it
// is being tried. Each swap must find its passage: CANDIDATE_SWAPS_FOUND
// counts them (5 of 5), and a replay's brief_chars shows the swapped length.
import { REMINDER_BRIEF } from './reminderBrief.ts';

const SWAPS: [string, string][] = [
  // What you can see: answers with their seconds, whose reminder it was, and
  // its own earlier answers.
  [
    `- Everything the app has already sent them today, from every part of the app, and what happened to each one: answered, snoozed, swiped away, rang out, or still booked for later.`,
    `- Everything that has gone out to them today and what happened to each one: answered (and how many seconds that took), snoozed, swiped away, rang out, or still booked for later. What you sent is listed apart from the reminders they set themselves.
- What you decided at your earlier looks today: what you held back, why, and when you said you would come back to it.`,
  ],
  // Later, Home and Back (Anna, Nov 16 2026: "A home or back press means they
  // probably didn't read it").
  [
    `Getting out of an alarm with Later, Home or Back says they saw it and nothing about what they decided: it is a pause, never a no, and the thing comes back at its next good moment.`,
    `Getting out of an alarm with Later is a pause, never a no: it says nothing about what they decided, and the thing comes back at its next good moment. Pressing Home or Back to get out of one means they probably didn't read it. So does any answer that came faster than the words could be read: that is a hand clearing the screen, not a person deciding. A reminder cleared unread still reached them, so they are at their phone; it just hasn't been heard yet, and it comes back like anything put off, at a good moment and in different words, not at once.`,
  ],
  // "The usual shape: one task, one good moment" is out (fault 1).
  [
    `The usual shape: one task, one good moment. Anything more has to be earned: by what is actually lost if it waits, by what they asked for, or by how little else is going on. A date alone is not that.`,
    `One mention is not a task's share of the day. A reminder that was put off, missed or cleared unread leaves the task exactly as undone as it was, and "already brought up today" is not a reason to leave it for tomorrow. Whether it comes back today is the same question as the first time: what it is, what waiting costs, and whether a good moment for it is still left in their day. Some things should come back within the hour, some this evening, some tomorrow, and you can tell which from what the thing is. Coming back means a better moment or better words, not the same thing again, sooner.`,
  ],
  // The reminders they set themselves are not Smart Reminders' flood (fault 4).
  [
    `Before you add one, look at everything that has already gone out today and what they did with it. If several have gone out`,
    `Before you add one, look at everything that has already gone out today and what they did with it. The reminders they set themselves, at a time or on a rhythm they chose, are the fixed points of their day. They asked for every one of them, so none of them is a reason to hold back something else that needs its moment; keep your own mentions clear of them in time, and judge flooding by what you added and what came back from it. If several have gone out`,
  ],
  // Coming back to what it held (fault 2).
  [
    `you look again with everything that has happened since, and nothing is ever booked hours ahead.`,
    `you look again with everything that has happened since, and nothing is ever booked hours ahead. Whatever you hold back, you say when you will come back to it, and you keep to that: when the time comes, you bring it up or you say what changed. The same reason given look after look is a task being left out.`,
  ],
];

export const CANDIDATE_SWAPS_FOUND = SWAPS.filter(([from]) => REMINDER_BRIEF.split(from).length === 2).length;
export const REMINDER_BRIEF_CANDIDATE = SWAPS.reduce((text, [from, to]) => text.split(from).join(to), REMINDER_BRIEF);
