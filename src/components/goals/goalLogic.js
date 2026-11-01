import { base44 } from "@/api/base44Client";
import { getLocalDateString } from "../utils/todayTasks";
import { deadlineWindowStart } from "../utils/taskSchedule";
import { sortSteps, isStepOpen, stepDeadline } from "./goalWeeks";

export { sortSteps, isStepOpen, stepDeadline };

// Goals (ported Oct 31 2026 from Anna's Goals app; GOALS_PORT.md). How a goal
// lives on the ADHDone task list:
//
// - Each ACTIVE goal has exactly ONE open Task (goal_id set): its current
//   step. The current step is the first step, by order_index, that isn't
//   completed or skipped (the Goals app's own "Up Next" rule), for every goal.
// - The step's task is a "by the end of the week" task (Anna, Nov 1 2026: "each
//   week's plan should have a task that is treated like a 'by the end of the
//   week' task. It stays until checked off"): the step's title, a short note
//   from its description, its priority (critical = urgent), a "by" deadline
//   on the last day of the step's week (no time; Smart Reminders handles it
//   like any "by" task), not repeating. When the week passes it stays, overdue,
//   until it's checked off; checked off late, the weeks after it move later
//   (goalWeeks.lateFinishShift).
// - Daily-practice goals (requires_daily_action) get the same weekly task;
//   the days are marked on the goal page's week tracker. (Before Nov 1 2026
//   they had one repeating task; GoalStepSync turns an untouched one into the
//   weekly task and leaves one the person changed as it is.)
// - Nothing goes on the list before the goal's start date, and nothing for a
//   future step: the next one is made when the current one is finished.
// - Tasks are only ever made here, in the app, through the normal client path
//   (taskCreationPipeline.createTaskFromFields), never by a backend function.
// GoalStepSync keeps all of this true; the goal page and the planner call it.

export const GOALS_CHANGED = "goals-changed";

// fromSync: the change came from GoalStepSync itself (so it doesn't run again).
export function notifyGoalsChanged(fromSync = false) {
  try { window.dispatchEvent(new CustomEvent(GOALS_CHANGED, { detail: { fromSync } })); } catch (e) { /* no window */ }
}

export const todayKey = () => getLocalDateString();

export const isRepeatingTask = (t) => !!t?.recurrence_pattern && t.recurrence_pattern !== "none";

// A goal the planner judged a daily habit (requires_daily_action), or one whose
// every step is a daily habit.
export function isHabitGoal(goal, steps) {
  if (goal?.requires_daily_action === true) return true;
  const list = steps || [];
  return list.length > 0 && list.every((s) => s.is_daily_habit === true);
}

export function goalStarted(goal, today = todayKey()) {
  return !goal?.start_date || goal.start_date <= today;
}

// The first step not yet finished, for every goal. (A daily-practice goal used
// to follow the calendar, so an unfinished week was dropped when the next one
// started; now a week stays until it's checked off, Nov 1 2026.) `goal` and
// `today` are kept for the callers.
// eslint-disable-next-line no-unused-vars
export function currentStep(goal, steps, today = todayKey()) {
  return sortSteps(steps).find(isStepOpen) || null;
}

export function stepPosition(step, steps) {
  const ordered = sortSteps(steps);
  const i = step ? ordered.findIndex((s) => s.id === step.id) : -1;
  return { n: i + 1, m: ordered.length };
}

export function goalProgress(steps) {
  const total = (steps || []).length;
  const done = (steps || []).filter((s) => s.status === "completed").length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// The habit's days, as the Goals app read them: its own days if it has them,
// else weekdays only (weekdays_only, or no weekend reminders), else every day.
export function habitPattern(goal) {
  const days = Array.isArray(goal?.habit_days_of_week)
    ? [...new Set(goal.habit_days_of_week.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : [];
  if (days.length > 0 && days.length < 7) {
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return { pattern: "weekdays", days: null };
    return { pattern: "weekly", days };
  }
  if (goal?.weekdays_only === true || goal?.include_weekend_reminders === false) return { pattern: "weekdays", days: null };
  return { pattern: "daily", days: null };
}

export function isHabitDay(goal, date = new Date()) {
  const { pattern, days } = habitPattern(goal);
  const dow = date.getDay();
  if (pattern === "weekdays") return dow >= 1 && dow <= 5;
  if (pattern === "weekly") return (days || []).includes(dow);
  return true;
}

export function habitTime(goal) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(goal?.preferred_time || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// A short note for the task: the step's first line (its concrete action).
export function shortNotes(description) {
  const first = String(description || "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+\.)\s+/, "").replace(/\*\*/g, "").trim())
    .find(Boolean) || "";
  return first.length > 200 ? `${first.slice(0, 197)}...` : first;
}

export function urgencyFor(priority) {
  if (priority === "critical") return "urgent";
  if (priority === "high" || priority === "low") return priority;
  return "medium";
}

const lifeAreaFor = (goal) => (goal?.category === "career" ? "work" : "personal");

// The one line Smart Reminders sees about the goal (cronSmartTaskNudge).
export function goalContextLine(goal, step, steps, habit) {
  const { n, m } = stepPosition(step, steps);
  const title = String(goal?.title || "").trim().slice(0, 120);
  return habit
    ? `step ${n} of ${m} of their daily-practice goal "${title}": this week's step, to finish by the end of the week (the daily practice is marked on the goal page)`
    : `step ${n} of ${m} of their goal "${title}"`;
}

const localAt = (key, h, min) => {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d, h, min, 0, 0);
};

// What a plain step's task is saved with: a "by" deadline at the end of its
// week, no time (or no date at all if the step has none). A deadline already
// gone by is kept: the task is overdue, not undated (RULES.md §9 Q3).
function stepDates(step, steps, now) {
  const deadline = stepDeadline(step, steps);
  if (!deadline) {
    return { reminder_interval: null, day_only_task: false, deadline_style: "on", next_reminder: null, due_date: null, start_date: null };
  }
  const dueISO = localAt(deadline, 23, 59).toISOString();
  const at9 = localAt(deadline, 9, 0);
  return {
    reminder_interval: "once",
    day_only_task: true,
    deadline_style: "by",
    next_reminder: at9.getTime() > now.getTime() + 2 * 60 * 1000 ? at9.toISOString() : null,
    due_date: dueISO,
    start_date: deadlineWindowStart({ deadline_style: "by", classification: "task" }, dueISO, now),
  };
}

// The next habit day: today if it's one (and the time, if any, is still
// ahead), else the next one.
function firstHabitMoment(goal, time, now) {
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!isHabitDay(goal, d)) continue;
    if (!time) return d;
    const [h, m] = time.split(":").map(Number);
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
    if (at.getTime() > now.getTime() + 2 * 60 * 1000) return at;
  }
  return null;
}

export function goalTaskFields(goal, step, steps, habit, now = new Date()) {
  const base = {
    title: String(step.title || "Goal step").trim(),
    notes: shortNotes(step.description),
    description: "",
    classification: "task",
    urgency: urgencyFor(step.priority),
    energy_required: "medium",
    life_area: lifeAreaFor(goal),
    reminder_count: 0,
    goal_id: goal.id,
    goal_step_id: step.id,
    goal_context: goalContextLine(goal, step, steps, habit),
  };
  if (!habit) {
    const dates = stepDates(step, steps, now);
    return {
      fields: { ...base, ...dates, recurrence_pattern: "none" },
      booking: { dayOnly: dates.day_only_task, deadlineStyle: dates.deadline_style },
    };
  }
  const { pattern, days } = habitPattern(goal);
  const time = habitTime(goal);
  const first = firstHabitMoment(goal, time, now) || now;
  if (time) {
    // A time they chose in the planner: a time they set (RULES.md §9 Q4).
    return {
      fields: {
        ...base,
        reminder_interval: "once",
        recurrence_pattern: pattern,
        recurrence_days: days,
        day_only_task: false,
        deadline_style: "on",
        anchor_time: time,
        time_stated: true,
        next_reminder: first.toISOString(),
        due_date: null,
        start_date: null,
      },
      booking: { dayOnly: false, deadlineStyle: "on" },
    };
  }
  // No time chosen: a repeating all-day task; Smart Reminders handles it.
  const key = getLocalDateString(first);
  const at9 = localAt(key, 9, 0);
  return {
    fields: {
      ...base,
      reminder_interval: "once",
      recurrence_pattern: pattern,
      recurrence_days: days,
      day_only_task: true,
      deadline_style: "on",
      anchor_time: null,
      time_stated: false,
      next_reminder: at9.getTime() > now.getTime() + 2 * 60 * 1000 ? at9.toISOString() : null,
      due_date: localAt(key, 23, 59).toISOString(),
      start_date: null,
    },
    booking: { dayOnly: true, deadlineStyle: "on" },
  };
}

export async function createGoalTask(goal, step, steps, user, habit) {
  const { fields, booking } = goalTaskFields(goal, step, steps, habit);
  const { createTaskFromFields } = await import("../utils/taskCreationPipeline");
  const task = await createTaskFromFields(fields, { email: user.email, ...booking });
  import("../utils/widgetBridge").then((m) => m.refreshAlarms()).catch(() => {});
  return task;
}

export async function openGoalTasks(goalId) {
  const rows = await base44.entities.Task.filter({ goal_id: goalId, status: "active" }, "created_date", 50);
  return (rows || []).filter((t) => !t.parent_task_id);
}

const tasksChanged = () => {
  try { window.dispatchEvent(new CustomEvent("tasks-changed")); } catch (e) { /* no window */ }
};
const refreshAlarmsSoon = () => import("../utils/widgetBridge").then((m) => m.refreshAlarms()).catch(() => {});

// Finish a goal's task the way checking it off on Home does (the same saves,
// minus the confetti): done, its pushes cancelled, its steps checked, and a
// repeating habit's next copy made.
export async function finishLinkedTask(task, { makeNext = true } = {}) {
  const { isAlreadyCompleted, createNextRecurrence } = await import("../utils/taskRecurrence");
  if (await isAlreadyCompleted(task)) return false;
  const ids = task.onesignal_notification_ids || [];
  await base44.entities.Task.update(task.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    onesignal_notification_ids: [],
  });
  if (ids.length) {
    import("../utils/reminderScheduler").then((m) => m.cancelScheduledReminder(ids)).catch(() => {});
  }
  try {
    const { completeSubtasks } = await import("../utils/subtaskCompletion");
    await completeSubtasks(task.id);
  } catch (e) { /* steps are a nicety */ }
  if (makeNext && task.recurrence_pattern && task.recurrence_pattern !== "none") {
    try { await createNextRecurrence(task); } catch (e) { console.error("[goals] next copy failed:", e); }
  }
  refreshAlarmsSoon();
  tasksChanged();
  return true;
}

// Taking a finish back, the way Home's un-check does.
export async function unfinishLinkedTask(task) {
  await base44.entities.Task.update(task.id, { status: "active", completed_at: null });
  try {
    const { removeNextRecurrence } = await import("../utils/taskRecurrence");
    await removeNextRecurrence(task);
  } catch (e) { /* the copy stays; the sync keeps one */ }
  refreshAlarmsSoon();
  tasksChanged();
}

// A goal marked done with its task still open: the task leaves the list
// (checked off, no next copy for a habit) and no longer points at a step, so
// the step isn't marked done and the week tracker doesn't count it.
export async function closeOutTask(task) {
  const ids = task.onesignal_notification_ids || [];
  await base44.entities.Task.update(task.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    onesignal_notification_ids: [],
    goal_step_id: null,
  });
  if (ids.length) {
    import("../utils/reminderScheduler").then((m) => m.cancelScheduledReminder(ids)).catch(() => {});
  }
  try {
    const { completeSubtasks } = await import("../utils/subtaskCompletion");
    await completeSubtasks(task.id);
  } catch (e) { /* steps are a nicety */ }
  refreshAlarmsSoon();
  tasksChanged();
}

// Remove a goal's task for good: only for a goal the person deletes, and for a
// duplicate GoalStepSync itself just made. Same as the app's delete: reminders
// cancelled first, then the task and its steps.
export async function deleteLinkedTask(task) {
  let subs = [];
  try { subs = await base44.entities.Task.filter({ parent_task_id: task.id }); } catch (e) { subs = []; }
  for (const t of [task, ...(subs || [])]) {
    try { await base44.functions.invoke("cancelTaskNotifications", { taskId: t.id }); } catch (e) { /* the delete still goes */ }
  }
  for (const t of [task, ...(subs || [])]) {
    try { await base44.entities.Task.delete(t.id); } catch (e) { console.error("[goals] delete failed", t.id, e); }
  }
  refreshAlarmsSoon();
  tasksChanged();
}

// Point the goal's one open task at a different step (the plan was edited, a
// step was un-checked, or a habit moved on to its next week). Words the
// person changed on the task are kept.
export async function retargetTask(task, goal, step, steps, habit, oldStep = null) {
  const { fields } = goalTaskFields(goal, step, steps, habit);
  const updates = {
    goal_step_id: step.id,
    goal_context: fields.goal_context,
  };
  const oldNotes = oldStep ? shortNotes(oldStep.description) : "";
  if (!task.notes || task.notes === oldNotes) updates.notes = fields.notes;
  if (!task.silenced && (!oldStep || task.urgency === urgencyFor(oldStep.priority))) updates.urgency = fields.urgency;
  if (!habit) {
    for (const k of ["reminder_interval", "day_only_task", "deadline_style", "next_reminder", "due_date", "start_date"]) {
      updates[k] = fields[k];
    }
  }
  await base44.entities.Task.update(task.id, updates);
  if ((task.title || "").trim() !== fields.title && (!oldStep || (task.title || "").trim() === String(oldStep.title || "").trim())) {
    const { saveTaskTitle } = await import("../utils/multiReminderScheduler");
    await saveTaskTitle({ ...task, ...updates }, fields.title);
  }
  tasksChanged();
}

// ── Goal status: pause, resume, done, reopen, delete ─────────────────────────

// Paused: its open task goes on the Back Burner (the same switch as the task
// card's), remembered on the goal so resuming brings back exactly those.
export async function pauseGoal(goal) {
  const open = await openGoalTasks(goal.id);
  const parking = open.filter((t) => !t.silenced).map((t) => t.id);
  await base44.entities.Goal.update(goal.id, { status: "paused", paused_at: new Date().toISOString(), paused_task_ids: parking });
  for (const id of parking) {
    await base44.entities.Task.update(id, { silenced: true, was_back_burnered: true });
  }
  refreshAlarmsSoon();
  tasksChanged();
  notifyGoalsChanged();
}

export async function unparkPausedTasks(goal) {
  const ids = Array.isArray(goal?.paused_task_ids) ? goal.paused_task_ids : [];
  for (const id of ids) {
    try {
      const t = (await base44.entities.Task.filter({ id }))?.[0];
      if (t && t.status === "active" && t.silenced) await base44.entities.Task.update(id, { silenced: false });
    } catch (e) { /* gone: nothing to bring back */ }
  }
  if (ids.length) await base44.entities.Goal.update(goal.id, { paused_task_ids: [] });
  return ids.length > 0;
}

export async function resumeGoal(goal) {
  await base44.entities.Goal.update(goal.id, { status: "active", paused_at: null });
  await unparkPausedTasks(goal);
  refreshAlarmsSoon();
  tasksChanged();
  notifyGoalsChanged();
}

export async function completeGoal(goal) {
  await base44.entities.Goal.update(goal.id, { status: "completed", completed_at: new Date().toISOString(), paused_task_ids: [] });
  for (const t of await openGoalTasks(goal.id)) await closeOutTask(t);
  notifyGoalsChanged();
}

export async function reopenGoal(goal) {
  await base44.entities.Goal.update(goal.id, { status: "active", completed_at: null });
  notifyGoalsChanged();
}

// Deleting a goal the person chose to delete: its open task(s), its steps and
// the goal. Tasks already finished stay (they're part of what they got done).
export async function deleteGoal(goal) {
  for (const t of await openGoalTasks(goal.id)) await deleteLinkedTask(t);
  const steps = await base44.entities.GoalStep.filter({ goal_id: goal.id }, "order_index", 1000).catch(() => []);
  for (const s of steps || []) {
    try { await base44.entities.GoalStep.delete(s.id); } catch (e) { console.error("[goals] step delete failed", s.id, e); }
  }
  await base44.entities.Goal.delete(goal.id);
  notifyGoalsChanged();
}
