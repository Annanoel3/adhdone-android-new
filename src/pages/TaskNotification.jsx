import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Zap, Loader2 } from "lucide-react";
import { createPageUrl } from "@/utils";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { scheduleReminder, cancelScheduledReminder } from "../components/utils/reminderScheduler";

const SNOOZE_OPTIONS = [
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];

export default function TaskNotification() {
  const navigate = useNavigate();
  const location = useLocation();
  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState(null); // 'complete' | 'snooze-N'
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    const interval = setInterval(() => {
      setTheme(localStorage.getItem('adhd_theme') || 'minimalist');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTask();
  }, [location]);

  const loadTask = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const taskId = urlParams.get('taskId');

      if (!taskId) {
        navigate(createPageUrl("Home"));
        return;
      }

      const tasks = await base44.entities.Task.filter({ id: taskId });
      if (tasks.length === 0) {
        navigate(createPageUrl("Home"));
        return;
      }

      setTask(tasks[0]);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading task:", error);
      navigate(createPageUrl("Home"));
    }
  };

  const handleComplete = async () => {
    if (!task) return;
    setProcessingAction('complete');

    try {
      const now = new Date();
      await base44.entities.Task.update(task.id, {
        status: 'completed',
        completed_at: now.toISOString()
      });

      // Cancel any remaining scheduled notifications
      if (task.onesignal_notification_ids?.length > 0) {
        await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
      }

      await updateTodaysSummary();

      navigate(createPageUrl("Home"), {
        state: { reload: true, message: "Great job! Task completed! 🎉" }
      });
    } catch (error) {
      console.error("Error completing task:", error);
      setProcessingAction(null);
    }
  };

  const handleSnooze = async (minutes) => {
    if (!task) return;
    setProcessingAction(`snooze-${minutes}`);

    try {
      const user = await base44.auth.me();
      const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);

      // Cancel existing notifications so we don't get double-reminded
      if (task.onesignal_notification_ids?.length > 0) {
        await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
      }

      // Schedule a new reminder at the snoozed time (same as task creation pattern)
      const notificationId = await scheduleReminder({
        email: user.email,
        title: "Task Reminder 📋",
        body: `${task.title}\n\nTap to mark as complete!`,
        sendAtISO: snoozeUntil.toISOString(),
        taskId: task.id,
        data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency, type: 'task_reminder' },
        buttons: [
          { id: "snooze_30", text: "Snooze 30 min" },
          { id: "snooze_60", text: "Snooze 1 hour" },
          { id: "complete", text: "✅ Done" }
        ]
      });

      await base44.entities.Task.update(task.id, {
        status: 'snoozed',
        snooze_count: (task.snooze_count || 0) + 1,
        consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
        next_reminder: snoozeUntil.toISOString(),
        onesignal_notification_ids: notificationId ? [notificationId] : []
      });

      const label = SNOOZE_OPTIONS.find(o => o.minutes === minutes)?.label || `${minutes} min`;
      navigate(createPageUrl("Home"), {
        state: { reload: true, message: `Snoozed! Reminder in ${label} ⏰` }
      });
    } catch (error) {
      console.error("Error snoozing task:", error);
      setProcessingAction(null);
    }
  };

  const getUrgencyColor = (urgency) => {
    if (theme === 'minimalist') {
      return {
        low: 'bg-gray-100 text-gray-600 border-gray-200',
        medium: 'bg-blue-100 text-blue-700 border-blue-200',
        high: 'bg-amber-100 text-amber-700 border-amber-200',
        urgent: 'bg-red-100 text-red-700 border-red-200'
      }[urgency] || '';
    }
    return {
      low: 'bg-teal-200 text-teal-800 border-teal-300',
      medium: 'bg-purple-200 text-purple-800 border-purple-300',
      high: 'bg-orange-200 text-orange-800 border-orange-300',
      urgent: 'bg-red-300 text-red-900 border-red-400 font-bold'
    }[urgency] || '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!task) return null;

  const isProcessing = !!processingAction;

  return (
    <div className={`min-h-screen p-4 flex items-center justify-center ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
    }`}>
      <Card className={`w-full max-w-md border-none shadow-2xl ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              theme === 'dark' ? 'bg-purple-900/30' : 'bg-gradient-to-br from-purple-100 to-pink-100'
            }`}>
              <Clock className={`w-8 h-8 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={`text-2xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Task Reminder
            </h2>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Time to check in on this task
            </p>
          </div>

          {/* Task info */}
          <div className={`p-4 rounded-xl mb-6 ${
            theme === 'dark' ? 'bg-gray-900/50' : 'bg-purple-50/60'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {task.title}
            </h3>
            <div className="flex flex-wrap gap-2">
              {task.urgency && (
                <Badge className={`${getUrgencyColor(task.urgency)} border`}>{task.urgency}</Badge>
              )}
              {task.energy_required && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {task.energy_required} energy
                </Badge>
              )}
            </div>
            {task.description && (
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                {task.description}
              </p>
            )}
          </div>

          {/* Complete button */}
          <Button
            onClick={handleComplete}
            disabled={isProcessing}
            className={`w-full h-14 text-lg mb-4 ${
              theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
            }`}
          >
            {processingAction === 'complete' ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5 mr-2" />
            )}
            ✅ Yes, I did this!
          </Button>

          {/* Snooze options — shown directly, no extra tap needed */}
          <div className={`rounded-xl p-3 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-3 text-center ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              ⏰ Not yet — remind me in...
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SNOOZE_OPTIONS.map(({ label, minutes }) => (
                <Button
                  key={minutes}
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => handleSnooze(minutes)}
                  className={`h-11 text-sm font-medium ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200'
                      : 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                  } ${processingAction === `snooze-${minutes}` ? 'opacity-70' : ''}`}
                >
                  {processingAction === `snooze-${minutes}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    label
                  )}
                </Button>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate(createPageUrl("Home"))}
            disabled={isProcessing}
            className={`w-full mt-4 text-sm ${
              theme === 'dark' ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Dismiss
          </button>
        </CardContent>
      </Card>
    </div>
  );
}