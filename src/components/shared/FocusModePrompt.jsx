import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, Info, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";

const CELEBRATION_EMOJIS = ["🎉", "🎊", "✨", "🥳", "🌟", "💫", "🙌", "🏆"];
const CELEBRATION_MESSAGES = [
  "Heck yes, you did it!",
  "One less thing on your plate!",
  "That's how it's done!",
  "Crushed it!",
  "Look at you, finishing things!",
  "Done and done!",
  "Your brain thanks you!",
  "Tiny steps add up — big win!",
];

function getWindow() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function broadcast(taskId) {
  window.dispatchEvent(
    new CustomEvent("focus-mode-changed", { detail: { taskId: taskId || null } })
  );
}

export default function FocusModePrompt({ user, theme }) {
  const [focusTaskId, setFocusTaskId] = useState(user?.focus_mode_task_id || null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("offer"); // 'offer' | 'active' | 'celebrate'
  const [focusTask, setFocusTask] = useState(null);
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sync from external changes (e.g. another tab) + initial.
  useEffect(() => {
    const apply = (id) => {
      setFocusTaskId(id || null);
      setMode(id ? "active" : "offer");
    };
    apply(user?.focus_mode_task_id);
    const handler = (e) => apply(e.detail?.taskId);
    window.addEventListener("focus-mode-changed", handler);
    return () => window.removeEventListener("focus-mode-changed", handler);
  }, [user?.focus_mode_task_id]);

  // Load tasks whenever the focus state or user changes.
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const allTasks = await base44.entities.Task.filter({ status: "active" });
        const recurring = allTasks.filter(
          (t) => t.reminder_interval && t.reminder_interval !== "once" && !t.birthday_person
        );
        setRecurringTasks(recurring);
        if (focusTaskId) {
          const ft =
            recurring.find((t) => t.id === focusTaskId) ||
            allTasks.find((t) => t.id === focusTaskId);
          setFocusTask(ft || null);
        } else {
          setFocusTask(null);
        }
      } catch (e) {
        console.error("FocusMode load error:", e);
      }
    })();
  }, [user?.email, focusTaskId]);

  // Prompt trigger on app open.
  useEffect(() => {
    if (!user?.email) return;
    if (focusTaskId) {
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
    const win = getWindow();
    const key = `focus_prompt_${win}_${todayKey()}`;
    if (localStorage.getItem(key) === "1") return;
    const t = setTimeout(() => {
      setOpen(true);
      localStorage.setItem(key, "1");
    }, 15000);
    return () => clearTimeout(t);
  }, [user?.email, focusTaskId]);

  // Manual open from the Home Focus button.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-focus-prompt", handler);
    return () => window.removeEventListener("open-focus-prompt", handler);
  }, []);

  const handlePickTask = async (task) => {
    setBusy(true);
    try {
      await base44.functions.invoke("setFocusMode", { action: "enter", taskId: task.id });
      setFocusTaskId(task.id);
      setFocusTask(task);
      setMode("active");
      broadcast(task.id);
    } catch (e) {
      console.error("Failed to enter focus mode:", e);
    } finally {
      setBusy(false);
    }
  };

  const fireConfetti = () => {
    const colors = ["#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
    setTimeout(
      () => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors }),
      150
    );
    setTimeout(
      () => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors }),
      300
    );
  };

  const handleComplete = async () => {
    if (!focusTask) return;
    setBusy(true);
    try {
      const now = new Date();
      const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
      await base44.entities.Task.update(focusTask.id, {
        status: "completed",
        completed_at: localISO,
        onesignal_notification_ids: [],
      });
      if (focusTask.onesignal_notification_ids?.length) {
        try {
          const { cancelScheduledReminder } = await import(
            "@/components/utils/reminderScheduler"
          );
          await cancelScheduledReminder(focusTask.onesignal_notification_ids);
        } catch {}
      }
      await base44.functions.invoke("setFocusMode", { action: "exit" });
      setFocusTaskId(null);
      setFocusTask(null);
      broadcast(null);
      setMode("celebrate");
      fireConfetti();
    } catch (e) {
      console.error("Failed to complete focus task:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    setBusy(true);
    try {
      await base44.functions.invoke("setFocusMode", { action: "exit" });
      setFocusTaskId(null);
      setFocusTask(null);
      setMode("offer");
      broadcast(null);
      setOpen(false);
    } catch (e) {
      console.error("Failed to exit focus mode:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = (o) => {
    if (!o) {
      setOpen(false);
      if (mode === "celebrate") setMode("offer");
    } else {
      setOpen(true);
    }
  };

  const cardClass =
    theme === "dark"
      ? "bg-gray-900 text-white border-gray-700"
      : theme === "spicybrains"
      ? "bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400"
      : "bg-white text-gray-900 border-gray-200";

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className={`max-w-md ${cardClass}`}>
          {mode === "celebrate" ? (
            <div className="text-center py-6">
              <div className="text-7xl mb-4">
                {CELEBRATION_EMOJIS[Math.floor(Math.random() * CELEBRATION_EMOJIS.length)]}
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]}
              </h2>
              <p className="text-sm opacity-80 mb-6">
                What's next? Tap the 🎯 Focus button on the Home screen to pick your next task and
                jump right back in.
              </p>
              <Button
                onClick={() => {
                  setOpen(false);
                  setMode("offer");
                }}
                className="w-full"
              >
                Back to it
              </Button>
            </div>
          ) : mode === "active" ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between w-full">
                  <DialogTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-500" /> Focus Mode
                  </DialogTitle>
                  <button
                    onClick={() => setShowInfo(true)}
                    className="opacity-60 hover:opacity-100"
                    aria-label="What is Focus Mode?"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
                <DialogDescription>
                  You're focused on one task — hourly check-ins, everything else quiet. Come back
                  here when you've finished it.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-xs uppercase opacity-60 mb-1">Current task</p>
                <p className="text-lg font-semibold mb-4">
                  {focusTask?.title || "Loading…"}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleComplete}
                    disabled={busy}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> I completed this
                  </Button>
                  <Button onClick={handleExit} variant="outline" disabled={busy}>
                    Exit Focus Mode
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between w-full">
                  <DialogTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-500" /> Focus Mode
                  </DialogTitle>
                  <button
                    onClick={() => setShowInfo(true)}
                    className="opacity-60 hover:opacity-100"
                    aria-label="What is Focus Mode?"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
                <DialogDescription>
                  Pick one task to focus on — it'll switch to hourly "how's it going?" check-ins
                  while your other recurring reminders go quiet. Time-specific reminders (events,
                  due dates, birthdays) are never affected.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 max-h-64 overflow-y-auto space-y-2">
                {recurringTasks.length === 0 ? (
                  <p className="text-sm opacity-60 text-center py-4">
                    No recurring tasks right now. Add one to use Focus Mode.
                  </p>
                ) : (
                  recurringTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handlePickTask(t)}
                      disabled={busy}
                      className="w-full text-left p-3 rounded-lg border hover:border-green-500 hover:bg-green-50 dark:hover:bg-gray-800 transition text-sm font-medium"
                    >
                      {t.title}
                    </button>
                  ))
                )}
              </div>
              <Button variant="ghost" onClick={() => setOpen(false)} className="w-full">
                No thanks, I'll manage everything at once
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className={`max-w-sm ${cardClass}`}>
          <DialogHeader>
            <DialogTitle>What is Focus Mode?</DialogTitle>
            <DialogDescription>
              Focus Mode is for when you want to get a specific task done without distractions from
              your other recurring reminders. When you pick a task, it switches to hourly
              "how's it going?" check-ins and everything else goes quiet. You can exit Focus Mode
              at any time, and time-specific reminders (events, due dates, birthdays) are never
              affected.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowInfo(false)} className="w-full">
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}