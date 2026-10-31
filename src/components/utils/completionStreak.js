import { base44 } from "@/api/base44Client";

// The one streak in the app: days in a row, on the person's own calendar day,
// with at least one task finished. Same rule Insights has always used: real
// completions only (completed_at set), no subtasks, no birthdays. Still alive
// when the last finished day is today or yesterday.
//
// Why one place (Anna, Oct 31 2026: Insights said 3, "the app says i am on a
// 21 day streak elsewhere"): the other spots read DailySummary.streak_days,
// which chained yesterday's summary + 1 using UTC dates. An evening finish
// (after 7 PM Central) landed on the next UTC day, so a day with nothing
// finished (Oct 28) never broke the chain, and that number reached the daily
// tip, the motivation message, Talk It Out and the end-of-day review.

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function streakFromTasks(tasks, now = new Date()) {
  const days = {};
  (tasks || []).forEach((t) => {
    if (!t || t.status !== "completed" || !t.completed_at || t.parent_task_id || t.birthday_person) return;
    const d = new Date(t.completed_at);
    if (!Number.isNaN(d.getTime())) days[dayKey(d)] = true;
  });
  let streak = 0;
  const cursor = new Date(now);
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (days[dayKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Reads the person's finished tasks (newest first) and counts. Never throws:
// a failed read is a streak of 0, never a made-up number.
export async function currentStreak() {
  try {
    const done = await base44.entities.Task.filter({ status: "completed" }, "-completed_at", 1000);
    return streakFromTasks(done);
  } catch (e) {
    console.warn("[streak] could not read finished tasks:", e);
    return 0;
  }
}
