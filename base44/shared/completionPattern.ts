// When does this person ACTUALLY get things done?
//
// Reminders land at times the app picked, not times that work. This reads the
// hours of day the user has actually completed tasks in and turns them into a
// hint for the nudge planner, so earlier heads-up nudges arrive when they've
// historically had capacity instead of at an arbitrary hour.
//
// Deliberately narrow:
// - TASKS ONLY. Events and birthdays happen at a set time — completing one says
//   nothing about when the user chooses to do things.
// - It only shifts the timing of optional, ahead-of-deadline nudges. A due-day
//   or overdue reminder is never moved or dropped by a pattern; missing a
//   deadline because "you don't usually do things at 4pm" would be a real harm.
// - Needs real evidence (8+ completions). Below that it returns nothing rather
//   than inventing a personality from three data points.

const MIN_COMPLETIONS = 8;

const BANDS: { label: string; start: number; end: number }[] = [
  { label: 'early morning (6–9 AM)', start: 6, end: 9 },
  { label: 'late morning (9 AM–noon)', start: 9, end: 12 },
  { label: 'early afternoon (noon–3 PM)', start: 12, end: 15 },
  { label: 'late afternoon (3–6 PM)', start: 15, end: 18 },
  { label: 'evening (6–9 PM)', start: 18, end: 21 },
  { label: 'late night (9 PM–midnight)', start: 21, end: 24 },
];

export interface CompletionPattern {
  /** Prompt-ready sentence, or '' when there isn't enough history. */
  note: string;
  /** Hour bands the user completes most in, strongest first. */
  topBands: string[];
  sampleSize: number;
}

function localHour(iso: string, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(new Date(iso));
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

/**
 * @param tasks  Any task list — filtered internally to the user's completed,
 *               non-event, non-birthday tasks.
 * @param email  Owner to score (matched on created_by).
 */
export function buildCompletionPattern(tasks: any[], email: string, timeZone: string): CompletionPattern {
  const counts = new Array(BANDS.length).fill(0);
  let total = 0;

  for (const t of tasks || []) {
    if (t?.created_by !== email) continue;
    if (t.status !== 'completed' || !t.completed_at) continue;
    if (t.classification === 'event' || t.classification === 'birthday' || t.birthday_person) continue;

    const hour = localHour(t.completed_at, timeZone);
    if (hour == null) continue;
    const bi = BANDS.findIndex((b) => hour >= b.start && hour < b.end);
    if (bi === -1) continue; // midnight–6 AM: not a window to aim reminders at
    counts[bi]++;
    total++;
  }

  if (total < MIN_COMPLETIONS) return { note: '', topBands: [], sampleSize: total };

  const ranked = BANDS
    .map((b, i) => ({ label: b.label, share: counts[i] / total }))
    // A band only counts as a real window if it holds a decent slice of the
    // user's completions — otherwise every band looks like a pattern.
    .filter((b) => b.share >= 0.2)
    .sort((a, b) => b.share - a.share)
    .slice(0, 2);

  if (ranked.length === 0) return { note: '', topBands: [], sampleSize: total };

  const bandText = ranked.map((b) => `${b.label} (${Math.round(b.share * 100)}% of completions)`).join(' and ');
  const note = `WHEN THIS PERSON ACTUALLY GETS THINGS DONE (from ${total} completed tasks): ${bandText}.`;

  return { note, topBands: ranked.map((b) => b.label), sampleSize: total };
}