import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Timer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isTodayTask } from "@/components/utils/todayTasks";
import LaunchButtons from "./LaunchButtons";

// Home's "Timer": pick one of today's tasks and start its stopwatch, without
// digging into the task itself. (See LaunchButtons for the timer.)
// Only the tasks the parser judged worth timing are offered (takes_time:
// laundry, cleaning, a workout — not vitamins, the litter box or new
// batteries; Anna, Oct 27 2026: "Timer is really only good for certain work
// things, school things, chores that take at least 5 minutes"). The rest sit
// behind "Time something else" for the person who wants to anyway.
export default function LaunchPicker({ open, onOpenChange, theme }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRest, setShowRest] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowRest(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const all = await base44.entities.Task.filter(
          { status: "active" },
          "-updated_date",
          200
        );
        const pickable = all.filter(
          (t) => !t.birthday_person && !t.parent_task_id && isTodayTask(t)
        );
        if (!cancelled) setTasks(pickable);
      } catch (e) {
        console.error("LaunchPicker load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const cardClass =
    theme === "dark"
      ? "bg-gray-900 text-white border-gray-700"
      : theme === "spicybrains"
        ? "bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400"
        : "bg-white text-gray-900 border-gray-200";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-md ${cardClass}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-emerald-500" /> Start a timer
          </DialogTitle>
          <DialogDescription>
            Pick a task. The timer counts up on screen until you stop it, so you can see how long things really take.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 max-h-80 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-sm opacity-60 text-center py-4">Loading your tasks…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm opacity-60 text-center py-4">
              No active tasks for today yet. Add one and come back to time it.
            </p>
          ) : (() => {
            const worth = tasks.filter((t) => t.takes_time === true);
            const rest = tasks.filter((t) => t.takes_time !== true);
            const row = (t) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg border ${
                  theme === "dark"
                    ? "border-gray-700 bg-gray-800"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <p
                  className={`text-sm font-medium mb-2 ${
                    theme === "dark" ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  {t.title}
                </p>
                <LaunchButtons
                  task={t}
                  theme={theme}
                  onStarted={() => onOpenChange(false)}
                />
              </div>
            );
            return (
              <>
                {worth.length === 0 && (
                  <p className="text-sm opacity-60 text-center py-3">
                    Nothing on today's list looks like a timer job.
                  </p>
                )}
                {worth.map(row)}
                {rest.length > 0 && !showRest && (
                  <button
                    type="button"
                    onClick={() => setShowRest(true)}
                    className="w-full text-sm underline opacity-70 py-2"
                  >
                    Time something else
                  </button>
                )}
                {showRest && rest.map(row)}
              </>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}