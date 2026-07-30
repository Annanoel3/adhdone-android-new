import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Rocket } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isTodayTask } from "@/components/utils/todayTasks";
import LaunchButtons from "./LaunchButtons";

// Home-level entry point for Launchpad / 5-min Sprint. Lets the user pick any
// today-active task and fire off a launch without digging into a task card.
export default function LaunchPicker({ open, onOpenChange, theme }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
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
            <Rocket className="w-5 h-5 text-indigo-500" /> Launch a task
          </DialogTitle>
          <DialogDescription>
            Pick a task to start a Launchpad (5-min countdown to liftoff) or a 5-min Sprint (start
            right now, no pressure).
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 max-h-80 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-sm opacity-60 text-center py-4">Loading your tasks…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm opacity-60 text-center py-4">
              No active tasks for today yet. Add one and come back to launch it.
            </p>
          ) : (
            tasks.map((t) => (
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
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}