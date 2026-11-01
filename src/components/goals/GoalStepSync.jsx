import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { goalsEnabled } from "./goalsAccess";
import {
  GOALS_CHANGED, notifyGoalsChanged, todayKey, sortSteps, isStepOpen, isHabitGoal, goalStarted,
  currentStep, goalContextLine, shortNotes, openGoalTasks, createGoalTask, retargetTask,
  closeOutTask, deleteLinkedTask, unparkPausedTasks, isRepeatingTask, applyLateShift,
} from "./goalLogic";
import { lateFinishShift } from "./goalWeeks";

// The goal's weekly step tasks (an old repeating one a person changed, from
// before Nov 1 2026, is left as it is and doesn't count).
const weeklyTasks = async (goalId) => (await openGoalTasks(goalId)).filter((t) => !isRepeatingTask(t));

// Keeps every goal's ONE open task true (goalLogic.js says what that is).
// Mounted once in Layout; does nothing for an account Goals isn't open to
// (goalsAccess.js). Runs when the app opens, when it comes back on screen,
// when goal data changes, a few seconds after a task is checked off (past the
// Undo), and on moving between pages at most every 10 seconds. The planner and
// the goal page also run it right after they change something.
//
// It never makes two tasks for one step: the step's task_id is the marker; a
// run claims the step (task_claim), waits, reads it back and only goes on if
// its claim is the one that stuck and the goal still has no open task; after
// making it, if another phone or tab made one too, the later one is removed.
// A step whose task the person deleted is marked task_dismissed and never
// gets one again unless they ask (the goal page's "Add this step to my tasks").

const CLAIM_FRESH_MS = 90 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deviceId() {
  try {
    let id = localStorage.getItem("goal_sync_device");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("goal_sync_device", id);
    }
    return id;
  } catch (e) {
    if (!deviceId.mem) deviceId.mem = Math.random().toString(36).slice(2, 10);
    return deviceId.mem;
  }
}

function parseClaim(v) {
  const m = /^([^:]+):(\d+)$/.exec(String(v || ""));
  return m ? { device: m[1], at: Number(m[2]) } : null;
}

const byCreated = (a, b) => String(a.created_date || "").localeCompare(String(b.created_date || ""));

// A task the sync made and nobody has touched since (safe to remove as a
// duplicate).
function untouched(task, step) {
  if (!task || task.silenced) return false;
  if ((task.pictures || []).length || task.tag || (task.snooze_count || 0) > 0) return false;
  if (step && (task.title || "").trim() !== String(step.title || "").trim()) return false;
  if (step && (task.notes || "") !== shortNotes(step.description)) return false;
  return true;
}

async function stepById(id) {
  try { return (await base44.entities.GoalStep.filter({ id }))?.[0] || null; } catch (e) { return null; }
}

async function makeTaskForStep(goal, step, steps, user, habit) {
  const me = deviceId();
  const fresh = await stepById(step.id);
  if (!fresh || !isStepOpen(fresh) || fresh.task_id || fresh.task_dismissed) return false;
  const claim = parseClaim(fresh.task_claim);
  if (claim && claim.device !== me && Date.now() - claim.at < CLAIM_FRESH_MS) return false;
  const token = `${me}:${Date.now()}`;
  await base44.entities.GoalStep.update(step.id, { task_claim: token });
  await sleep(1500);
  const again = await stepById(step.id);
  if (!again || again.task_claim !== token || again.task_id || again.task_dismissed || !isStepOpen(again)) return false;
  if ((await weeklyTasks(goal.id)).length > 0) {
    await base44.entities.GoalStep.update(step.id, { task_claim: null });
    return false; // someone else's is there; the next run links it
  }
  const task = await createGoalTask(goal, again, steps, user, habit);
  await base44.entities.GoalStep.update(step.id, { task_id: task.id, task_claim: null, task_dismissed: false });
  // Two phones (or tabs) that both got through: keep the first one made.
  const after = (await weeklyTasks(goal.id)).sort(byCreated);
  if (after.length > 1 && after[0].id !== task.id) {
    // The step points at the kept one first, so removing this one isn't read
    // as the person deleting their step's task (onTaskUpdate).
    await base44.entities.GoalStep.update(step.id, { task_id: after[0].id });
    await deleteLinkedTask(task);
  }
  return true;
}

async function syncGoal(goal, user, today) {
  let changed = false;
  let open = await openGoalTasks(goal.id);

  // Done: no open step task.
  if (goal.status === "completed") {
    for (const t of open) { await closeOutTask(t); changed = true; }
    return changed;
  }
  // Paused: its task went on the Back Burner when it was paused; left alone.
  if (goal.status === "paused") return false;

  // Resumed, but bringing its task back off the Back Burner didn't finish.
  if (Array.isArray(goal.paused_task_ids) && goal.paused_task_ids.length > 0) {
    await unparkPausedTasks(goal);
    open = await openGoalTasks(goal.id);
    changed = true;
  }

  let steps = sortSteps(await base44.entities.GoalStep.filter({ goal_id: goal.id }, "order_index", 1000));
  const habit = isHabitGoal(goal, steps);

  // A step's task finished or un-finished where onTaskUpdate didn't get to it
  // (it normally does): the step follows its task.
  if (steps.some((s) => s.task_id)) {
    const linked = await base44.entities.Task.filter({ goal_id: goal.id }, "-created_date", 300).catch(() => []);
    const byId = new Map((linked || []).map((t) => [t.id, t]));
    let fixed = false;
    for (const s of steps) {
      const t = s.task_id ? byId.get(s.task_id) : null;
      if (!t || t.goal_step_id !== s.id || (t.recurrence_pattern && t.recurrence_pattern !== "none")) continue;
      if (t.status === "completed" && isStepOpen(s)) {
        await base44.entities.GoalStep.update(s.id, { status: "completed", completed_at: t.completed_at || new Date().toISOString() });
        fixed = true;
      } else if (t.status === "active" && s.status === "completed") {
        await base44.entities.GoalStep.update(s.id, { status: "pending", completed_at: null });
        fixed = true;
      }
    }
    if (fixed) {
      changed = true;
      steps = sortSteps(await base44.entities.GoalStep.filter({ goal_id: goal.id }, "order_index", 1000));
    }
  }

  // Checked off after its week ended: the weeks after it move later, so the
  // next one starts the day after (before its task is made, so the task gets
  // the new date).
  const shift = lateFinishShift(steps);
  if (shift) {
    await applyLateShift(goal, shift, steps, habit);
    changed = true;
    steps = sortSteps(await base44.entities.GoalStep.filter({ goal_id: goal.id }, "order_index", 1000));
    open = await openGoalTasks(goal.id);
  }

  const current = goalStarted(goal, today) ? currentStep(goal, steps, today) : null;
  if (!current) {
    // Every step done (the last one just finished): nothing stays open.
    if (steps.length > 0 && !steps.some(isStepOpen)) {
      for (const t of open) { await closeOutTask(t); changed = true; }
    }
    return changed;
  }

  // A daily-practice goal's repeating task from before Nov 1 2026: untouched,
  // it becomes the current step's weekly task (changed in place, nothing
  // deleted); one the person changed stays exactly as it is, and the step
  // gets its weekly task alongside it.
  let hasWeekly = open.some((x) => !isRepeatingTask(x));
  for (const t of open.filter(isRepeatingTask)) {
    const itsStep = steps.find((s) => s.id === t.goal_step_id) || null;
    if (untouched(t, itsStep) && !hasWeekly) {
      await retargetTask(t, goal, current, steps, habit, itsStep);
      hasWeekly = true;
      if (itsStep && itsStep.id !== current.id && itsStep.task_id === t.id) await base44.entities.GoalStep.update(itsStep.id, { task_id: null });
      changed = true;
    } else {
      console.warn(`[GoalStepSync] goal ${goal.id}: an old repeating task (${t.id}) the person changed is left as is`);
    }
  }
  open = await weeklyTasks(goal.id);

  // The one task to keep: the current step's, else the oldest open one, which
  // then moves to the current step.
  let keep = open.find((t) => t.goal_step_id === current.id)
    || [...open].sort(byCreated)[0]
    || null;

  for (const extra of open) {
    if (!keep || extra.id === keep.id) continue;
    const itsStep = steps.find((s) => s.id === extra.goal_step_id) || null;
    if (untouched(extra, itsStep)) {
      if (itsStep && itsStep.task_id === extra.id) await base44.entities.GoalStep.update(itsStep.id, { task_id: null });
      await deleteLinkedTask(extra);
      changed = true;
    } else {
      console.warn(`[GoalStepSync] goal ${goal.id} has a second open task (${extra.id}) the person changed; left as is`);
    }
  }

  if (keep) {
    if (keep.goal_step_id !== current.id) {
      const oldStep = steps.find((s) => s.id === keep.goal_step_id) || null;
      await retargetTask(keep, goal, current, steps, habit, oldStep);
      if (oldStep && oldStep.task_id === keep.id) await base44.entities.GoalStep.update(oldStep.id, { task_id: null });
      changed = true;
    } else {
      const line = goalContextLine(goal, current, steps, habit);
      if (keep.goal_context !== line) await base44.entities.Task.update(keep.id, { goal_context: line });
    }
    if (current.task_id !== keep.id || current.task_dismissed || current.task_claim) {
      await base44.entities.GoalStep.update(current.id, { task_id: keep.id, task_dismissed: false, task_claim: null });
      changed = true;
    }
    return changed;
  }

  // No open task for the goal.
  if (current.task_dismissed) return changed;
  if (current.task_id) {
    const t = (await base44.entities.Task.filter({ id: current.task_id }).catch(() => null))?.[0] || null;
    if (!t) {
      // They deleted it (onTaskUpdate normally marks this already).
      await base44.entities.GoalStep.update(current.id, { task_dismissed: true, task_id: null });
      return true;
    }
    if (t.status !== "completed") {
      // An old repeating task the person changed (left as is): the step
      // still gets its weekly task.
      if (!isRepeatingTask(t)) return changed;
      await base44.entities.GoalStep.update(current.id, { task_id: null });
      current.task_id = null;
      if (await makeTaskForStep(goal, current, steps, user, habit)) changed = true;
      return changed;
    }
    // Checked off when the goal was marked done (no longer this step's): the
    // goal was reopened, so the step gets a fresh task.
    const closedOut = t.goal_step_id !== current.id;
    // The step's task finished: the step is marked done above or by
    // onTaskUpdate. An old repeating copy finished without its next copy:
    // wait two minutes (the copy may be on its way), then make a fresh one.
    if (!closedOut && !isRepeatingTask(t)) return changed;
    const doneMs = Date.parse(t.completed_at || t.updated_date || "");
    if (!closedOut && Number.isFinite(doneMs) && Date.now() - doneMs < 2 * 60 * 1000) return changed;
    await base44.entities.GoalStep.update(current.id, { task_id: null });
    current.task_id = null;
  }
  if (await makeTaskForStep(goal, current, steps, user, habit)) changed = true;
  return changed;
}

let running = null;
let again = false;
let lastRunAt = 0;

export function lastGoalSyncAt() {
  return lastRunAt;
}

export function runGoalSync(user) {
  if (!goalsEnabled(user)) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const today = todayKey();
        // Never a goal being deleted on this phone (it would get a new task).
        const goals = liveGoals(await base44.entities.Goal.list("-created_date", 100));
        let changed = false;
        for (const goal of goals) {
          try {
            if (await syncGoal(goal, user, today)) changed = true;
          } catch (e) {
            console.error("[GoalStepSync] goal", goal?.id, e);
          }
        }
        if (changed) notifyGoalsChanged(true);
      } while (again);
    } catch (e) {
      console.error("[GoalStepSync] failed:", e);
    } finally {
      lastRunAt = Date.now();
      running = null;
    }
  })();
  return running;
}

export default function GoalStepSync({ user }) {
  const location = useLocation();
  const enabled = goalsEnabled(user);
  const email = user?.email || "";

  useEffect(() => {
    if (!enabled) return undefined;
    runGoalSync(user);
    let timer = null;
    const later = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => runGoalSync(user), ms);
    };
    const onVisible = () => { if (document.visibilityState === "visible") later(1500); };
    const onGoals = (e) => { if (!e?.detail?.fromSync) later(800); };
    // After a check-off: past its 5-second Undo, so an undone finish never
    // gets its next step made.
    const onTasks = () => later(8000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(GOALS_CHANGED, onGoals);
    window.addEventListener("task-done", onTasks);
    window.addEventListener("tasks-changed", onTasks);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(GOALS_CHANGED, onGoals);
      window.removeEventListener("task-done", onTasks);
      window.removeEventListener("tasks-changed", onTasks);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, email]);

  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - lastRunAt > 10 * 1000 && !running) runGoalSync(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}
