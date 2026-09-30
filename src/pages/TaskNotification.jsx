import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Zap, Loader2, Send, Sparkles, Mic, ListChecks } from "lucide-react";
import BirthdayTextDialog from "../components/birthdays/BirthdayTextDialog";
import { createPageUrl } from "@/utils";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { cancelScheduledReminder } from "../components/utils/reminderScheduler";
import { snoozeTask, recordReminderDismissed } from "../components/utils/snoozeTask";
import { usePluginPresent } from "../components/shared/WidgetTaskSync";

// An event the reminder planner worded for recording notes (see NOTES_LABELS in
// base44/functions/generateReminderSchedule) gets "Jot down questions" before it
// and "Record notes" around it, on app builds that can record (36+).
const NOTES_LABELS = ["night before · questions", "at the time · record notes"];

function notesButtonsFor(task, nowMs) {
  if (typeof window === "undefined" || !window.Capacitor?.Plugins?.RecorderBridge) return null;
  if (!task || task.classification !== "event") return null;
  const flagged = (task.reminder_schedule || []).some((r) => NOTES_LABELS.includes(r?.label))
    || (task.prep_questions || []).length > 0;
  if (!flagged) return null;
  const start = new Date(task.event_time || task.next_reminder || "").getTime();
  if (!Number.isFinite(start)) return null;
  const prep = nowMs < start;
  const record = nowMs >= start - 20 * 60 * 1000 && nowMs <= start + 3 * 60 * 60 * 1000;
  return prep || record ? { prep, record } : null;
}

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
  // Leaving this page without completing or snoozing — back, Dismiss, the
  // home button — changes nothing about the task's reminders. It is only
  // counted. Opened from a full-screen alarm (?from=alarm), the alarm already
  // counted it, so this page stays quiet.
  const actedRef = React.useRef(false);
  const taskRef = React.useRef(null);
  const autoDoneRef = React.useRef(false);
  useEffect(() => {
    const fromAlarm = new URLSearchParams(window.location.search).get('from') === 'alarm';
    return () => {
      if (!fromAlarm && !actedRef.current && taskRef.current) recordReminderDismissed(taskRef.current);
    };
  }, []);
  const [showBirthdayDraft, setShowBirthdayDraft] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  // The recorder plugin can land a moment after this page renders; the
  // notes buttons below re-check once it has.
  const recorderPresent = usePluginPresent('RecorderBridge');

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
      taskRef.current = tasks[0];
      setIsLoading(false);

      // "Done ✓" on the phone's alarm opens this page with done=1: finish the
      // task right away, the same way this page's own Done button does.
      if (urlParams.get('done') === '1' && !autoDoneRef.current) {
        autoDoneRef.current = true;
        handleComplete(tasks[0]);
      }
    } catch (error) {
      console.error("Error loading task:", error);
      navigate(createPageUrl("Home"));
    }
  };

  const handleComplete = async (given) => {
    const task = given && given.id ? given : taskRef.current;
    if (!task) return;
    actedRef.current = true;
    // Already finished (a second tap, or a reminder about it that came back):
    // don't finish it again — that made an extra copy of a repeating task.
    if (task.status === 'completed') {
      navigate(createPageUrl("Home"), {
        state: { reload: true, message: "Already done ✓" }
      });
      return;
    }
    setProcessingAction('complete');

    try {
      const now = new Date();
      await base44.entities.Task.update(task.id, {
        status: 'completed',
        completed_at: now.toISOString()
      });
    } catch (error) {
      console.error("Error completing task:", error);
      setProcessingAction(null);
      return;
    }

    // The task is done — that is the one call worth waiting for. What follows
    // is bookkeeping: the next copy of a repeating task, cancelling the pushes
    // still booked, today's summary. It used to run here, one request after
    // another, before the page moved on: 10–15 seconds on a phone connection
    // with the Done button spinning, which looked like the app had frozen. It
    // runs in the background now; Home reloads once the next copy exists.
    (async () => {
      // A repeating task finished from its own reminder screen used to end
      // here for good — only Home and the task list made the next occurrence.
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
        try {
          const { createNextRecurrence } = await import('../components/utils/taskRecurrence');
          await createNextRecurrence(task);
          window.dispatchEvent(new CustomEvent('tasks-changed'));
        } catch (e) {
          console.error('Failed to create next recurrence:', e);
        }
      }
      // Cancel any remaining scheduled notifications
      if (task.onesignal_notification_ids?.length > 0) {
        await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
      }
      await updateTodaysSummary().catch(() => {});
    })();

    navigate(createPageUrl("Home"), {
      state: { reload: true, message: "Great job! Task completed! 🎉" }
    });
  };

  const handleSnooze = async (minutes) => {
    if (!task) return;
    actedRef.current = true;
    setProcessingAction(`snooze-${minutes}`);

    try {
      // Shared helper: the task stays active and one reminder is booked at the
      // snoozed time. (The old "snoozed" status silenced the task for good.)
      await snoozeTask(task, minutes);

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
  const notesButtons = recorderPresent ? notesButtonsFor(task, Date.now()) : null;
  const openNotes = (what) => {
    actedRef.current = true; // going to prep or record isn't brushing the reminder off
    navigate(`${createPageUrl("Notes")}?task=${encodeURIComponent(task.id)}&${what}=1`);
  };

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

          {/* Birthday text button — shown when the task is a birthday with a saved message */}
          {task.birthday_person && task.birthday_text_message && (
            <Button
              onClick={async () => {
                const body = encodeURIComponent(task.birthday_text_message);
                try {
                  await base44.entities.Task.update(task.id, { birthday_text_sent: true });
                } catch (e) {
                  console.error('Failed to mark text as sent:', e);
                }
                const cleanPhone = (task.birthday_phone_number || "").replace(/[^0-9+]/g, "");
                window.location.href = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?&body=${body}`;
              }}
              disabled={isProcessing}
              className={`w-full h-14 text-lg mb-4 ${
                theme === 'minimalist'
                  ? 'bg-pink-600 hover:bg-pink-700'
                  : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700'
              }`}
            >
              <Send className="w-5 h-5 mr-2" />
              Send Birthday Text 🎂
            </Button>
          )}

          {/* Draft birthday text button — shown when the task is a birthday with no saved message */}
          {task.birthday_person && !task.birthday_text_message && (
            <Button
              onClick={() => setShowBirthdayDraft(true)}
              disabled={isProcessing}
              className={`w-full h-14 text-lg mb-4 ${
                theme === 'minimalist'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Draft Birthday Text 🎂
            </Button>
          )}

          {notesButtons && (
            <div className="flex gap-2 mb-4">
              {notesButtons.prep && (
                <Button variant="outline" onClick={() => openNotes("prep")} disabled={isProcessing} className="flex-1 h-12">
                  <ListChecks className="w-5 h-5 mr-2" />
                  {(task.prep_questions || []).length ? `Questions (${task.prep_questions.length})` : "Jot down questions"}
                </Button>
              )}
              {notesButtons.record && (
                <Button onClick={() => openNotes("record")} disabled={isProcessing} className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white">
                  <Mic className="w-5 h-5 mr-2" />
                  Record notes
                </Button>
              )}
            </div>
          )}

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

          <BirthdayTextDialog
            isOpen={showBirthdayDraft}
            onClose={() => setShowBirthdayDraft(false)}
            birthdayTask={task}
            onSaved={() => {
              setShowBirthdayDraft(false);
              loadTask();
            }}
          />

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