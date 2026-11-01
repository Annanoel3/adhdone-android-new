// A goal's weeks, as plain date math (no app imports, so it can be tested on
// its own). Dates are "YYYY-MM-DD" on the person's own clock.
//
// - A step's due_date is the day its week STARTS (as in the Goals app). Its
//   week ends the day before the next later step's week starts, or six days
//   on for the last one. Its task is due "by" that last day.
// - A step checked off after its week ended moves every unfinished step after
//   it later, so the next one starts the day after it was checked off (Anna,
//   Nov 1 2026: "if someone checks off late, the plan can readjust"). Only
//   due dates change; nothing is made or removed. Finished on time or early:
//   nothing moves (the next step's task is there right away, due by the end
//   of its own week, so someone ahead can start it early).
// - The goal's target_date stays their deadline: when the moved weeks run
//   past it, the goal page says how far behind (planBehind).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (v) => typeof v === "string" && DATE_RE.test(v);

const DONE = new Set(["completed", "skipped"]);
export const isStepOpen = (s) => !!s && !DONE.has(s.status);

export function sortSteps(steps) {
  return [...(steps || [])].sort((a, b) =>
    (Number(a.order_index) || 0) - (Number(b.order_index) || 0)
    || String(a.created_date || "").localeCompare(String(b.created_date || "")));
}

export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// The day a moment falls on, on this device's clock.
export function localDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The last day of a step's week (its task's "by" date).
export function stepDeadline(step, steps) {
  if (!isDateKey(step?.due_date)) return null;
  const ordered = sortSteps(steps);
  const i = ordered.findIndex((s) => s.id === step.id);
  const next = ordered.slice(i + 1).find((s) => isDateKey(s.due_date) && s.due_date > step.due_date);
  return next ? addDays(next.due_date, -1) : addDays(step.due_date, 6);
}

export function stepWeek(step, steps) {
  const end = stepDeadline(step, steps);
  return end ? { start: step.due_date, end } : null;
}

// A step checked off after its week ended: what moves. The step is the
// finished one just before the first unfinished step; everything unfinished
// from there on moves by the same number of days, so the gaps between weeks
// stay as planned. Null when nothing needs to move (on time, early, already
// moved). Updates come in plan order: the first one is the next step, so a
// second phone running this at the same moment reads it moved and stops.
export function lateFinishShift(steps) {
  const ordered = sortSteps(steps);
  const firstOpen = ordered.findIndex(isStepOpen);
  if (firstOpen <= 0) return null;
  let finished = null;
  for (let i = firstOpen - 1; i >= 0; i--) {
    if (ordered[i].status === "completed") { finished = ordered[i]; break; }
  }
  if (!finished?.completed_at) return null;
  const doneDay = localDay(finished.completed_at);
  const end = stepDeadline(finished, ordered);
  if (!doneDay || !end || doneDay <= end) return null;
  const moving = ordered.slice(firstOpen).filter((s) => isStepOpen(s) && isDateKey(s.due_date));
  if (moving.length === 0) return null;
  const days = daysBetween(moving[0].due_date, addDays(doneDay, 1));
  if (days <= 0) return null;
  return {
    step: finished,
    daysLate: daysBetween(end, doneDay),
    days,
    updates: moving.map((s) => ({ id: s.id, from: s.due_date, due_date: addDays(s.due_date, days) })),
  };
}

// The plan's last day, when it runs past the goal's deadline (target_date).
export function planBehind(goal, steps) {
  if (!isDateKey(goal?.target_date)) return null;
  const ordered = sortSteps(steps);
  if (!ordered.some(isStepOpen)) return null;
  let finish = null;
  for (const s of ordered) {
    const end = stepDeadline(s, ordered);
    if (end && (!finish || end > finish)) finish = end;
  }
  if (!finish || finish <= goal.target_date) return null;
  return { days: daysBetween(goal.target_date, finish), deadline: goal.target_date, finish };
}

// "About 2 weeks behind your January 2028 deadline"
export function behindText(behind) {
  if (!behind) return "";
  const month = new Date(`${behind.deadline}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const d = behind.days;
  const amount = d < 7
    ? `${d} day${d === 1 ? "" : "s"}`
    : `${Math.max(1, Math.round(d / 7))} week${Math.round(d / 7) === 1 ? "" : "s"}`;
  return `About ${amount} behind your ${month} deadline`;
}

const DAY_LETTERS = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];
const dayLetter = (key) => DAY_LETTERS[new Date(`${key}T00:00:00Z`).getUTCDay()];

// The days a daily-practice step's tracker shows: its own week's real dates
// (Anna, Nov 1 2026: it rang Sunday Nov 1 on a week that runs Nov 2–8). The
// current step still open after its week ended keeps going until it's
// checked off, so its tracker shows the last seven days up to today. No
// dates on the step: this calendar week, Monday to Sunday (as before).
export function trackerDays(step, steps, today, { current = false } = {}) {
  const week = stepWeek(step, steps);
  let start;
  let end;
  let overdue = false;
  if (!week) {
    const d = new Date(`${today}T00:00:00Z`);
    const dow = d.getUTCDay();
    start = addDays(today, dow === 0 ? -6 : 1 - dow);
    end = addDays(start, 6);
  } else if (current && isStepOpen(step) && today > week.end) {
    overdue = true;
    start = addDays(today, -6);
    end = today;
  } else {
    start = week.start;
    end = daysBetween(week.start, week.end) > 9 ? addDays(week.start, 9) : week.end;
  }
  const days = [];
  for (let k = start; k <= end; k = addDays(k, 1)) days.push({ date: k, label: dayLetter(k), day: Number(k.slice(8)) });
  return { days, week, overdue, hasToday: today >= start && today <= end };
}

export function fmtDay(key, withYear = false) {
  if (!isDateKey(key)) return "";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
