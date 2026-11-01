import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Calendar, CheckCircle2, Clock, Trash2, ChevronDown, History, ListTodo, Plus, Pause, Play, Flag, RotateCcw, MessageCircle, Pencil } from "lucide-react";
import { linkFreeText } from "@/components/goals/LinkedText";
import { openInBrowser } from "@/components/utils/openInBrowser";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import GoalsGate from "@/components/goals/GoalsGate";
import StepDetailsModal from "@/components/goals/StepDetailsModal";
import StepFeedbackPopup from "@/components/goals/StepFeedbackPopup";
import HabitCheckInModal from "@/components/goals/HabitCheckInModal";
import HabitWeekTracker from "@/components/goals/HabitWeekTracker";
import MonthCelebrationModal from "@/components/goals/MonthCelebrationModal";
import WeekCelebrationModal from "@/components/goals/WeekCelebrationModal";
import { useGoalTheme, goalLook, dialogLook } from "@/components/goals/goalsTheme";
import { runGoalSync } from "@/components/goals/GoalStepSync";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { getLocalDateString } from "@/components/utils/todayTasks";
import {
  GOALS_CHANGED, notifyGoalsChanged, sortSteps, isHabitGoal, currentStep, goalStarted, isHabitDay, todayKey,
  openGoalTasks, finishLinkedTask, unfinishLinkedTask, pauseGoal, resumeGoal, completeGoal, reopenGoal, deleteGoal,
  shortNotes,
} from "@/components/goals/goalLogic";
import { stepWeek, trackerDays, planBehind, behindText, fmtDay } from "@/components/goals/goalWeeks";

// "How did it go?" (StepFeedbackPopup): a step finished somewhere else (its
// task checked off on the task list) is asked about the next time its goal
// opens, if it finished in the last 3 days and was never asked.
const FEEDBACK_ASK_WITHIN_MS = 3 * 24 * 60 * 60 * 1000;

// "Weeks 2–4" when the changed weeks run in a row in one month, else a count.
function weeksLabel(changed) {
  const parts = changed.map((c) => ({
    m: parseInt(String(c.phase || "").match(/Month\s*(\d+)/i)?.[1] || "0", 10),
    w: parseInt(String(c.phase || "").match(/Week\s*(\d+)/i)?.[1] || "0", 10),
  }));
  const sameMonth = parts.length > 0 && parts.every((p) => p.m && p.w && p.m === parts[0].m);
  if (sameMonth) {
    const ws = [...new Set(parts.map((p) => p.w))].sort((a, b) => a - b);
    const inARow = ws.every((w, i) => i === 0 || w === ws[i - 1] + 1);
    if (ws.length === 1) return `week ${ws[0]}`;
    if (inARow) return `weeks ${ws[0]}–${ws[ws.length - 1]}`;
  }
  return `${changed.length} upcoming week${changed.length === 1 ? "" : "s"}`;
}

// A goal's page (ported Oct 31 2026 from Anna's Goals app, GoalDetail.jsx;
// GOALS_PORT.md): the plan by month and week, progress, step details, habit
// check-ins and this week's tracker, completion history, notes, and the
// week/month celebrations. In ADHDone the current step also says where it is
// on the task list ("On your task list", or "Add this step to my tasks" after
// its task was deleted), checking a step off here checks its task off too,
// and the goal can be paused, marked done or reopened.

const repeating = (t) => !!t?.recurrence_pattern && t.recurrence_pattern !== "none";
const keyOf = (v) => (v ? getLocalDateString(new Date(v)) : null);
const copyDay = (t) => keyOf(t.day_only_task ? (t.due_date || t.next_reminder) : (t.next_reminder || t.due_date));

export default function GoalDetailPage() {
  return (
    <GoalsGate>
      <GoalDetail />
    </GoalsGate>
  );
}

function StepRow({ step, L, isHabit, isCurrent, goal, openTask, doneDays, busy, canCheckIn, week, tracker, onOpen, onToggle, onRename, onCheckIn, onToggleDay, onAddToTasks, onOpenTask }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(step.title);
  const done = step.status === "completed";
  const save = async () => {
    const trimmed = editText.trim();
    setEditing(false);
    if (!trimmed || trimmed === step.title) { setEditText(step.title); return; }
    await onRename(step, trimmed);
  };
  const today = todayKey();
  const showTaskLine = isCurrent && !done && goal.status === "active";
  return (
    <div className={`rounded-lg border overflow-hidden ${done ? L.rowDone : L.row}`}>
      <div className="flex items-start gap-3 p-3">
        <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={done} disabled={busy} onCheckedChange={() => onToggle(step)} aria-label={done ? "Mark not done" : "Mark done"} />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                autoFocus
                className={`flex-1 min-w-0 text-sm border rounded px-2 py-0.5 focus:outline-none ${L.input}`}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setEditText(step.title); } }}
              />
              <button onClick={save} className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded">Save</button>
              <button onClick={() => { setEditing(false); setEditText(step.title); }} className={`text-xs px-1 ${L.muted}`} aria-label="Cancel">✕</button>
            </div>
          ) : (
            <button onClick={() => onOpen(step)} className="w-full text-left">
              {/* Tapping the title renames it right here; the tiny pencil says
                  so (Anna, Nov 1 2026: "should have a tiny pencil next to it
                  since that line is clickable for inline editing"). */}
              <h4
                className={`font-medium text-sm cursor-pointer break-words ${done ? `line-through ${L.muted}` : L.title}`}
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                title="Tap to edit"
              >
                {step.title}
                <Pencil className={`inline-block w-3 h-3 ml-1.5 -mt-0.5 align-middle opacity-60 ${L.muted}`} aria-hidden="true" />
              </h4>
              {step.description && (
                <p className={`text-xs mt-1 line-clamp-2 break-words [overflow-wrap:anywhere] ${L.muted}`}>{linkFreeText(step.description)}</p>
              )}
            </button>
          )}
          {showTaskLine && (
            goalStarted(goal, today) ? (
              openTask ? (
                <button onClick={() => onOpenTask(openTask)} className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${L.accent}`}>
                  <ListTodo className="w-3 h-3" /> On your task list
                </button>
              ) : step.task_dismissed ? (
                <button onClick={() => onAddToTasks(step)} disabled={busy} className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${L.accent}`}>
                  <Plus className="w-3 h-3" /> Add this step to my tasks
                </button>
              ) : null
            ) : (
              <p className={`mt-1.5 text-[11px] ${L.muted}`}>On your task list from {new Date(`${goal.start_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            )
          )}
          {/* Its week is over and it isn't checked off: it stays (Anna, Nov 1
              2026: "It stays until checked off"), and checking it off moves
              the weeks after it (goalWeeks.lateFinishShift). */}
          {showTaskLine && week && today > week.end && (
            <p className={`mt-1.5 text-[11px] ${L.muted}`}>This week was due {fmtDay(week.end)}. When you check it off, the weeks after it move to start the next day.</p>
          )}
        </div>
      </div>
      {isHabit && !done && <HabitWeekTracker tracker={tracker} doneDays={doneDays} onToggleDay={(d) => onToggleDay(step, d)} busy={busy} L={L} />}
      {isHabit && !done && canCheckIn && tracker?.hasToday && !doneDays.has(today) && (
        <button
          onClick={(e) => { e.stopPropagation(); onCheckIn(step); }}
          className={`w-full text-center py-2 text-xs font-semibold border-t ${L.accent} ${L.dark ? "border-gray-700" : "border-gray-200"}`}
        >
          ✅ Did you do it today? Tap to check in
        </button>
      )}
    </div>
  );
}

function GoalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, specialMode } = useGoalTheme();
  const L = goalLook(theme, specialMode);
  const D = dialogLook(theme, specialMode);
  const [goal, setGoal] = useState(null);
  const [steps, setSteps] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [doneTasks, setDoneTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [selectedStep, setSelectedStep] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [habitCheckInStep, setHabitCheckInStep] = useState(null);
  const [celebrationMonth, setCelebrationMonth] = useState(null);
  const [celebrationSteps, setCelebrationSteps] = useState([]);
  const [celebrationWeek, setCelebrationWeek] = useState(null);
  const [busy, setBusy] = useState(false);
  // The step "How did it go?" is about. Latched: set once when earned,
  // cleared only when the popup is answered or skipped.
  const [feedbackStep, setFeedbackStep] = useState(null);
  const feedbackShown = usePopupTurn(feedbackStep != null, { reactive: true });
  const openedOnce = useRef(false);
  const closeWeek = useCallback(() => setCelebrationWeek(null), []);
  const closeMonth = useCallback(() => setCelebrationMonth(null), []);

  // Celebrations open on their own after a check-off: one popup at a time.
  // Latched: set once when earned, cleared only when closed.
  const weekShown = usePopupTurn(celebrationWeek != null, { reactive: true });
  const monthShown = usePopupTurn(celebrationMonth != null, { reactive: true });

  const loadData = useCallback(async () => {
    try {
      const target = (await base44.entities.Goal.filter({ id }))?.[0];
      if (!target) { navigate("/Goals"); return null; }
      const [stepRows, open, done] = await Promise.all([
        base44.entities.GoalStep.filter({ goal_id: id }, "order_index", 1000),
        openGoalTasks(id).catch(() => []),
        base44.entities.Task.filter({ goal_id: id, status: "completed" }, "-completed_at", 400).catch(() => []),
      ]);
      const ordered = sortSteps(stepRows);
      setGoal(target);
      setSteps(ordered);
      setOpenTasks(open || []);
      setDoneTasks(done || []);
      if (!openedOnce.current) {
        // A step finished on the task list since they were last here: ask how
        // it went (once; the newest one if there are several).
        const nowMs = Date.now();
        const unasked = ordered
          .filter((s) => s.status === "completed" && !s.feedback_asked_at && !s.feedback)
          .filter((s) => { const at = Date.parse(s.completed_at || ""); return Number.isFinite(at) && nowMs - at <= FEEDBACK_ASK_WITHIN_MS; })
          .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
        if (unasked[0]) setFeedbackStep((curStep) => curStep || unasked[0]);
        // Open on the step they're on.
        openedOnce.current = true;
        const cur = currentStep(target, ordered);
        const mm = cur?.phase?.match(/Month\s*(\d+)/i);
        const ww = cur?.phase?.match(/Week\s*(\d+)/i);
        if (mm) {
          const mk = `Month ${parseInt(mm[1], 10)}`;
          setExpandedPhases({ [mk]: true, ...(ww ? { [`${mk}-Week ${parseInt(ww[1], 10)}`]: true } : {}) });
        }
      }
      return ordered;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener(GOALS_CHANGED, onChange);
    return () => window.removeEventListener(GOALS_CHANGED, onChange);
  }, [loadData]);

  // After a change here: the task list catches up (GoalStepSync), then this page.
  const settle = async () => {
    notifyGoalsChanged();
    if (user) await runGoalSync(user);
    return loadData();
  };

  const habit = goal ? isHabitGoal(goal, steps) : false;
  const cur = goal ? currentStep(goal, steps) : null;

  const taskDaysFor = (stepId) => {
    const set = new Set();
    for (const t of doneTasks) {
      if (t.goal_step_id === stepId && repeating(t) && t.completed_at) set.add(keyOf(t.completed_at));
    }
    return set;
  };
  const doneDaysFor = (step) => {
    const set = taskDaysFor(step.id);
    for (const d of step.habit_completions || []) set.add(d);
    return set;
  };

  const toggleStepStatus = async (step) => {
    if (busy) return;
    setBusy(true);
    try {
      const completing = step.status !== "completed";
      if (completing) {
        // Its task is checked off too (a habit's repeating task moves on to
        // the next step instead).
        const t = openTasks.find((x) => x.goal_step_id === step.id && !repeating(x));
        if (t) await finishLinkedTask(t);
        await base44.entities.GoalStep.update(step.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
        });
        // Ask how it went (Anna, Nov 1 2026), once per step.
        if (!step.feedback_asked_at && !step.feedback) setFeedbackStep((curStep) => curStep || step);
      } else {
        // Back to not done. Its old task stays checked off; the goal's open
        // task moves to whichever step is now current.
        await base44.entities.GoalStep.update(step.id, { status: "pending", completed_at: null, task_id: null });
      }
      const fresh = (await settle()) || [];
      if (completing && step.phase) {
        const weekMatch = step.phase.match(/Week\s*(\d+)/i);
        const monthMatch = step.phase.match(/Month\s*(\d+)/i);
        if (weekMatch && monthMatch) {
          const weekNum = parseInt(weekMatch[1], 10);
          const monthNum = parseInt(monthMatch[1], 10);
          const inMonth = (s) => s.phase && new RegExp(`Month\\s*${monthNum}\\b`, "i").test(s.phase);
          const inWeek = (s, w) => new RegExp(`Week\\s*${w}\\b`, "i").test(s.phase || "");
          if (weekNum >= 1 && weekNum <= 3) {
            const weekSteps = fresh.filter((s) => inMonth(s) && inWeek(s, weekNum));
            if (weekSteps.length > 0 && weekSteps.every((s) => s.status === "completed")) setCelebrationWeek(weekNum);
          }
          if (weekNum === 4) {
            const week4 = fresh.filter((s) => inMonth(s) && inWeek(s, 4));
            if (week4.length > 0 && week4.every((s) => s.status === "completed")) {
              setCelebrationSteps(fresh.filter((s) => inMonth(s) && s.status === "completed"));
              setCelebrationMonth(monthNum);
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't save that step", description: "Check your connection and try again.", variant: "destructive" });
      loadData();
    } finally {
      setBusy(false);
    }
  };

  // After "How did it go?": the planner reads it and may rewrite the weeks
  // ahead (goalPlannerChat step_feedback). The popup has closed by now; this
  // runs on its own, then the page and the task list catch up.
  const feedbackDone = async (result) => {
    const step = feedbackStep;
    setFeedbackStep(null);
    if (!result?.saved || !step || !goal) return;
    toast({ title: "Thanks! Looking at the weeks ahead…" });
    try {
      const res = await base44.functions.invoke("goalPlannerChat", {
        mode: "step_feedback",
        goal_id: goal.id,
        step_id: step.id,
        feedback: result.feedback,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const data = res?.data || {};
      if (data.error) throw new Error(data.error);
      const changed = Array.isArray(data.changed) ? data.changed : [];
      if (changed.length) {
        await carryToTasks(changed);
        toast({ title: `Updated ${weeksLabel(changed)} after your feedback`, description: data.summary });
      } else {
        toast({ title: "Your plan stays as it is", description: data.summary });
      }
    } catch (e) {
      console.error("[GoalDetail] feedback adjust failed:", e);
      toast({ title: "Your feedback is saved", description: "Couldn't adjust the weeks ahead right now." });
    }
    await settle();
  };

  // A rewritten step's open task gets its new name and note, unless they
  // changed those themselves (then theirs stay).
  const carryToTasks = async (changed) => {
    try {
      const open = await openGoalTasks(goal.id).catch(() => []);
      for (const c of changed) {
        const t = (open || []).find((x) => x.goal_step_id === c.id);
        if (!t) continue;
        if (c.title && c.title !== c.old_title && (t.title || "").trim() === String(c.old_title || "").trim()) {
          const { saveTaskTitle } = await import("@/components/utils/multiReminderScheduler");
          await saveTaskTitle(t, c.title);
        }
        if ((t.notes || "") === shortNotes(c.old_description)) {
          await base44.entities.Task.update(t.id, { notes: shortNotes(c.description) });
        }
      }
    } catch (e) {
      console.error("[GoalDetail] couldn't carry the new step words to its task:", e);
    }
  };

  const renameStep = async (step, title) => {
    try {
      await base44.entities.GoalStep.update(step.id, { title });
      const t = openTasks.find((x) => x.goal_step_id === step.id);
      if (t && (t.title || "").trim() === String(step.title || "").trim()) {
        const { saveTaskTitle } = await import("@/components/utils/multiReminderScheduler");
        await saveTaskTitle(t, title);
      }
      await settle();
    } catch (e) {
      toast({ title: "Couldn't rename that step", variant: "destructive" });
    }
  };

  const checkIn = async (step, didIt, notes) => {
    const today = todayKey();
    const updates = { last_habit_checkin_date: today };
    if (notes) updates.notes = (step.notes ? step.notes + "\n\n" : "") + `[${today}] ${notes}`;
    if (didIt) {
      const copy = openTasks.find((t) => t.goal_step_id === step.id && repeating(t) && (copyDay(t) || today) <= today);
      if (copy) await finishLinkedTask(copy);
      const existing = step.habit_completions || [];
      if (!existing.includes(today)) updates.habit_completions = [...existing, today];
    }
    await base44.entities.GoalStep.update(step.id, updates);
    await settle();
  };

  const toggleDay = async (step, dateStr) => {
    if (busy) return;
    setBusy(true);
    try {
      const today = todayKey();
      const fromTask = taskDaysFor(step.id).has(dateStr);
      const manual = (step.habit_completions || []).includes(dateStr);
      if (dateStr === today) {
        if (!fromTask && !manual) {
          await checkIn(step, true, "");
          return;
        }
        if (fromTask) {
          const copy = doneTasks.find((t) => t.goal_step_id === step.id && repeating(t) && keyOf(t.completed_at) === today);
          if (copy) await unfinishLinkedTask(copy);
        }
        if (manual) await base44.entities.GoalStep.update(step.id, { habit_completions: (step.habit_completions || []).filter((d) => d !== dateStr) });
      } else {
        if (fromTask && !manual) return; // finished that day on the task list
        const next = manual
          ? (step.habit_completions || []).filter((d) => d !== dateStr)
          : [...(step.habit_completions || []), dateStr];
        await base44.entities.GoalStep.update(step.id, { habit_completions: next });
      }
      await settle();
    } catch (e) {
      toast({ title: "Couldn't save that day", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addToTasks = async (step) => {
    setBusy(true);
    try {
      await base44.entities.GoalStep.update(step.id, { task_dismissed: false, task_id: null, task_claim: null });
      await settle();
    } catch (e) {
      toast({ title: "Couldn't add it", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (fn, message) => {
    if (busy || !goal) return;
    setBusy(true);
    try {
      await fn(goal);
      toast({ title: message });
      await settle();
    } catch (e) {
      toast({ title: "Couldn't change the goal", description: "Try again in a moment.", variant: "destructive" });
      loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    const g = goal;
    setShowDeleteConfirm(false);
    navigate("/Goals");
    toast({ title: "Goal deleted", description: `"${g.title}" has been removed.` });
    deleteGoal(g).catch((err) => console.error("Goal delete failed:", err));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
      </div>
    );
  }
  if (!goal) return null;

  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const allDone = steps.length > 0 && completedSteps === steps.length;
  const habitToday = isHabitDay(goal);
  // Weeks checked off late moved the plan past their deadline (target_date).
  const behind = goal.status === "active" ? planBehind(goal, steps) : null;
  const movedLate = steps.some((s) => (Number(s.finished_days_late) || 0) > 0);
  // A week's or month's dates from its steps' own weeks (they move when a
  // week is checked off late); the old count from the start date otherwise.
  const rangeOf = (list) => {
    let a = null;
    let b = null;
    for (const s of list || []) {
      const w = stepWeek(s, steps);
      if (!w) continue;
      if (!a || w.start < a) a = w.start;
      if (!b || w.end > b) b = w.end;
    }
    return a ? `${fmtDay(a)} – ${fmtDay(b)}` : null;
  };

  // Month → week → steps, titles from goal.month_titles (as in the Goals app).
  const monthsMap = {};
  const weekTitles = {};
  steps.forEach((s) => {
    const phase = s.phase || "";
    const monthMatch = phase.match(/Month\s*(\d+)/i);
    const weekMatch = phase.match(/Week\s*(\d+)/i);
    if (!monthMatch) return;
    const monthKey = `Month ${parseInt(monthMatch[1], 10)}`;
    const weekKey = weekMatch ? `Week ${parseInt(weekMatch[1], 10)}` : null;
    if (!monthsMap[monthKey]) monthsMap[monthKey] = {};
    const bucket = weekKey || "_month";
    if (!monthsMap[monthKey][bucket]) monthsMap[monthKey][bucket] = [];
    monthsMap[monthKey][bucket].push(s);
    if (weekKey && !weekTitles[`${monthKey}-${weekKey}`] && s.description) {
      const firstLine = s.description.split("\n")[0].trim();
      if (firstLine && !/^week/i.test(firstLine)) weekTitles[`${monthKey}-${weekKey}`] = firstLine;
    }
  });
  const monthTitles = {};
  if (goal.month_titles) Object.entries(goal.month_titles).forEach(([n, t]) => { monthTitles[`Month ${n}`] = t; });
  const monthSort = (a, b) => {
    const n = (k) => { const m = k.match(/(\d+)/); return m ? parseInt(m[1], 10) : 999; };
    return n(a) - n(b);
  };
  const sortedMonths = Object.keys(monthsMap).sort(monthSort);

  const goalStart = goal.start_date ? new Date(goal.start_date + "T00:00:00Z") : null;
  const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const monthDateRange = (monthNum) => {
    if (!goalStart) return null;
    const start = new Date(goalStart);
    start.setUTCMonth(start.getUTCMonth() + (monthNum - 1));
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return `${fmtShort(start)} – ${fmtShort(end)}`;
  };
  const weekDateRange = (monthNum, weekNum) => {
    if (!goalStart) return null;
    const start = new Date(goalStart);
    start.setUTCMonth(start.getUTCMonth() + (monthNum - 1));
    start.setUTCDate(start.getUTCDate() + (weekNum - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${fmtShort(start)} – ${fmtShort(end)}`;
  };

  const rowProps = (step) => ({
    step,
    L,
    goal,
    busy,
    isHabit: step.is_daily_habit === true || habit,
    isCurrent: cur?.id === step.id,
    openTask: openTasks.find((t) => t.goal_step_id === step.id) || null,
    doneDays: doneDaysFor(step),
    week: stepWeek(step, steps),
    tracker: trackerDays(step, steps, todayKey(), { current: cur?.id === step.id }),
    canCheckIn: cur?.id === step.id && goal.status === "active" && habitToday && goalStarted(goal),
    onOpen: (s) => setSelectedStep(s),
    onToggle: toggleStepStatus,
    onRename: renameStep,
    onCheckIn: (s) => setHabitCheckInStep(s),
    onToggleDay: toggleDay,
    onAddToTasks: addToTasks,
    onOpenTask: (t) => navigate(`/Tasks?taskId=${t.id}`),
  });

  return (
    <div className="min-h-full pb-32 px-4 pt-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate("/Goals")} className={`mb-4 flex items-center gap-1.5 text-sm font-semibold ${L.accent}`}>
          <ArrowLeft className="w-4 h-4" /> Back to Goals
        </button>

        <div className={`rounded-2xl p-5 sm:p-6 mb-6 ${L.card}`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h1 className={`text-2xl font-bold mb-2 break-words ${L.title}`}>{goal.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${L.chip}`}>{goal.category}</span>
                {goal.start_date && (
                  <span className={`flex items-center gap-1 text-xs ${L.muted}`}>
                    <Calendar className="w-3 h-3" /> Starts {new Date(goal.start_date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                  </span>
                )}
                {goal.timeline && (
                  <span className={`flex items-center gap-1 text-xs ${L.muted}`}>
                    <Clock className="w-3 h-3" /> {goal.timeline}
                  </span>
                )}
                {goal.status && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${goal.status === "active" ? (L.dark ? "bg-blue-900/40 text-blue-200" : "bg-blue-100 text-blue-700") : (L.dark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700")}`}>
                    {goal.status}
                  </span>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)} className={`flex-shrink-0 ${L.outline} ${L.danger}`} aria-label="Delete goal">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {goal.plan_summary && (
            <p className={`mb-4 leading-relaxed whitespace-pre-wrap ${L.text}`}>
              {goal.plan_summary.split(/(\[Click here\]|\(https?:\/\/[^)]+\))/g).map((part, idx) => {
                const urlMatch = part.match(/\(https?:\/\/([^)]+)\)/);
                if (urlMatch) {
                  const href = `https://${urlMatch[1]}`;
                  return (
                    <a key={idx} href={href} onClick={(e) => { e.preventDefault(); openInBrowser(href); }} className={`hover:underline font-semibold ${L.accent}`}>
                      {part}
                    </a>
                  );
                }
                return part;
              })}
            </p>
          )}

          {steps.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold ${L.text}`}>{completedSteps} of {steps.length} steps done</span>
                <span className={`text-sm font-bold ${L.accent}`}>{progress}%</span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${L.track}`}>
                <div className={`h-full transition-all duration-500 ${L.fill}`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {behind && (
            <div className={`mt-4 border rounded-xl p-3 ${L.tip}`}>
              <p className="text-sm font-semibold">{behindText(behind)}</p>
              <p className="text-xs mt-1">
                {movedLate ? "Weeks checked off late moved the rest of the plan later. " : ""}The plan now ends {fmtDay(behind.finish, true)}. You can change the plan to fit your deadline, or keep going at your own pace.
              </p>
              <Button size="sm" disabled={busy} className={`mt-2 rounded-xl text-xs ${L.primary}`} onClick={() => navigate(`/Planner?edit=${goal.id}`)}>
                <MessageCircle className="w-3.5 h-3.5 mr-1" /> Change this plan
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {/* Back to the planner chat this goal was made in, to change the
                plan (Anna, Nov 1 2026: "remind the user they can come back to
                this chat to edit their goal. (make sure that works.)"). The
                port had no way back: /Planner?edit= existed but nothing
                opened it. */}
            {(goal.status === "active" || goal.status === "paused") && (
              <Button size="sm" disabled={busy} className={`rounded-xl text-xs ${L.primary}`} onClick={() => navigate(`/Planner?edit=${goal.id}`)}>
                <MessageCircle className="w-3.5 h-3.5 mr-1" /> Change this plan
              </Button>
            )}
            {goal.status === "active" && (
              <>
                <Button size="sm" variant="outline" disabled={busy} className={`rounded-xl text-xs ${L.outline}`} onClick={() => changeStatus(pauseGoal, "Goal paused")}>
                  <Pause className="w-3.5 h-3.5 mr-1" /> Pause goal
                </Button>
                <Button size="sm" variant={allDone ? "default" : "outline"} disabled={busy} className={`rounded-xl text-xs ${allDone ? L.primary : L.outline}`} onClick={() => changeStatus(completeGoal, "Goal done! 🎉")}>
                  <Flag className="w-3.5 h-3.5 mr-1" /> Mark goal done
                </Button>
              </>
            )}
            {goal.status === "paused" && (
              <Button size="sm" disabled={busy} className={`rounded-xl text-xs ${L.primary}`} onClick={() => changeStatus(resumeGoal, "Goal resumed")}>
                <Play className="w-3.5 h-3.5 mr-1" /> Resume goal
              </Button>
            )}
            {goal.status === "completed" && (
              <Button size="sm" variant="outline" disabled={busy} className={`rounded-xl text-xs ${L.outline}`} onClick={() => changeStatus(reopenGoal, "Goal reopened")}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen goal
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {sortedMonths.map((monthKey) => {
            const monthNum = parseInt(monthKey.match(/\d+/)?.[0] || 0);
            const weeksMap = monthsMap[monthKey];
            const allMonthSteps = Object.values(weeksMap).flat();
            const isMonthOpen = expandedPhases[monthKey];
            const sortedWeeks = Object.keys(weeksMap).filter((w) => w !== "_month").sort(monthSort);
            const monthOnlySteps = weeksMap._month || [];
            const monthRange = rangeOf(allMonthSteps) || monthDateRange(monthNum);
            return (
              <div key={monthKey} className={`rounded-xl overflow-hidden ${L.card}`}>
                <button onClick={() => setExpandedPhases((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }))} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="w-1.5 h-5 bg-violet-500 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className={`text-sm font-bold ${L.title}`}>{monthKey}</h3>
                      {monthRange && <span className={`text-[10px] flex-shrink-0 ${L.muted}`}>{monthRange}</span>}
                    </div>
                    {monthTitles[monthKey] && <p className={`text-xs mt-0.5 ${L.accent}`}>— {String(monthTitles[monthKey]).replace(/\*+/g, "").trim()}</p>}
                  </div>
                  <span className={`text-xs mr-2 ${L.muted}`}>{allMonthSteps.filter((s) => s.status === "completed").length}/{allMonthSteps.length}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${L.muted} ${isMonthOpen ? "rotate-180" : ""}`} />
                </button>
                {isMonthOpen && (
                  <div className={`border-t px-3 py-2 space-y-2 ${L.panel}`}>
                    {monthOnlySteps.map((step) => <StepRow key={step.id} {...rowProps(step)} />)}
                    {sortedWeeks.map((weekKey) => {
                      const weekSteps = weeksMap[weekKey];
                      const weekId = `${monthKey}-${weekKey}`;
                      const isWeekOpen = expandedPhases[weekId];
                      const weekNum = parseInt(weekKey.match(/\d+/)?.[0] || 0);
                      const weekRange = rangeOf(weekSteps) || weekDateRange(monthNum, weekNum);
                      return (
                        <div key={weekKey} className={`rounded-lg border overflow-hidden ${L.row}`}>
                          <button onClick={() => setExpandedPhases((prev) => ({ ...prev, [weekId]: !prev[weekId] }))} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                            <div className="w-1 h-4 bg-indigo-300 rounded-full flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className={`text-xs font-semibold flex-shrink-0 ${L.text}`}>{weekKey}</span>
                                {weekTitles[weekId] && <span className={`text-xs truncate ${L.muted}`}>— {weekTitles[weekId]}</span>}
                              </div>
                              {isWeekOpen && weekRange && <span className={`text-[10px] ${L.muted}`}>{weekRange}</span>}
                            </div>
                            <span className={`text-xs mr-2 ${L.muted}`}>{weekSteps.filter((s) => s.status === "completed").length}/{weekSteps.length}</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${L.muted} ${isWeekOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isWeekOpen && (
                            <div className={`border-t px-2 py-2 space-y-2 ${L.dark ? "border-gray-700" : "border-gray-200"}`}>
                              {weekSteps.map((step) => <StepRow key={step.id} {...rowProps(step)} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {steps.length === 0 && (
            <div className={`rounded-xl p-6 text-center ${L.card}`}>
              <p className={`text-sm ${L.muted}`}>No steps yet.</p>
            </div>
          )}
        </div>

        {steps.some((s) => s.completed_at && s.status === "completed") && (
          <div className={`mt-8 pt-6 border-t ${L.dark ? "border-gray-700" : "border-gray-200"}`}>
            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${L.title}`}>
              <History className="w-4 h-4 text-violet-500" />
              Completion History
            </h3>
            <div className="space-y-2">
              {steps
                .filter((s) => s.completed_at && s.status === "completed")
                .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
                .map((step) => (
                  <div key={step.id} className={`flex items-start gap-3 p-3 rounded-lg border ${L.rowDone}`}>
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${L.title}`}>{step.title}</p>
                      <p className={`text-xs mt-1 ${L.muted}`}>
                        Completed {new Date(step.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {goal.notes && (
          <div className={`mt-6 border rounded-xl p-4 ${L.tip}`}>
            <p className="text-xs font-semibold mb-2">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{goal.notes}</p>
          </div>
        )}

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className={`w-[calc(100vw-2rem)] max-w-sm rounded-2xl ${D.surface}`}>
            <DialogHeader>
              <DialogTitle className={D.title}>Delete this goal?</DialogTitle>
              <DialogDescription className={`mt-1 ${D.muted}`}>
                This will permanently delete <span className={`font-semibold ${D.title}`}>"{goal.title}"</span>, all its steps, and its step on your task list. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 mt-2">
              <Button onClick={handleDelete} className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white">Delete</Button>
            </div>
          </DialogContent>
        </Dialog>

        <StepDetailsModal
          key={selectedStep?.id || "none"}
          step={selectedStep}
          isOpen={!!selectedStep}
          onClose={() => setSelectedStep(null)}
          onUpdate={loadData}
          onRename={renameStep}
          theme={theme}
          specialMode={specialMode}
        />

        <StepFeedbackPopup
          step={feedbackStep}
          open={feedbackShown}
          onDone={feedbackDone}
          theme={theme}
          specialMode={specialMode}
        />

        <HabitCheckInModal
          key={habitCheckInStep?.id || "none-checkin"}
          step={habitCheckInStep}
          onClose={() => setHabitCheckInStep(null)}
          onCheckIn={checkIn}
          theme={theme}
          specialMode={specialMode}
        />
      </div>
      {monthShown && (
        <MonthCelebrationModal
          monthNumber={celebrationMonth}
          completedSteps={celebrationSteps}
          specialMode={specialMode}
          onClose={closeMonth}
        />
      )}
      {weekShown && !monthShown && (
        <WeekCelebrationModal weekNumber={celebrationWeek} onClose={closeWeek} />
      )}
    </div>
  );
}
