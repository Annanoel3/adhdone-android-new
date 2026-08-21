import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Zap, Timer, Loader2, Bell } from "lucide-react";
import {
  scheduleReminder,
  cancelScheduledReminder,
} from "@/components/utils/reminderScheduler";
import { updateTodaysSummary } from "@/components/utils/dailySummaryHelper";
import { useLaunch } from "@/context/LaunchContext";

const SNOOZE_OPTIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "Tomorrow", minutes: null },
];

export default function NotificationFollowupModal({ user, theme }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [showNoOptions, setShowNoOptions] = useState(false);
  const [processing, setProcessing] = useState(null);
  const pendingTasksRef = useRef([]);
  const dismissedTaskIds = useRef(new Set());
  const isOpenRef = useRef(false);
  const loadingRef = useRef(false);
  const { startSprint } = useLaunch();

  const showNextTask = useCallback(() => {
    const next = pendingTasksRef.current.find(
      (t) => !dismissedTaskIds.current.has(t.id)
    );
    if (next) {
      setCurrentTask(next);
      setShowNoOptions(false);
      isOpenRef.current = true;
      setIsOpen(true);
    } else {
      setCurrentTask(null);
      isOpenRef.current = false;
      setIsOpen(false);
    }
  }, []);

  const loadTaskById = useCallback(
    async (taskId) => {
      if (!taskId) return;
      try {
        const tasks = await base44.entities.Task.filter({ id: taskId });
        if (tasks.length > 0 && tasks[0].status === "active") {
          const task = tasks[0];
          if (dismissedTaskIds.current.has(task.id)) return;
          pendingTasksRef.current = [
            task,
            ...pendingTasksRef.current.filter((t) => t.id !== task.id),
          ];
          showNextTask();
        }
      } catch (error) {
        console.error("Error loading task for followup:", error);
      }
    },
    [showNextTask]
  );

  useEffect(() => {
    if (!user?.email) return;

    const checkOverdueTasks = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const tasks = await base44.entities.Task.filter({ status: "active" });
        const now = new Date();
        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const overdue = tasks.filter(
          (t) =>
            t.next_reminder &&
            new Date(t.next_reminder) <= now &&
            !t.birthday_person && // birthdays are reminders, not "did you do it?" tasks
            !t.parent_task_id && // subtasks are checked from their parent
            !dismissedTaskIds.current.has(t.id) &&
            // Only follow up on tasks that are actually due today or overdue.
            // A task whose due_date is still in the future isn't due yet,
            // even if its next_reminder timestamp is stale.
            (!t.due_date || new Date(t.due_date) <= startOfToday)
        );
        if (overdue.length > 0) {
          const existingIds = new Set(pendingTasksRef.current.map((t) => t.id));
          const newOverdue = overdue.filter((t) => !existingIds.has(t.id));
          if (newOverdue.length > 0) {
            pendingTasksRef.current = [
              ...pendingTasksRef.current,
              ...newOverdue,
            ];
            if (!isOpenRef.current) {
              showNextTask();
            }
          }
        }
      } catch (error) {
        console.error("Error checking overdue tasks:", error);
      } finally {
        loadingRef.current = false;
      }
    };

    // Check sessionStorage for pending followup from notification click
    const pendingTaskId = sessionStorage.getItem("pending_task_followup");
    if (pendingTaskId) {
      sessionStorage.removeItem("pending_task_followup");
      loadTaskById(pendingTaskId);
    }

    // Always check for overdue tasks (delayed to let page settle)
    const timer = setTimeout(checkOverdueTasks, 1500);

    // Check for recent smart nudge — open the app on the most recently nudged
    // task. Uses localStorage to prevent re-showing on every app open. The key
    // includes the nudge timestamp so each new nudge gets one chance to show.
    const checkRecentNudge = () => {
      if (!user?.last_smart_nudge_task_id || !user?.last_smart_nudge_at) return;
      const seenKey = `seen_nudge_${user.last_smart_nudge_task_id}_${user.last_smart_nudge_at}`;
      if (localStorage.getItem(seenKey)) return;
      const nudgeTime = new Date(user.last_smart_nudge_at).getTime();
      if (Date.now() - nudgeTime > 3 * 60 * 60 * 1000) return; // older than 3 hours
      localStorage.setItem(seenKey, 'true');
      loadTaskById(user.last_smart_nudge_task_id);
    };
    const nudgeTimer = setTimeout(checkRecentNudge, 2000);

    // Listen for notification click events
    const handleFollowupEvent = (event) => {
      const taskId = event.detail?.taskId;
      if (taskId) {
        loadTaskById(taskId);
      }
    };
    window.addEventListener("show-task-followup", handleFollowupEvent);

    return () => {
      window.removeEventListener("show-task-followup", handleFollowupEvent);
      clearTimeout(timer);
      clearTimeout(nudgeTimer);
    };
  }, [user?.email, loadTaskById, showNextTask]);

  const handleComplete = async () => {
    if (!currentTask) return;
    setProcessing("complete");
    try {
      const now = new Date();
      await base44.entities.Task.update(currentTask.id, {
        status: "completed",
        completed_at: now.toISOString(),
      });
      if (currentTask.onesignal_notification_ids?.length > 0) {
        await cancelScheduledReminder(
          currentTask.onesignal_notification_ids
        ).catch(() => {});
      }
      await updateTodaysSummary();
      dismissedTaskIds.current.add(currentTask.id);
      pendingTasksRef.current = pendingTasksRef.current.filter(
        (t) => t.id !== currentTask.id
      );
      setProcessing(null);
      showNextTask();
    } catch (error) {
      console.error("Error completing task:", error);
      setProcessing(null);
    }
  };

  const handleSnooze = async (option) => {
    if (!currentTask || !user?.email) return;
    setProcessing(option.label);
    try {
      let snoozeUntil;
      if (option.label === "Tomorrow") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        snoozeUntil = tomorrow;
      } else {
        snoozeUntil = new Date(Date.now() + option.minutes * 60 * 1000);
      }

      if (currentTask.onesignal_notification_ids?.length > 0) {
        await cancelScheduledReminder(
          currentTask.onesignal_notification_ids
        ).catch(() => {});
      }

      const notificationId = await scheduleReminder({
        email: user.email,
        title: "Task Reminder 📋",
        body: `${currentTask.title}\n\nTap to mark as complete!`,
        sendAtISO: snoozeUntil.toISOString(),
        taskId: currentTask.id,
        data: {
          screen: "/TaskNotification",
          taskId: currentTask.id,
          urgency: currentTask.urgency,
          type: "task_reminder",
        },
      });

      await base44.entities.Task.update(currentTask.id, {
        next_reminder: snoozeUntil.toISOString(),
        onesignal_notification_ids: notificationId ? [notificationId] : [],
        snooze_count: (currentTask.snooze_count || 0) + 1,
        // Log avoidance so reminder cadence can adapt — a "not now" from the
        // follow-up means the user is sidestepping this task, not just timing it.
        consecutive_snoozes: (currentTask.consecutive_snoozes || 0) + 1,
      });

      dismissedTaskIds.current.add(currentTask.id);
      pendingTasksRef.current = pendingTasksRef.current.filter(
        (t) => t.id !== currentTask.id
      );
      setProcessing(null);
      showNextTask();
    } catch (error) {
      console.error("Error snoozing task:", error);
      setProcessing(null);
    }
  };

  const handleJustFiveMinutes = async () => {
    if (!currentTask) return;
    setProcessing("sprint");
    try {
      await startSprint(currentTask);
      dismissedTaskIds.current.add(currentTask.id);
      pendingTasksRef.current = pendingTasksRef.current.filter(
        (t) => t.id !== currentTask.id
      );
      setProcessing(null);
      setShowNoOptions(false);
      setCurrentTask(null);
      isOpenRef.current = false;
      setIsOpen(false);
    } catch (error) {
      console.error("Error starting 5-min sprint from followup:", error);
      setProcessing(null);
    }
  };

  const handleLeaveIt = () =>
    handleSnooze({ label: "Not now", minutes: 180 });

  const handleDismiss = () => {
    if (!currentTask) return;
    dismissedTaskIds.current.add(currentTask.id);
    pendingTasksRef.current = pendingTasksRef.current.filter(
      (t) => t.id !== currentTask.id
    );
    setShowNoOptions(false);
    showNextTask();
  };

  const getUrgencyColor = (urgency) => {
    if (theme === "dark") {
      return {
        low: "bg-gray-700 text-gray-300 border-gray-600",
        medium: "bg-blue-900/40 text-blue-300 border-blue-800",
        high: "bg-amber-900/40 text-amber-300 border-amber-800",
        urgent: "bg-red-900/40 text-red-300 border-red-800",
      }[urgency] || "";
    }
    return {
      low: "bg-gray-100 text-gray-600 border-gray-200",
      medium: "bg-blue-100 text-blue-700 border-blue-200",
      high: "bg-amber-100 text-amber-700 border-amber-200",
      urgent: "bg-red-100 text-red-700 border-red-200",
    }[urgency] || "";
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !processing) {
          handleDismiss();
        }
      }}
    >
      <DialogContent className="max-w-md">
        {currentTask && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    theme === "dark"
                      ? "bg-purple-900/30"
                      : "bg-gradient-to-br from-purple-100 to-pink-100"
                  }`}
                >
                  <Bell
                    className={`w-6 h-6 ${
                      theme === "dark" ? "text-purple-400" : "text-purple-600"
                    }`}
                  />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {showNoOptions ? "Not yet?" : "Did you do it?"}
                  </DialogTitle>
                  <DialogDescription>
                    {showNoOptions
                      ? "What would help right now?"
                      : "Check in on this task"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              className={`p-4 rounded-xl ${
                theme === "dark" ? "bg-gray-800" : "bg-purple-50/60"
              }`}
            >
              <h3
                className={`text-lg font-semibold mb-2 ${
                  theme === "dark" ? "text-white" : "text-gray-900"
                }`}
              >
                {currentTask.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {currentTask.urgency && (
                  <Badge
                    className={`${getUrgencyColor(currentTask.urgency)} border`}
                  >
                    {currentTask.urgency}
                  </Badge>
                )}
                {currentTask.energy_required && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {currentTask.energy_required} energy
                  </Badge>
                )}
              </div>
              {currentTask.description && (
                <p
                  className={`mt-2 text-sm ${
                    theme === "dark" ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {currentTask.description}
                </p>
              )}
            </div>

            {!showNoOptions ? (
              <div className="flex gap-3 mt-2">
                <Button
                  onClick={handleComplete}
                  disabled={!!processing}
                  className={`flex-1 h-14 text-lg ${
                    theme === "minimalist"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  }`}
                >
                  {processing === "complete" ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                  )}
                  ✅ Yes
                </Button>
                <Button
                  onClick={() => setShowNoOptions(true)}
                  disabled={!!processing}
                  variant="outline"
                  className={`flex-1 h-14 text-lg ${
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200"
                      : "hover:bg-gray-100"
                  }`}
                >
                  ❌ No
                </Button>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                <Button
                  onClick={handleJustFiveMinutes}
                  disabled={!!processing}
                  className={`w-full h-14 justify-start text-base ${
                    theme === "dark"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                      : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
                  }`}
                >
                  {processing === "sprint" ? (
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                  ) : (
                    <Timer className="w-5 h-5 mr-3" />
                  )}
                  ⏱️ Just 5 minutes
                  <span className="ml-auto text-xs font-normal opacity-80">
                    low-pressure start
                  </span>
                </Button>

                {SNOOZE_OPTIONS.map((option) => (
                  <Button
                    key={option.label}
                    onClick={() => handleSnooze(option)}
                    disabled={!!processing}
                    variant="outline"
                    className={`w-full h-12 justify-start ${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200"
                        : "hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
                    }`}
                  >
                    {processing === option.label ? (
                      <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 mr-3" />
                    )}
                    {option.label}
                  </Button>
                ))}

                <button
                  onClick={handleLeaveIt}
                  disabled={!!processing}
                  className={`w-full mt-2 text-sm ${
                    theme === "dark"
                      ? "text-gray-500 hover:text-gray-400"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  Not now, just leave it
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}