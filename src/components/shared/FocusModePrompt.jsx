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
import { Target, Info, CheckCircle2, Timer, Play, Pause, Dices } from "lucide-react";
import confetti from "canvas-confetti";
import { isTodayTask } from "@/components/utils/todayTasks";
import { usePomodoro } from "@/context/PomodoroContext";

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
  const [pickableTasks, setPickableTasks] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [spinLabel, setSpinLabel] = useState("");
  const [showPomo, setShowPomo] = useState(false);
  const pomo = usePomodoro();

  // Mini pomodoro derived values (mirrors the FocusTimer circle at small scale)
  const pomoTotal = (pomo.mode === "work" ? pomo.workDuration : pomo.breakDuration) * 60;
  const pomoProgress = pomoTotal > 0 ? ((pomoTotal - pomo.timeLeft) / pomoTotal) * 100 : 0;
  const pomoMM = String(Math.floor(Math.max(0, pomo.timeLeft) / 60)).padStart(2, "0");
  const pomoSS = String(Math.max(0, pomo.timeLeft) % 60).padStart(2, "0");

  // The Wheel — randomly selects one of today's pickable tasks to beat decision fatigue.
  const handleSpin = () => {
    if (pickableTasks.length < 2 || busy || spinning) return;
    setSpinning(true);
    let count = 0;
    const id = setInterval(() => {
      const t = pickableTasks[Math.floor(Math.random() * pickableTasks.length)];
      setSpinLabel(t.title);
      count++;
      if (count > 16) {
        clearInterval(id);
        const chosen = pickableTasks[Math.floor(Math.random() * pickableTasks.length)];
        setSpinLabel(chosen.title);
        setTimeout(() => {
          setSpinning(false);
          setSpinLabel("");
          handlePickTask(chosen);
        }, 700);
      }
    }, 85);
  };

  const startPomo = () => {
    pomo.resetTimer();
    setTimeout(() => pomo.toggleTimer(), 60);
    setShowPomo(true);
  };

  // Live elapsed timer for the active focus session (counts up every second).
  useEffect(() => {
    if (mode !== "active") return;
    const startStr = user?.focus_mode_entered_at;
    if (!startStr) { setElapsed(null); return; }
    const update = () => setElapsed(Math.max(0, Date.now() - new Date(startStr).getTime()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [mode, user?.focus_mode_entered_at]);

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
        const allTasks = await base44.entities.Task.filter({ status: "active" }, "-updated_date", 200);
        const pickable = allTasks.filter((t) => {
          if (t.birthday_person) return false;
          if (t.parent_task_id) return false; // subtasks belong to a parent — don't pick them standalone
          // Mirror the Home screen's "today" logic (via isTodayTask) so a one-time
          // task scheduled for a future date through next_reminder isn't offered
          // here — only tasks due today, overdue, or with no effective date.
          return isTodayTask(t);
        });
        setPickableTasks(pickable);
        if (focusTaskId) {
          const ft = pickable.find((t) => t.id === focusTaskId);
          setFocusTask(ft || null);
        } else {
          setFocusTask(null);
        }
      } catch (e) {
        console.error("FocusMode load error:", e);
      }
    })();
  }, [user?.email, focusTaskId]);

  // One-time Focus Mode intro: fires exactly once — the first time the user has
  // 2+ tasks that qualify for Focus Mode. After that, the Home button is the entry point.
  useEffect(() => {
    if (!user?.email) return;
    if (focusTaskId) {
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
    if (localStorage.getItem("focus_intro_seen") === "1" || user?.focus_intro_seen) return;
    if (pickableTasks.length < 2) return;
    const t = setTimeout(() => {
      setOpen(true);
      localStorage.setItem("focus_intro_seen", "1");
      window.dispatchEvent(new CustomEvent("focus-intro-seen"));
      base44.auth.updateMe({ focus_intro_seen: true }).catch(() => {});
    }, 15000);
    return () => clearTimeout(t);
  }, [user?.email, focusTaskId, pickableTasks, user?.focus_intro_seen]);

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
      // Log this focus session so Progress can show per-task averages & frequency.
      try {
        const startedAt = user?.focus_mode_entered_at;
        const duration = startedAt
          ? Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
          : 0;
        await base44.entities.FocusSessionLog.create({
          task_id: focusTask.id,
          task_title: focusTask.title,
          duration_seconds: duration,
          started_at: startedAt || localISO,
          completed_at: localISO,
        });
      } catch (e) {
        console.error("FocusSessionLog save failed:", e);
      }
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
      window.dispatchEvent(new CustomEvent("tasks-changed"));
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

  const InfoButton = (
    <button
      onClick={() => setShowInfo(true)}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition"
      aria-label="What is Focus Mode?"
      title="What is Focus Mode?"
    >
      <Info className="w-4 h-4" />
    </button>
  );

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
              <div className="flex justify-start">{InfoButton}</div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" /> Focus Mode
                </DialogTitle>
                <DialogDescription>
                  You're focused on one task — hourly check-ins, everything else quiet. Come back
                  here when you've finished it.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-xs uppercase opacity-60 mb-1">Current task</p>
                <p className="text-lg font-semibold mb-2">
                  {focusTask?.title || "Loading…"}
                </p>
                {elapsed != null && (
                  <div className={`inline-flex items-center gap-2 text-sm font-medium mb-4 px-3 py-1.5 rounded-full w-fit ${theme === "dark" ? "bg-gray-800 text-green-400" : "bg-green-50 text-green-700"}`}>
                    <Timer className="w-4 h-4" />
                    Elapsed: {formatElapsed(elapsed)}
                  </div>
                )}
                {elapsed == null && <div className="mb-4" />}
                {!showPomo ? (
                  <Button variant="outline" onClick={startPomo} className="mb-3 w-full">
                    <Timer className="w-4 h-4 mr-2" /> Start a Pomodoro
                  </Button>
                ) : (
                  <div className={`mb-4 p-4 rounded-xl text-center ${theme === "dark" ? "bg-gray-800" : "bg-green-50"}`}>
                    <div className="relative mx-auto w-32 h-32 mb-3">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                        <circle cx="100" cy="100" r="80" stroke={theme === "dark" ? "#374151" : "#e5e7eb"} strokeWidth="14" fill="none" />
                        <circle
                          cx="100" cy="100" r="80"
                          stroke={pomo.mode === "work" ? "#22c55e" : "#3b82f6"}
                          strokeWidth="14" fill="none" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 80}
                          strokeDashoffset={2 * Math.PI * 80 * (1 - pomoProgress / 100)}
                          style={{ transition: "stroke-dashoffset 0.3s linear" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold tabular-nums">
                          {pomoMM}:{pomoSS}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider opacity-60">
                          {pomo.mode === "work" ? "Focus" : "Break"}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center gap-2">
                      <Button size="sm" onClick={pomo.toggleTimer}>
                        {pomo.isActive ? (
                          <><Pause className="w-4 h-4 mr-1" />Pause</>
                        ) : (
                          <><Play className="w-4 h-4 mr-1" />Start</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { pomo.resetTimer(); setShowPomo(false); }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                )}
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
              <div className="flex justify-start">{InfoButton}</div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" /> Focus Mode
                </DialogTitle>
                <DialogDescription>
                  Pick one task to focus on — it'll switch to hourly check-ins until completion or
                  exit while your other recurring reminders go quiet. Time-specific reminders
                  (events, due dates, birthdays) are never affected.
                </DialogDescription>
              </DialogHeader>
              {pickableTasks.length >= 2 && (
                <button
                  onClick={handleSpin}
                  disabled={busy || spinning}
                  className="w-full mb-3 p-3 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {spinning ? (
                    <span className="truncate">{spinLabel || "Spinning…"}</span>
                  ) : (
                    <>
                      <Dices className="w-4 h-4 text-purple-500" />
                      Can't decide? Spin the wheel
                    </>
                  )}
                </button>
              )}
              <div className="py-2 max-h-72 overflow-y-auto space-y-2">
                {pickableTasks.length === 0 ? (
                  <p className="text-sm opacity-60 text-center py-4">
                    No active tasks right now. Add a task to use Focus Mode.
                  </p>
                ) : (
                  pickableTasks.map((t) => (
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