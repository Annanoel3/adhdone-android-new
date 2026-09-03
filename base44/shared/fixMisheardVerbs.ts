// Deterministic repair for speech-to-text mis-hears of a task's leading action verb.
// Voice input regularly turns "buy milk" into "but milk" / "by milk" / "bye milk".
// A task title must never start with a conjunction/preposition, so we correct ONLY
// that first function word and never touch the rest of the title (the subject the
// user named must survive verbatim).

const LEADING_FIXES: Record<string, string> = {
  but: "Buy",
  by: "Buy",
  bye: "Buy",
  buty: "Buy",
  cal: "Call",
  cual: "Call",
  pic: "Pick",
  pik: "Pick",
  tex: "Text",
  txt: "Text",
  male: "Mail",
};

// Words that legitimately follow "by"/"but" as part of a real phrase — if the
// title reads like normal prose we leave it alone.
const SAFE_NEXT_WORDS = new Set(["the", "then", "now", "tomorrow", "myself", "way", "am", "pm"]);

export function fixMisheardTitle(title?: string | null): string {
  if (!title || typeof title !== "string") return title ?? "";
  const trimmed = title.trim();
  const match = trimmed.match(/^([A-Za-z']+)(\s+)(.+)$/);
  if (!match) return trimmed;

  const [, first, space, rest] = match;
  const fix = LEADING_FIXES[first.toLowerCase()];
  if (!fix) return trimmed;

  const nextWord = rest.split(/\s+/)[0].toLowerCase();
  if (SAFE_NEXT_WORDS.has(nextWord)) return trimmed;

  return `${fix}${space}${rest}`;
}

// Applies the fix to a parsed task object's title (and any subtask titles) in place-safe fashion.
export function fixParsedTaskTitles<T extends Record<string, any>>(parsed: T): T {
  if (!parsed || typeof parsed !== "object") return parsed;
  const out: Record<string, any> = { ...parsed };
  // Different parse functions name the field differently (title / task / main_task).
  for (const key of ["title", "task", "main_task", "task_title"]) {
    if (typeof out[key] === "string") out[key] = fixMisheardTitle(out[key]);
  }
  if (Array.isArray(out.subtasks)) {
    out.subtasks = out.subtasks.map((s: any) =>
      typeof s === "string"
        ? fixMisheardTitle(s)
        : s && typeof s.title === "string"
          ? { ...s, title: fixMisheardTitle(s.title) }
          : s
    );
  }
  if (Array.isArray(out.tasks)) {
    out.tasks = out.tasks.map((t: any) => fixParsedTaskTitles(t));
  }
  return out as T;
}