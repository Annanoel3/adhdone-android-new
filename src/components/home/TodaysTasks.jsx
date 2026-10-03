import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Pencil, Calendar, CalendarClock, ListChecks, RefreshCw, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { checkAndAwardAchievements } from "../utils/achievementTracker";
import { awardPoints, getPointsForAction } from "../utils/gamification";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { updateTodaysSummary } from "../utils/dailySummaryHelper";
import { isTodayTask, isUpcomingTask, firstDateMakesDeadline } from "../utils/todayTasks";
import { isBirthdayTask, passesBirthdayDayFilter } from "../utils/birthdayHelpers";
import { isSmartReminderTask } from "../utils/smartReminderTask";
import { pushWidgetTasks, pushAlarms } from "../utils/widgetBridge";
import { getReminderCopy } from "../utils/reminderCopy";
import { formatTimeRange } from "../utils/timeRangeLabel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTaskSort, sortTasks } from "@/hooks/useTaskSort";
import TaskSortDropdown from "../tasks/TaskSortDropdown";
import BreakIntoStepsButton from "../tasks/BreakIntoStepsButton";
import LifeAreaPill, { TagPill } from "../tasks/LifeAreaPill";
import PendingTaskCards, { usePendingCaptures } from "./PendingTaskCards";
import TaskCard from "../tasks/TaskCard";

export default function TodaysTasks({ tasks, theme, onTaskAction, onViewDetails, onUpdateTask, loadFailed = false, onRetry, onRefreshTasks, onEditTitle, onUncomplete, onSnooze, onDelete }) {
  const navigate = useNavigate();
  const { sortBy } = useTaskSort();
  const [reminderPopoverTaskId, setReminderPopoverTaskId] = useState(null);
  // Tasks still being set up go at the top of this list, as rows.
  const pending = usePendingCaptures();
  // Filter out subtasks, sort by the shared preference, then take the top 5.
  const activeTasks = sortTasks(
    // Birthdays only join the list on the day itself — never before.
    tasks.filter(t => t.status === 'active' && !t.parent_task_id && isTodayTask(t) && passesBirthdayDayFilter(t)),
    sortBy
  ).slice(0, 5);
  const now = new Date();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const upcomingTasks = tasks
    .filter(t => {
      if (t.status !== 'active' || t.parent_task_id || t.silenced) return false;
      if (!isUpcomingTask(t)) return false;
      const due = new Date(t.due_date || t.next_reminder);
      return due - now <= SEVEN_DAYS_MS;
    })
    .sort((a, b) => new Date(a.due_date || a.next_reminder) - new Date(b.due_date || b.next_reminder))
    .slice(0, 3);
  const [celebratingTaskId, setCelebratingTaskId] = React.useState(null);
  const [expandedTasks, setExpandedTasks] = React.useState({});
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  const dateInputRefs = useRef({});
  const timeInputRefs = useRef({});

  // Mirror today's list to the native home-screen widget. Runs on first render
  // (app open) and again whenever tasks change — completing, adding, or
  // re-dating a task updates the widget without the user reopening anything.
  React.useEffect(() => {
    pushWidgetTasks(tasks);
    // Same trigger keeps the phone's alarms in step (no-op unless the user has
    // alarms turned on and the app build has the plugin).
    pushAlarms(tasks);
  }, [tasks]);

  const getUrgencyColor = (urgency) => {
    if (theme === 'minimalist') {
      return {
        low: 'bg-gray-100 text-gray-600',
        medium: 'bg-blue-100 text-blue-700',
        high: 'bg-amber-100 text-amber-700',
        urgent: 'bg-red-100 text-red-700'
      }[urgency];
    } else if (theme === 'dark') {
      return {
        low: 'bg-gray-700 text-gray-300',
        medium: 'bg-blue-700 text-blue-200',
        high: 'bg-amber-700 text-amber-200',
        urgent: 'bg-red-700 text-red-200'
      }[urgency];
    }
    else {
      return {
        low: 'bg-teal-200 text-teal-800 font-medium',
        medium: 'bg-purple-200 text-purple-800 font-medium',
        high: 'bg-orange-200 text-orange-800 font-medium',
        urgent: 'bg-red-300 text-red-900 font-bold'
      }[urgency];
    }
  };

  const formatReminderInterval = (interval) => {
    const formats = {
      '10min': 'Every 10 minutes',
      '20min': 'Every 20 minutes',
      '30min': 'Every 30 minutes',
      '1hour': 'Every hour',
      '2hours': 'Every 2 hours',
      'daily': 'Daily',
      'every_other_day': 'Every other day',
      'once': 'Once'
    };
    return formats[interval] || interval;
  };

  const handleComplete = async (task) => {
    // Show celebration overlay immediately (fixed position, survives task removal)
    setCelebratingTaskId(task.id);
    setTimeout(() => setCelebratingTaskId(null), 1500);

    // Complete immediately — task disappears from the list right away.
    // Gamification runs in the background without blocking the UI.
    onTaskAction(task).catch(() => {});
    updateTodaysSummary().catch(() => {});
    
    const points = task.urgency === 'urgent' 
      ? getPointsForAction('urgent_task_completed')
      : getPointsForAction('task_completed');
    
    const hour = new Date().getHours();
    const bonusPoints = hour < 9 ? getPointsForAction('early_morning_task') : 0;
    
    awardPoints(points + bonusPoints).catch(() => {});
    
    base44.entities.Task.list('-updated_date', 500).then(allTasks => {
      const completedTasks = allTasks.filter(t => t.status === 'completed');
      base44.entities.DailySummary.list('-date', 1).then(summaries => {
        const currentStreak = summaries[0]?.streak_days || 0;
        checkAndAwardAchievements({
          totalTasksCompleted: completedTasks.length,
          streakDays: currentStreak,
          completedUrgentTask: task.urgency === 'urgent',
          completedBeforeNineAM: hour < 9
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  };

  const handleUrgencyChange = async (task, newUrgency) => {
    if (onUpdateTask) onUpdateTask({ ...task, urgency: newUrgency });
    base44.entities.Task.update(task.id, { urgency: newUrgency }).catch(error => {
      console.error("Error updating urgency:", error);
    });
  };

  const handleIntervalChange = async (task, newInterval) => {
    console.log('🔄 [INTERVAL CHANGE] Updating interval to:', newInterval);

    // Optimistic — update UI instantly
    if (onUpdateTask) onUpdateTask({ ...task, reminder_interval: newInterval });

    // Cancel existing reminders
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      try {
        const { cancelScheduledReminder } = await import('../utils/reminderScheduler');
        await cancelScheduledReminder(task.onesignal_notification_ids);
        console.log('🔄 [INTERVAL CHANGE] Cancelled old reminders');
      } catch (error) {
        console.error('Failed to cancel reminders:', error);
      }
    }
    
    const now = new Date();
    let nextReminder = new Date(task.next_reminder || now);

    // If switching FROM 'once' TO a recurring interval, we should ensure nextReminder is in the future.
    // If switching TO 'once', we might want to preserve an existing next_reminder or default to current date.
    if (newInterval !== 'once' && task.reminder_interval === 'once' && task.next_reminder) {
      nextReminder = new Date(task.next_reminder); // Use existing reminder as a base
    } else if (newInterval === 'once') {
        // When setting to 'once', if there's no existing next_reminder, use current date/time
        // Otherwise, keep the existing one.
        nextReminder = task.next_reminder ? new Date(task.next_reminder) : new Date();
    }


    switch (newInterval) {
      case '10min':
        nextReminder.setMinutes(nextReminder.getMinutes() + 10);
        break;
      case '20min':
        nextReminder.setMinutes(nextReminder.getMinutes() + 20);
        break;
      case '30min':
        nextReminder.setMinutes(nextReminder.getMinutes() + 30);
        break;
      case '1hour':
        nextReminder.setHours(nextReminder.getHours() + 1);
        break;
      case '2hours':
        nextReminder.setHours(nextReminder.getHours() + 2);
        break;
      case 'daily':
        if (nextReminder <= now) { // If nextReminder was in the past (e.g. from an old 'once' reminder)
          nextReminder.setDate(nextReminder.getDate() + 1);
        }
        break;
      case 'every_other_day':
        if (nextReminder <= now) {
          nextReminder.setDate(nextReminder.getDate() + 2);
        } else if (Math.floor((nextReminder.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) % 2 !== 0) {
          // If already set for tomorrow, and tomorrow is not an "every other day", push to day after
          // This ensures it aligns with 'every other day' logic from 'now'
          nextReminder.setDate(nextReminder.getDate() + 1);
        }
        break;
      case 'once': 
        // No automatic date advancement here. The combined date/time picker will handle setting it explicitly.
        // Ensure it's not in the past today by default, if it wasn't explicitly set.
        if (nextReminder <= now) {
            // If the default nextReminder (current time) is already in the past on current day, set it for next day
            if (nextReminder.toDateString() === now.toDateString()) {
                nextReminder.setDate(nextReminder.getDate() + 1);
            }
        }
        break;
      default:
        // For any unknown interval, default to daily if the time is past
        if (nextReminder <= now) {
          nextReminder.setDate(nextReminder.getDate() + 1);
        }
        break;
    }

    const intervalMs = {
      '10min': 10 * 60 * 1000,
      '20min': 20 * 60 * 1000,
      '30min': 30 * 60 * 1000,
      '1hour': 60 * 60 * 1000,
      '2hours': 2 * 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'every_other_day': 2 * 24 * 60 * 60 * 1000,
    };

    let newNotificationIds = [];
    let lastScheduledUntil = null;

    // Optimistic UI update — show the new interval immediately, before the
    // (slow) OneSignal scheduling round-trip completes.
    if (onUpdateTask) onUpdateTask({ ...task, reminder_interval: newInterval, next_reminder: nextReminder.toISOString() });

    // Schedule new reminders
    try {
      const currentUser = await base44.auth.me();
      
      if (newInterval === 'once') {
        // Schedule single one-time reminder
        const { scheduleReminder } = await import('../utils/reminderScheduler');
        const notificationId = await scheduleReminder({
          email: currentUser.email,
          ...getReminderCopy(task, nextReminder),
          sendAtISO: nextReminder.toISOString(),
          taskId: task.id,
          data: {
            screen: "/TaskNotification",
            taskId: task.id,
            urgency: task.urgency,
            type: 'task_reminder'
          }
        });
        if (notificationId) {
          newNotificationIds = [notificationId];
        }
        console.log('🔄 [INTERVAL CHANGE] Scheduled one-time reminder:', notificationId);
      } else if (intervalMs[newInterval]) {
        // Schedule recurring reminders (10 at a time)
        const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
        const recurringResult = await scheduleRecurringReminders({
          email: currentUser.email,
          ...getReminderCopy(task, nextReminder),
          startTime: nextReminder.toISOString(),
          intervalMs: intervalMs[newInterval],
          count: 10,
          taskId: task.id,
          data: {
            screen: "/TaskNotification",
            taskId: task.id,
            urgency: task.urgency,
            type: 'task_reminder'
          }
        });
        newNotificationIds = recurringResult.notificationIds || [];
        lastScheduledUntil = recurringResult.lastScheduledUntil || null;
        console.log('🔄 [INTERVAL CHANGE] Scheduled recurring reminders:', newNotificationIds.length);
      }
    } catch (error) {
      console.error('Failed to schedule new reminders:', error);
    }

    // Sync the computed next_reminder + notification IDs
    if (onUpdateTask) onUpdateTask({ ...task, reminder_interval: newInterval, next_reminder: nextReminder.toISOString(), onesignal_notification_ids: newNotificationIds });

    base44.entities.Task.update(task.id, { 
      reminder_interval: newInterval,
      next_reminder: nextReminder.toISOString(),
      onesignal_notification_ids: newNotificationIds,
      ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
    }).catch(error => {
      console.error("Error updating interval:", error);
    });
  };

  const handleReminderDateChange = async (task, newDate, newTime) => {
    let updatedNextReminder;

    if (newDate) {
        // Parse date components explicitly to avoid UTC midnight crossing
        const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
        const timeStr = newTime || (task.next_reminder ? getCurrentReminderTime(task) : '09:00');
        const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10));
        updatedNextReminder = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else if (newTime) {
        const existingDate = task.next_reminder ? new Date(task.next_reminder) : new Date();
        const [hours, minutes] = newTime.split(':').map(n => parseInt(n, 10));
        updatedNextReminder = new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate(), hours, minutes, 0, 0);
    } else {
        return;
    }

    console.log(`📅 [REMINDER DATE] Setting reminder for ${updatedNextReminder.toLocaleString()} (${updatedNextReminder.toISOString()})`);

    if (onUpdateTask) onUpdateTask({ ...task, next_reminder: updatedNextReminder.toISOString() });
    base44.entities.Task.update(task.id, { 
      next_reminder: updatedNextReminder.toISOString()
    }).catch(error => {
      console.error("Error updating reminder date:", error);
    });
  };

  const handleDueDateChange = async (task, newDate) => {
    let dueDateValue = null;
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
      const existing = task.due_date ? new Date(task.due_date) : null;
      const hours = existing ? existing.getHours() : 17;
      const minutes = existing ? existing.getMinutes() : 0;
      dueDateValue = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
    }
    // A one-time task whose pill shows its date: the reminders booked for
    // the old day move with it — the same move the details card makes
    // (moveRemindersToDate). This pill used to change due_date only, and every
    // reminder kept going off for the old day. Removing the date, adding one
    // to a task that only had a reminder time (a deadline, not a move), or a
    // smart-reminder task (nothing booked) still just saves the date.
    const booked = (task.onesignal_notification_ids || []).length > 0 || (task.reminder_schedule || []).length > 0;
    if (dueDateValue && task.due_date && task.reminder_interval === 'once' && booked) {
      const updates = { due_date: dueDateValue, next_reminder: dueDateValue };
      if (onUpdateTask) onUpdateTask({ ...task, ...updates, reminder_schedule: [], onesignal_notification_ids: [] });
      (async () => {
        try {
          const { moveRemindersToDate } = await import('../utils/multiReminderScheduler');
          await moveRemindersToDate(task, dueDateValue, updates);
          // The fresh record carries the new plan, and handing it back here
          // also re-sends the phone's alarm set (see the effect above).
          const fresh = await base44.entities.Task.get(task.id).catch(() => null);
          if (fresh && onUpdateTask) onUpdateTask(fresh);
        } catch (error) {
          console.error("Error moving reminders to the new date:", error);
        }
      })();
      return;
    }
    // A first date makes the task a deadline ("by") — see todayTasks.
    const updates = { due_date: dueDateValue, ...firstDateMakesDeadline(task, dueDateValue) };
    if (onUpdateTask) onUpdateTask({ ...task, ...updates });
    base44.entities.Task.update(task.id, updates).catch(error => {
      console.error("Error updating due date:", error);
    });
  };

  const getCurrentReminderTime = (task) => {
    if (!task.next_reminder) return '';
    const date = new Date(task.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getCurrentReminderDate = (task) => {
    if (!task.next_reminder) return '';
    const date = new Date(task.next_reminder);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatReminderDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // A repeating task's closed card says WHEN it repeats — "Daily at 10 AM",
  // "Mon, Wed at 6 PM" — as one pill, instead of a reminder interval ("Every
  // hour" is how it nags after the time, not when it's due) and a date pill.
  // The time is the one the person named (anchor_time).
  const isRepeating = (t) => !!t.recurrence_pattern && t.recurrence_pattern !== 'none';
  const repeatScheduleLabel = (t) => {
    const words = {
      daily: 'Daily', every_other_day: 'Every other day', weekdays: 'Weekdays', weekly: 'Weekly',
      every_other_week: 'Every other week', monthly: 'Monthly', yearly: 'Yearly',
    };
    const days = t.recurrence_pattern === 'weekly' && Array.isArray(t.recurrence_days) && t.recurrence_days.length
      ? t.recurrence_days.map((n) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]).filter(Boolean).join(', ')
      : words[t.recurrence_pattern] || String(t.recurrence_pattern).replace(/_/g, ' ');
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t.anchor_time || ''));
    if (!m) return days;
    const h = Number(m[1]);
    const time = `${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`} ${h < 12 ? 'AM' : 'PM'}`;
    return `${days} at ${time}`;
  };

  // The "when" of a timed task that has no due date: the reminder time itself
  // ("Today 4:20 PM", "Sep 24, 9:00 AM"). A task you just timed should never
  // look like one with no timing at all.
  const formatReminderMoment = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return date.toDateString() === new Date().toDateString() ? `Today ${time}` : `${formatReminderDate(dateString)}, ${time}`;
  };

  // For events, the pill shows date AND time (e.g. "Sep 1, 11:25 AM") — an
  // event without its time is useless. Uses event_time when set, else due_date.
  const formatEventDateTime = (task) => {
    const at = task.event_time || task.due_date || task.next_reminder;
    if (!at) return null;
    const date = new Date(at);
    if (task.day_only_task) return `${formatReminderDate(at)} • all day`;
    // A block of time beats a single start: "Sep 1, 10:00 AM – 6:00 PM".
    const range = formatTimeRange(task);
    if (range) return `${formatReminderDate(at)}, ${range}`;
    return `${formatReminderDate(at)}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };
  const isEvent = (task) => task.classification === 'event';

  const getSubtasks = (taskId) => {
    return tasks
      .filter(t => t.parent_task_id === taskId)
      .sort((a, b) => {
        const ao = typeof a.subtask_order === 'number' ? a.subtask_order : 9999;
        const bo = typeof b.subtask_order === 'number' ? b.subtask_order : 9999;
        if (ao !== bo) return ao - bo;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });
  };

  const toggleTaskExpansion = (taskId) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
      specialMode === 'normal' ? (
        theme === 'minimalist'
          ? 'bg-white/80 backdrop-blur-sm'
            : theme === 'dark'
            ? 'bg-gray-800 border border-gray-700'
            : 'bg-white/80 backdrop-blur-sm'
      ) : ''
    }`}>
      <CardHeader className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
            <Clock className="w-5 h-5" />
            Today's Focus
          </CardTitle>
          <div className="flex items-center gap-2">
            <TaskSortDropdown />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("Tasks"))}
              className={`text-sm ${theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : ''}`}
            >
              View All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          <PendingTaskCards theme={theme} captures={pending} />
          {activeTasks.length === 0 && pending.length === 0 && loadFailed ? (
            <div className="text-center py-10">
              <p className={`${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'} font-semibold`}>
                Couldn't load your tasks just now.
              </p>
              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                They're all still saved. Check your connection and try again.
              </p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
                  <RefreshCw className="w-4 h-4 mr-2" /> Try again
                </Button>
              )}
            </div>
          ) : activeTasks.length === 0 && pending.length === 0 ? (
            <div className="text-center py-10">
              <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center ${
                theme === 'minimalist' ? 'bg-green-100' :
                theme === 'dark' ? 'bg-green-700' :
                'bg-gradient-to-br from-purple-100 to-orange-100'
              }`}>
                <CheckCircle2 className={`w-7 h-7 ${
                  theme === 'minimalist' ? 'text-green-600' :
                  theme === 'dark' ? 'text-green-200' :
                  'text-purple-600'
                }`} />
              </div>
              <p className={`${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'} font-semibold`}>
                Nothing due today yet, why don't we make a task?
              </p>
            </div>
          ) : activeTasks.map((task) => (
            // The same card as the Tasks page, so the two lists look and work
            // alike — chips, expand, snooze, delete, title edit — and an edit
            // on either shows on both (Anna, Oct 3 2026). The old Home-only
            // card markup is gone.
            <TaskCard
              key={task.id}
              task={task}
              theme={theme}
              onRefreshTasks={onRefreshTasks}
              onUpdateTask={onUpdateTask}
              onEditTitle={onEditTitle}
              onEdit={onViewDetails}
              onComplete={handleComplete}
              onUncomplete={onUncomplete}
              onSnooze={onSnooze}
              onShowDetails={onViewDetails}
              onDelete={onDelete}
              subtaskCount={getSubtasks(task.id).length}
              completedSubtaskCount={getSubtasks(task.id).filter((st) => st.status === 'completed').length}
              subtasks={getSubtasks(task.id)}
            />
          ))}
        </div>

        {upcomingTasks.length > 0 && (
          <div className={`mt-5 pt-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`} />
              <h4 className={`text-sm font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-200' : 'text-gray-600'}`}>
                Coming up
              </h4>
            </div>
            <div className="space-y-2">
              {upcomingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onViewDetails(t)}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    theme === 'minimalist'
                      ? 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      : theme === 'dark'
                        ? 'bg-gray-900/40 border-gray-700 hover:border-gray-600 hover:bg-gray-800/40'
                        : 'bg-white/60 border-purple-100 hover:border-purple-200 hover:bg-purple-50/50'
                  }`}
                >
                  <span className={`text-sm font-medium truncate ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'}`}>
                    {t.title}
                  </span>
                  <span className={`flex items-center gap-1 text-xs flex-shrink-0 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    <Calendar className="w-3 h-3" />
                    {/* A repeating task's next occurrence has no due date, only the day it's for. */}
                    {formatReminderDate(t.due_date || t.next_reminder)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          onClick={() => navigate(createPageUrl("Tasks"))}
          variant="outline"
          className={`w-full mt-5 ${
            theme === 'minimalist'
              ? 'border-gray-200 text-gray-700 hover:bg-gray-50'
              : theme === 'dark'
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-purple-200 text-purple-700 hover:bg-purple-50'
          }`}
        >
          See all
        </Button>
      </CardContent>
    </Card>
  );
}