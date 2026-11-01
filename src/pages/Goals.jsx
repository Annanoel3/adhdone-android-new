import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Target, Plus, ChevronRight, Loader2, Calendar } from "lucide-react";
import GoalsGate from "@/components/goals/GoalsGate";
import { useGoalTheme, goalLook } from "@/components/goals/goalsTheme";
import { GOALS_CHANGED, liveGoals } from "@/components/goals/goalLogic";
import { readLocalSession, clearLocalSession, loadAccountDraft, completeAccountDraft, sessionTime } from "@/components/goals/plannerDraft";

// My Goals (ported Oct 31 2026 from Anna's Goals app, Goals.jsx; GOALS_PORT.md):
// Active / Completed / Paused tabs, the "goal in progress" note when a planner
// chat was left mid-way, and a card per goal with its progress.

const CATEGORY_COLORS = {
  learning: "bg-blue-100 text-blue-700",
  health: "bg-green-100 text-green-700",
  career: "bg-orange-100 text-orange-700",
  finance: "bg-yellow-100 text-yellow-700",
  relationships: "bg-pink-100 text-pink-700",
  personal: "bg-purple-100 text-purple-700",
  creative: "bg-rose-100 text-rose-700",
  other: "bg-gray-100 text-gray-700",
};

export default function GoalsPage() {
  return (
    <GoalsGate>
      <Goals />
    </GoalsGate>
  );
}

function Goals() {
  const [goals, setGoals] = useState([]);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [inProgress, setInProgress] = useState(false);
  const navigate = useNavigate();
  const { theme, specialMode } = useGoalTheme();
  const L = goalLook(theme, specialMode);

  const loadData = useCallback(async () => {
    try {
      // A goal being deleted on this phone is already gone from the list.
      const goalsData = liveGoals(await base44.entities.Goal.list("-created_date", 100));
      const stepLists = await Promise.all(goalsData.map((g) =>
        base44.entities.GoalStep.filter({ goal_id: g.id }, "order_index", 1000).catch(() => [])));
      setGoals(liveGoals(goalsData));
      setSteps(stepLists.flat());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const onChange = () => loadData();
    window.addEventListener(GOALS_CHANGED, onChange);
    return () => window.removeEventListener(GOALS_CHANGED, onChange);
  }, [loadData]);

  useEffect(() => {
    // This device's planner chat, or the account's when it changed later (a
    // chat started on another device shows here too; plannerDraft.js).
    const local = readLocalSession();
    setInProgress(!!local?.messages?.length);
    let alive = true;
    loadAccountDraft().then((account) => {
      if (!alive || !account || sessionTime(account) <= sessionTime(local)) return;
      setInProgress(!account.completed && account.messages.length > 0);
    });
    return () => { alive = false; };
  }, []);

  const getGoalProgress = (goalId) => {
    const goalSteps = steps.filter((s) => s.goal_id === goalId);
    if (goalSteps.length === 0) return 0;
    return Math.round((goalSteps.filter((s) => s.status === "completed").length / goalSteps.length) * 100);
  };
  const getStepCount = (goalId) => steps.filter((s) => s.goal_id === goalId).length;
  const filteredGoals = goals.filter((g) => g.status === activeTab);

  return (
    <div className="min-h-full pb-32 px-4 sm:px-6 md:px-8 pt-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <h1 className={`text-2xl sm:text-3xl font-bold ${L.title}`}>My Goals</h1>
            <p className={`text-sm mt-1 ${L.muted}`}>{goals.filter((g) => g.status === "active").length} active goals</p>
          </div>
          <Button onClick={() => navigate("/Planner?new=1")} className={`rounded-2xl shadow-md font-semibold text-sm h-10 px-5 flex-shrink-0 ${L.primary}`}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Goal
          </Button>
        </div>

        <div className={`flex gap-1 p-1 rounded-xl mb-6 ${L.tabs}`}>
          {["active", "completed", "paused"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-sm font-medium py-2 rounded-lg capitalize transition-all ${activeTab === tab ? L.tabOn : L.tabOff}`}
            >
              {tab}
              <span className={`ml-1.5 text-xs ${L.muted}`}>({goals.filter((g) => g.status === tab).length})</span>
            </button>
          ))}
        </div>

        {inProgress && activeTab === "active" && (
          <div className={`mb-6 p-4 rounded-2xl flex items-start gap-3 ${L.card}`}>
            <Loader2 className={`w-4 h-4 animate-spin mt-0.5 flex-shrink-0 ${L.accent}`} />
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm ${L.title}`}>Goal in progress...</p>
              <p className={`text-xs mt-1 ${L.soft}`}>A goal is being created. Go to Planner to continue or come back to see it appear here.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => navigate("/Planner")} className={`px-3 py-1 rounded-lg text-xs font-semibold ${L.accent}`}>
                Continue
              </button>
              <button
                onClick={() => { clearLocalSession(); completeAccountDraft(); setInProgress(false); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${L.muted}`}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
          </div>
        ) : filteredGoals.length === 0 ? (
          <EmptyState activeTab={activeTab} onNewGoal={() => navigate("/Planner?new=1")} L={L} />
        ) : (
          <div className="space-y-3">
            {filteredGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                progress={getGoalProgress(goal.id)}
                stepCount={getStepCount(goal.id)}
                onClick={() => navigate(`/goal/${goal.id}`)}
                L={L}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalCard({ goal, progress, stepCount, onClick, L }) {
  return (
    <button onClick={onClick} className={`w-full rounded-2xl p-4 sm:p-5 text-left transition-all group ${L.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${L.dark ? "bg-gray-700 text-gray-300" : CATEGORY_COLORS[goal.category] || CATEGORY_COLORS.other}`}>
              {goal.category}
            </span>
            {goal.timeline && (
              <span className={`flex items-center gap-1 text-xs ${L.muted}`}>
                <Calendar className="w-3 h-3" />
                {goal.timeline}
              </span>
            )}
          </div>
          <h3 className={`font-semibold text-base leading-snug mb-1 truncate ${L.title}`}>{goal.title}</h3>
          {goal.plan_summary && <p className={`text-sm line-clamp-2 leading-relaxed ${L.soft}`}>{goal.plan_summary}</p>}
        </div>
        <ChevronRight className={`w-5 h-5 flex-shrink-0 mt-1 ${L.muted}`} />
      </div>
      {stepCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs ${L.muted}`}>{stepCount} steps</span>
            <span className={`text-xs font-semibold ${L.accent}`}>{progress}%</span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${L.track}`}>
            <div className={`h-full rounded-full transition-all duration-500 ${L.fill}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}

function EmptyState({ activeTab, onNewGoal, L }) {
  if (activeTab === "active") {
    return (
      <div className={`text-center py-12 px-6 rounded-2xl ${L.card}`}>
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 ${L.chip}`}>
          <Target className="w-8 h-8" />
        </div>
        <h3 className={`text-lg font-semibold mb-2 ${L.title}`}>No active goals yet</h3>
        <p className={`text-sm mb-6 ${L.muted}`}>Use the Planner to create your first AI-powered goal plan.</p>
        <Button onClick={onNewGoal} className={`rounded-2xl ${L.primary}`}>
          <Plus className="w-4 h-4 mr-2" /> Create a Goal
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center py-16 px-6">
      <p className={`text-sm ${L.muted}`}>No {activeTab} goals.</p>
    </div>
  );
}
