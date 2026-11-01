import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { goalsEnabled } from "./goalsAccess";
import { GOALS_CHANGED, sortSteps, currentStep, stepPosition, goalProgress, todayKey, goalStarted, liveGoals } from "./goalLogic";
import { goalLook } from "./goalsTheme";

// Home: for someone on an active goal, one compact card with up to 2 goals:
// the title, "Step N of M: <current step>", a thin progress bar, and a tap to
// the goal's page. A third goal or more is "+1 more" (to My Goals). Nothing
// for an account Goals isn't open to, or with no active goal.

const fmtDay = (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function GoalHomeCard({ user, theme, specialMode }) {
  const enabled = goalsEnabled(user);
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const goals = liveGoals(await base44.entities.Goal.filter({ status: "active" }, "-updated_date", 20));
      const withSteps = await Promise.all(goals.map(async (goal) => ({
        goal,
        steps: sortSteps(await base44.entities.GoalStep.filter({ goal_id: goal.id }, "order_index", 1000).catch(() => [])),
      })));
      setRows(withSteps);
    } catch (e) {
      // Home goes on without it.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    let timer = null;
    const soon = (ms) => { clearTimeout(timer); timer = setTimeout(load, ms); };
    const onGoals = () => soon(300);
    const onTasks = () => soon(9000);
    const onVisible = () => { if (document.visibilityState === "visible") soon(2500); };
    window.addEventListener(GOALS_CHANGED, onGoals);
    window.addEventListener("task-done", onTasks);
    window.addEventListener("tasks-changed", onTasks);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(GOALS_CHANGED, onGoals);
      window.removeEventListener("task-done", onTasks);
      window.removeEventListener("tasks-changed", onTasks);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  if (!enabled || rows.length === 0) return null;

  const L = goalLook(theme, specialMode);
  const today = todayKey();
  const shown = rows.slice(0, 2);
  const more = rows.length - shown.length;

  return (
    <div className={`rounded-xl px-3 py-2 ${L.card}`}>
      {shown.map(({ goal, steps }, i) => {
        const cur = currentStep(goal, steps, today);
        const { n, m } = stepPosition(cur, steps);
        const { pct } = goalProgress(steps);
        const line = steps.length === 0
          ? "No steps yet"
          : !cur
            ? `All ${steps.length} steps done`
            : `Step ${n} of ${m}: ${cur.title}`;
        const starts = !goalStarted(goal, today) ? `Starts ${fmtDay(goal.start_date)} · ` : "";
        return (
          <button
            key={goal.id}
            onClick={() => navigate(`/goal/${goal.id}`)}
            className={`w-full text-left py-2 flex items-center gap-2.5 ${i > 0 ? `border-t ${L.dark ? "border-gray-700" : "border-gray-200"}` : ""}`}
          >
            <Target className="w-4 h-4 text-violet-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className={`block text-sm font-semibold truncate ${L.title}`}>{goal.title}</span>
              <span className={`block text-xs truncate ${L.soft}`}>{starts}{line}</span>
              <span className={`block h-1 mt-1.5 rounded-full overflow-hidden ${L.track}`}>
                <span className={`block h-full rounded-full ${L.fill}`} style={{ width: `${pct}%` }} />
              </span>
            </span>
            <ChevronRight className={`w-4 h-4 flex-shrink-0 ${L.muted}`} />
          </button>
        );
      })}
      {more > 0 && (
        <button onClick={() => navigate("/Goals")} className={`w-full text-left text-xs font-medium pt-1 pb-1 pl-6 ${L.accent}`}>
          +{more} more
        </button>
      )}
    </div>
  );
}
