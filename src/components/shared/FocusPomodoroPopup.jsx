import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, Timer, Play, Pause, CheckCircle2, ArrowLeft } from "lucide-react";
import { usePomodoro } from "@/context/PomodoroContext";

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// A full-screen Pomodoro popup that behaves like Focus Mode itself: it stays
// anchored to the current focus task, counts the Pomodoro minutes towards the
// active focus session (FocusSessionLog), and lets the user mark the task
// complete or exit Focus Mode — without navigating to the normal Pomodoro page.
export default function FocusPomodoroPopup({
  open,
  onBack,
  focusTask,
  elapsed,
  theme,
  onComplete,
  onExit,
  busy,
}) {
  const pomo = usePomodoro();

  const pomoTotal = (pomo.mode === "work" ? pomo.workDuration : pomo.breakDuration) * 60;
  const pomoProgress = pomoTotal > 0 ? ((pomoTotal - pomo.timeLeft) / pomoTotal) * 100 : 0;
  const pomoMM = String(Math.floor(Math.max(0, pomo.timeLeft) / 60)).padStart(2, "0");
  const pomoSS = String(Math.max(0, pomo.timeLeft) % 60).padStart(2, "0");

  const cardClass =
    theme === "dark"
      ? "bg-gray-900 text-white border-gray-700"
      : theme === "spicybrains"
      ? "bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400"
      : "bg-white text-gray-900 border-gray-200";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onBack(); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${cardClass}`}>
        <div className="flex flex-col p-5 sm:p-6 overflow-y-auto">
          <div className="flex justify-between items-center">
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition"
              aria-label="Back to Focus Mode"
              title="Back to Focus Mode"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition"
              aria-label="Minimize"
              title="Minimize"
            >
              <Timer className="w-4 h-4" />
            </button>
          </div>

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-green-500" /> Pomodoro Focus
            </DialogTitle>
            <DialogDescription>
              A focused work sprint for this task. The timer counts towards your focus time — come
              back here when you've finished it.
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

            <div className={`mb-4 p-4 rounded-xl text-center ${theme === "dark" ? "bg-gray-800" : "bg-green-50"}`}>
              <div className="relative mx-auto w-40 h-40 mb-3">
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
                  <div className="text-3xl font-bold tabular-nums">
                    {pomoMM}:{pomoSS}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider opacity-60 mt-1">
                    {pomo.mode === "work" ? "Focus" : "Break"}
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={pomo.toggleTimer}>
                  {pomo.isActive ? (
                    <><Pause className="w-4 h-4 mr-1" />Pause</>
                  ) : (
                    <><Play className="w-4 h-4 mr-1" />{pomo.timeLeft < pomoTotal ? "Resume" : "Start"}</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pomo.resetTimer()}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={onComplete}
                disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> I completed this
              </Button>
              <Button onClick={onExit} variant="outline" disabled={busy}>
                Exit Focus Mode
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}