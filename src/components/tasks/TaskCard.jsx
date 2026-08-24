import React, { useState, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Task } from "@/entities/Task";
import {
  CheckCircle2,
  Circle,
  Clock,
  Zap,
  ListChecks,
  Bell,
  BellOff,
  Trash2,
  Calendar,
  CalendarClock,
  Pencil,
  ChevronDown,
  ChevronRight,
  Rocket,
  PlayCircle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import LaunchButtons from "../launch/LaunchButtons";

export default function TaskCard({
  task,
  theme,
  onRefreshTasks,
  onUpdateTask,
  onEditTitle,
  onEdit,
  onComplete,
  onUncomplete,
  onSnooze,
  onShowDetails,
  onDelete,
  subtaskCount,
  completedSubtaskCount,
  subtasks,
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [subtasksExpanded, setSubtasksExpanded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  const isSeasonalTheme = () => {
    return ['christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly', 'summer', 'spring', 'kawaii', 'halloween', 'fall', 'winter'].includes(specialMode);
  };

  const getUrgencyColor = (urgency) => {
    if (theme === 'minimalist') {
      return {
        low: 'bg-gray-100 text-gray-600 border-gray-200',
        medium: 'bg-blue-100 text-blue-700 border-blue-200',
        high: 'bg-amber-100 text-amber-700 border-amber-200',
        urgent: 'bg-red-100 text-red-700 border-red-200'
      }[urgency];
    } else if (theme === 'dark') {
      return {
        low: 'bg-gray-700 text-gray-300 border-gray-600',
        medium: 'bg-blue-900 text-blue-300 border-blue-700',
        high: 'bg-amber-900 text-amber-300 border-amber-700',
        urgent: 'bg-red-900 text-red-300 border-red-700'
      }[urgency];
    } else {
      return {
        low: 'bg-teal-200 text-teal-800 border-teal-300 font-medium',
        medium: 'bg-purple-200 text-purple-800 border-purple-300 font-medium',
        high: 'bg-orange-200 text-orange-800 border-orange-300 font-medium',
        urgent: 'bg-red-300 text-red-900 border-red-400 font-bold'
      }[urgency];
    }
  };

  const dueDate = task.next_reminder ? new Date(task.next_reminder) : new Date(task.created_date);

  const isEvent = task.classification === 'event';
  const typeEmoji = task.classification === 'event' ? '📅' : task.classification === 'birthday' ? '🎂' : null;

  const taskDate = dueDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: dueDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  const today = new Date();
  const isToday = dueDate.getFullYear() === today.getFullYear() &&
    dueDate.getMonth() === today.getMonth() &&
    dueDate.getDate() === today.getDate();

  const formatReminderInterval = (interval) => {
    const formats = {
      '10min': 'Every 10 min',
      '20min': 'Every 20 min',
      '30min': 'Every 30 min',
      '1hour': 'Every hour',
      '2hours': 'Every 2 hours',
      'daily': 'Daily',
      'every_other_day': 'Every other day',
      'once': 'Once'
    };
    return formats[interval] || interval;
  };

  const formatReminderTime = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleCompleteTask = () => {
    onComplete(task);
  };

  const handleDeleteTask = async () => {
    if (confirm(`Delete "${task.title}"?`)) {
      // Cancel any pending OneSignal notifications before deleting
      if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
        try {
          const { base44 } = await import('@/api/base44Client');
          await base44.functions.invoke('cancelTaskNotifications', { taskId: task.id });
          console.log('Cancelled pending notifications for task:', task.id);
        } catch (error) {
          console.error('Error canceling notifications:', error);
        }
      }
      onDelete(task);
    }
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || editedTitle === task.title) {
      setEditedTitle(task.title);
      setIsEditingTitle(false);
      return;
    }

    try {
      await onEditTitle(task.id, editedTitle.trim());
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Error updating task title:", error);
      setEditedTitle(task.title);
      setIsEditingTitle(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditedTitle(task.title);
      setIsEditingTitle(false);
    }
  };

  const handleIntervalChange = async (newInterval) => {
    try {
      const now = new Date();
      let nextReminder = new Date();

      if (task.next_reminder) {
        nextReminder = new Date(task.next_reminder);
      } else {
        if (newInterval === 'once') {
          nextReminder.setTime(now.getTime() + (10 * 60 * 1000));
        }
      }

      if (newInterval !== 'once') {
        switch (newInterval) {
          case '10min':
            if (nextReminder < now) nextReminder = new Date(now.getTime() + 10 * 60 * 1000);
            break;
          case '20min':
            if (nextReminder < now) nextReminder = new Date(now.getTime() + 20 * 60 * 1000);
            break;
          case '30min':
            if (nextReminder < now) nextReminder = new Date(now.getTime() + 30 * 60 * 1000);
            break;
          case '1hour':
            if (nextReminder < now) nextReminder = new Date(now.getTime() + 60 * 60 * 1000);
            break;
          case '2hours':
            if (nextReminder < now) nextReminder = new Date(now.getTime() + 2 * 60 * 60 * 1000);
            break;
          case 'daily':
            if (nextReminder < now) {
              nextReminder.setDate(nextReminder.getDate() + 1);
            }
            break;
          case 'every_other_day':
            if (nextReminder < now) {
              nextReminder.setDate(nextReminder.getDate() + 2);
            }
            break;
        }
      } else {
        if (nextReminder < now) {
          nextReminder.setTime(now.getTime() + (10 * 60 * 1000));
        }
      }

      // Optimistic — update UI instantly
      if (onUpdateTask) onUpdateTask({ ...task, reminder_interval: newInterval, next_reminder: nextReminder.toISOString() });

      // Cancel + save in the background
      (async () => {
        try {
          if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
            const { base44 } = await import('@/api/base44Client');
            await base44.functions.invoke('cancelTaskNotifications', { taskId: task.id });
          }
          await Task.update(task.id, {
            reminder_interval: newInterval,
            next_reminder: nextReminder.toISOString()
          });
        } catch (error) {
          console.error("Error updating interval:", error);
          if (onRefreshTasks) onRefreshTasks();
        }
      })();
    } catch (error) {
      console.error("Error updating interval:", error);
    }
  };

  const handleReminderTimeChange = async (newTime) => {
    try {
      const [hours, minutes] = newTime.split(':');
      const nextReminder = new Date(task.next_reminder || new Date());
      nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      await Task.update(task.id, {
        next_reminder: nextReminder.toISOString()
      });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating reminder time:", error);
    }
  };

  const handleUrgencyChange = async (newUrgency) => {
    if (onUpdateTask) onUpdateTask({ ...task, urgency: newUrgency });
    Task.update(task.id, { urgency: newUrgency }).catch(error => {
      console.error("Error updating urgency:", error);
      if (onRefreshTasks) onRefreshTasks();
    });
  };

  const handleEnergyChange = async (newEnergy) => {
    if (onUpdateTask) onUpdateTask({ ...task, energy_required: newEnergy });
    Task.update(task.id, { energy_required: newEnergy }).catch(error => {
      console.error("Error updating energy:", error);
      if (onRefreshTasks) onRefreshTasks();
    });
  };

  // Back Burner — silence/reactivate all notifications for this task. The
  // onTaskUpdate automation handles cancelling/rescheduling OneSignal pushes.
  const handleToggleSilenced = async () => {
    const newSilenced = !task.silenced;
    if (onUpdateTask) onUpdateTask({ ...task, silenced: newSilenced });
    Task.update(task.id, { silenced: newSilenced }).catch(error => {
      console.error("Error toggling silenced:", error);
      if (onRefreshTasks) onRefreshTasks();
    });
  };

  const getCurrentReminderTime = (taskItem) => {
    if (!taskItem.next_reminder) return '';
    const date = new Date(taskItem.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getCurrentReminderDate = (taskItem) => {
    if (!taskItem.next_reminder) return '';
    const date = new Date(taskItem.next_reminder);
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

  // Multi-day events: show "Dec 3 – Dec 7" when end_date is set on a
  // different day than the start.
  const formatEventDateRange = () => {
    if (!task.next_reminder) return null;
    const startStr = formatReminderDate(task.next_reminder);
    if (!task.end_date) return startStr;
    if (new Date(task.next_reminder).toDateString() === new Date(task.end_date).toDateString()) return startStr;
    return `${startStr} – ${formatReminderDate(task.end_date)}`;
  };

  const shortInterval = (interval) => {
    const m = { '10min':'10m','20min':'20m','30min':'30m','1hour':'1h','2hours':'2h','4hours':'4h','daily':'Daily','every_other_day':'2 days','once':'Once' };
    return m[interval] || interval;
  };

  // Single collapsed-line date label: for one-time tasks the next_reminder IS
  // the date the user picked — it must win over a stale due_date.  For
  // recurring tasks the due_date (deadline) still takes priority.
  const collapsedDate = (() => {
    if (task.reminder_interval === 'once' && task.next_reminder) {
      // Multi-day events show the full span (e.g. "Dec 3 – Dec 7") on the
      // collapsed card instead of just the start date.
      if (task.end_date && new Date(task.next_reminder).toDateString() !== new Date(task.end_date).toDateString()) {
        return { label: formatEventDateRange(), overdue: false, isTodayLabel: false };
      }
      return { label: isToday ? 'Today' : formatReminderDate(task.next_reminder), overdue: false, isTodayLabel: isToday };
    }
    if (task.due_date) {
      const dd = new Date(task.due_date);
      const overdue = dd.getTime() < Date.now() && task.status !== 'completed';
      const dueToday = dd.toDateString() === today.toDateString();
      // A due date that lands on today reads "Today" (matching the next_reminder
      // path) so the badge is consistent across all tasks owed today.
      return {
        label: dueToday && !overdue ? 'Today' : formatReminderDate(task.due_date),
        overdue,
        isTodayLabel: dueToday && !overdue,
      };
    }
    if (task.next_reminder) {
      return { label: isToday ? 'Today' : formatReminderDate(task.next_reminder), overdue: false, isTodayLabel: isToday };
    }
    if (task.reminder_interval && task.reminder_interval !== 'once') {
      // A recurring task with no due date is owed today — show "Today" to
      // match sibling tasks in the Today list. The interval frequency itself
      // is still visible in the expanded card.
      return { label: 'Today', overdue: false, isTodayLabel: true };
    }
    return null;
  })();

  const handleReminderDateChange = async (newDate, newTime) => {
    try {
      let nextReminder;

      if (newDate) {
        const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
        const timeStr = newTime || (task.next_reminder ? getCurrentReminderTime(task) : '09:00');
        const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10));
        nextReminder = new Date(year, month - 1, day, hours, minutes, 0, 0);
      } else if (newTime) {
        const existingDate = task.next_reminder ? new Date(task.next_reminder) : new Date();
        const [hours, minutes] = newTime.split(':').map(n => parseInt(n, 10));
        nextReminder = new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate(), hours, minutes, 0, 0);
      } else {
        return;
      }

      const interval = task.reminder_interval;

      // Optimistic — update UI instantly
      if (onUpdateTask) onUpdateTask({ ...task, next_reminder: nextReminder.toISOString() });

      if (interval && interval !== 'once') {
        // Recurring task: the onTaskUpdate entity automation handles cancelling old
        // notifications and rescheduling new ones. Frontend only updates next_reminder.
        Task.update(task.id, {
          next_reminder: nextReminder.toISOString()
        }).catch(error => {
          console.error("Error updating reminder date/time:", error);
          if (onRefreshTasks) onRefreshTasks();
        });
      } else {
        // One-time task: backend automation skips these, so frontend must cancel + reschedule.
        // Fire in the background — UI already updated optimistically.
        (async () => {
          try {
            if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
              const { cancelScheduledReminder } = await import('../utils/reminderScheduler');
              await cancelScheduledReminder(task.onesignal_notification_ids).catch(e => console.error("Cancel failed:", e));
            }

            const { base44 } = await import('@/api/base44Client');
            const currentUser = await base44.auth.me();

            const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
            const multiIds = await scheduleMultiReminders({
              email: currentUser.email,
              title: task.title,
              scheduledDateISO: nextReminder.toISOString(),
              taskId: task.id,
              urgency: task.urgency,
            });

            let notificationIds = [];
            if (multiIds) {
              notificationIds = multiIds;
            } else {
              const { scheduleReminder } = await import('../utils/reminderScheduler');
              const notificationId = await scheduleReminder({
                email: currentUser.email,
                title: "Task Reminder 📋",
                body: `${task.title}\n\nTap to mark as complete!`,
                sendAtISO: nextReminder.toISOString(),
                taskId: task.id,
                data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency, type: 'task_reminder' },
                buttons: [{ id: "snooze_15", text: "Snooze 15 min" }, { id: "snooze_60", text: "Snooze 1 hour" }, { id: "complete", text: "✅ Done" }]
              });
              if (notificationId) notificationIds = [notificationId];
            }

            await Task.update(task.id, {
              next_reminder: nextReminder.toISOString(),
              onesignal_notification_ids: notificationIds,
              reminder_schedule: multiIds ? undefined : null,
            });
          } catch (error) {
            console.error("Error updating reminder date/time:", error);
            if (onRefreshTasks) onRefreshTasks();
          }
        })();
      }
    } catch (error) {
      console.error("Error updating reminder date/time:", error);
    }
  };

  // Multi-day events: let the user set / clear the last day of the span.
  const handleEndDateChange = async (newDate) => {
    try {
      let endDateISO = null;
      if (newDate) {
        const [y, m, d] = newDate.split('-').map(n => parseInt(n, 10));
        endDateISO = new Date(y, m - 1, d, 9, 0, 0, 0).toISOString();
      }
      if (onUpdateTask) onUpdateTask({ ...task, end_date: endDateISO });
      Task.update(task.id, { end_date: endDateISO }).catch(error => {
        console.error("Error updating end date:", error);
        if (onRefreshTasks) onRefreshTasks();
      });
    } catch (error) {
      console.error("Error updating end date:", error);
    }
  };

  const handleDueDateChange = async (newDate) => {
    try {
      let dueDateValue = null;
      if (newDate) {
        const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
        const existing = task.due_date ? new Date(task.due_date) : null;
        const hours = existing ? existing.getHours() : 17;
        const minutes = existing ? existing.getMinutes() : 0;
        dueDateValue = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
      }
      if (onUpdateTask) onUpdateTask({ ...task, due_date: dueDateValue });
      Task.update(task.id, { due_date: dueDateValue }).catch(error => {
        console.error("Error updating due date:", error);
        if (onRefreshTasks) onRefreshTasks();
      });
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  const handleStartDateChange = async (newDate) => {
    try {
      let startDateValue = null;
      if (newDate) {
        const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
        startDateValue = new Date(year, month - 1, day, 9, 0, 0, 0).toISOString();
      }
      if (onUpdateTask) onUpdateTask({ ...task, start_date: startDateValue });
      Task.update(task.id, { start_date: startDateValue }).catch(error => {
        console.error("Error updating start date:", error);
        if (onRefreshTasks) onRefreshTasks();
      });
    } catch (error) {
      console.error("Error updating start date:", error);
    }
  };

  // "In Progress" badge: shown when start_date has arrived but due_date
  // hasn't passed yet (or there's no due_date).
  const isInProgress = (() => {
    if (!task.start_date || task.status === 'completed') return false;
    if (new Date(task.start_date) > new Date()) return false;
    if (task.due_date && new Date(task.due_date) < new Date()) return false;
    return true;
  })();

  return (
    <Card
      className={`relative overflow-hidden border transition-all duration-200 hover:shadow-lg ${
        isSeasonalTheme() ? `${specialMode}-card` :
        theme === 'minimalist'
          ? 'bg-white border-gray-200 hover:border-gray-300'
          : theme === 'dark'
            ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
            : 'bg-gradient-to-br from-white to-purple-50 border-purple-200 hover:border-purple-300'
      }`}
    >
      <CardContent className="p-2 sm:p-3">
        {/* Compact single-line row: complete · date · title · priority · expand */}
        <div className="flex items-center gap-2 min-w-0">
          {task.status === 'completed' ? (
            <button
              onClick={() => onUncomplete && onUncomplete(task)}
              className={`flex-shrink-0 ${theme === 'dark' ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
              aria-label="Mark as active"
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleCompleteTask}
              className={`flex-shrink-0 ${theme === 'dark' ? 'text-gray-500 hover:text-green-400' : 'text-gray-300 hover:text-green-600'}`}
              aria-label="Mark task complete"
            >
              <Circle className="w-5 h-5" />
            </button>
          )}

          {collapsedDate && (
            <span className={`flex-shrink-0 text-xs px-2 py-1 rounded border whitespace-nowrap ${
              collapsedDate.overdue
                ? theme === 'dark' ? 'border-red-700 bg-red-900/30 text-red-300' : 'border-red-300 bg-red-50 text-red-700'
                : collapsedDate.isTodayLabel
                  ? theme === 'dark' ? 'border-green-700 bg-green-900/30 text-green-400' : 'border-green-300 bg-green-50 text-green-700'
                  : theme === 'dark' ? 'border-gray-700 bg-gray-800 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}>
              {collapsedDate.label}
            </span>
          )}

          {task.silenced && (
            <span className={`shrink min-w-0 text-xs px-2 py-1 rounded border flex items-center gap-1 ${
              theme === 'dark' ? 'border-amber-700 bg-amber-900/30 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700'
            }`}>
              <BellOff className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Back Burner</span>
            </span>
          )}

          {isInProgress && (
            <span className={`shrink min-w-0 text-xs px-2 py-1 rounded border flex items-center gap-1 ${
              theme === 'dark'
                ? 'border-blue-700 bg-blue-900/30 text-blue-300'
                : 'border-blue-300 bg-blue-50 text-blue-700'
            }`}>
              <PlayCircle className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">In Progress</span>
            </span>
          )}

          <h3
            className={`flex-1 min-w-0 line-clamp-2 break-words text-sm font-medium leading-snug ${
              task.status === 'completed' ? 'line-through opacity-60' : ''
            } ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}
            onClick={() => setExpanded(v => !v)}
          >
            {typeEmoji && <span className="mr-1">{typeEmoji}</span>}{task.title}
          </h3>

          <span className={`flex-shrink-0 text-xs px-2 py-1 rounded border whitespace-nowrap ${getUrgencyColor(task.urgency)}`}>
            {task.urgency === 'medium' ? 'med' : task.urgency}
          </span>

          {task.status !== 'completed' && !isEvent && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`flex-shrink-0 p-1.5 rounded transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-indigo-900/40 text-indigo-300'
                      : 'hover:bg-indigo-50 text-indigo-600'
                  }`}
                  aria-label="Launch this task"
                  title="Launchpad / 5-min Sprint"
                >
                  <Rocket className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className={`w-64 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()} align="end">
                <p className={`text-xs mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  Start a launch for <span className="font-medium">{task.title}</span>
                </p>
                <LaunchButtons task={task} theme={theme} />
              </PopoverContent>
            </Popover>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            className={`flex-shrink-0 p-1 rounded transition-colors ${
              theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            aria-label="Expand task"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Expanded section: all other info + inline editing */}
        {expanded && (
          <div className={`mt-3 pt-3 border-t space-y-3 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
            {isEditingTitle ? (
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h3 className={`text-base font-medium break-words flex-1 min-w-0 ${task.status === 'completed' ? 'line-through opacity-60' : ''} ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                  {typeEmoji && <span className="mr-1">{typeEmoji}</span>}{task.title}
                </h3>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                  aria-label="Edit task title"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {task.description && (
              <p className={`text-sm break-words whitespace-pre-wrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                {task.description}
              </p>
            )}

            {/* Badges / inline editors */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className={`${getUrgencyColor(task.urgency)} border px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity`}>
                    {task.urgency === 'medium' ? 'med' : task.urgency}
                  </button>
                </PopoverTrigger>
                <PopoverContent className={`w-48 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <button onClick={() => handleUrgencyChange('low')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Low</button>
                    <button onClick={() => handleUrgencyChange('medium')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Medium</button>
                    <button onClick={() => handleUrgencyChange('high')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>High</button>
                    <button onClick={() => handleUrgencyChange('urgent')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Urgent</button>
                  </div>
                </PopoverContent>
              </Popover>

              {task.energy_required && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-50 transition-colors ${
                        theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' : 'border-gray-300'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      {task.energy_required} energy
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-48 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1">
                      <button onClick={() => handleEnergyChange('low')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Low</button>
                      <button onClick={() => handleEnergyChange('medium')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Medium</button>
                      <button onClick={() => handleEnergyChange('high')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>High</button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Show interval badge for recurring reminders */}
              {task.reminder_interval && task.reminder_interval !== 'once' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                        theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {formatReminderInterval(task.reminder_interval)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-56 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1">
                      <button onClick={() => handleIntervalChange('10min')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 10 minutes</button>
                      <button onClick={() => handleIntervalChange('20min')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 20 minutes</button>
                      <button onClick={() => handleIntervalChange('30min')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 30 minutes</button>
                      <button onClick={() => handleIntervalChange('1hour')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every hour</button>
                      <button onClick={() => handleIntervalChange('2hours')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 2 hours</button>
                      <button onClick={() => handleIntervalChange('daily')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Daily</button>
                      <button onClick={() => handleIntervalChange('every_other_day')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every other day</button>
                      <div className={`border-t my-1 ${theme === 'dark' ? 'border-gray-700' : ''}`}></div>
                      <button onClick={() => handleIntervalChange('once')} className={`w-full text-left px-3 py-2 text-sm rounded font-medium ${theme === 'dark' ? 'hover:bg-blue-900 text-blue-400' : 'hover:bg-blue-50 text-blue-600'}`}>📅 Set Specific Date Instead</button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Due date option for recurring (interval) reminders */}
              {task.reminder_interval && task.reminder_interval !== 'once' && (
                task.due_date ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                          new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                            ? theme === 'dark'
                              ? 'border-red-700 bg-red-900/30 text-red-300 hover:bg-red-900/50'
                              : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                            : theme === 'dark'
                              ? 'border-amber-700 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                              : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        <CalendarClock className="w-3 h-3" />
                        {new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                          ? 'Overdue'
                          : `Due ${formatReminderDate(task.due_date)}`}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : ''}`}>Due Date:</label>
                        <input
                          type="date"
                          defaultValue={task.due_date ? task.due_date.split('T')[0] : ''}
                          onChange={(e) => handleDueDateChange(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                        <button
                          onClick={() => handleDueDateChange(null)}
                          className={`w-full text-left px-3 py-2 text-sm rounded font-medium ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                        >
                          Remove due date
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 border border-dashed px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                          theme === 'dark'
                            ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                            : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <CalendarClock className="w-3 h-3" />
                        Add Due Date
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : ''}`}>Due Date:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) handleDueDateChange(e.target.value); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Reminders continue until this date, then switch to overdue reminders.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Start date for recurring tasks — marks when you began working on it */}
              {task.reminder_interval && task.reminder_interval !== 'once' && (
                task.start_date ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                          theme === 'dark'
                            ? 'border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-900/50'
                            : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        <PlayCircle className="w-3 h-3" />
                        Started {formatReminderDate(task.start_date)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : ''}`}>Start Date:</label>
                        <input
                          type="date"
                          defaultValue={task.start_date ? task.start_date.split('T')[0] : ''}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Marks this task as "in progress." It shows on each day from the start date through the due date.
                        </p>
                        <button
                          onClick={() => handleStartDateChange(null)}
                          className={`w-full text-left px-3 py-2 text-sm rounded font-medium ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                        >
                          Remove start date
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 border border-dashed px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                          theme === 'dark'
                            ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                            : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <PlayCircle className="w-3 h-3" />
                        Add Start Date
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : ''}`}>Start Date:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) handleStartDateChange(e.target.value); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Marks when you started working on this task. It will appear in Today's Tasks from this date through the due date.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Show date badge for one-time reminders with a date set */}
              {task.reminder_interval === 'once' && task.next_reminder && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`border px-2 py-1 rounded text-xs cursor-pointer transition-colors flex items-center gap-1 ${
                        theme === 'dark'
                          ? 'border-purple-700 bg-purple-900/30 text-purple-300 hover:bg-purple-900/50'
                          : 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      <Calendar className="w-3 h-3" />
                      {task.end_date && new Date(task.next_reminder).toDateString() !== new Date(task.end_date).toDateString()
                        ? `${formatEventDateRange()} • ${formatReminderTime(task.next_reminder)}`
                        : `${formatReminderDate(task.next_reminder)} • ${formatReminderTime(task.next_reminder)}`}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-72 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-4 p-2">
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>{isEvent ? 'Event Date:' : 'Reminder Date:'}</label>
                        <input
                          type="date"
                          ref={dateInputRef}
                          defaultValue={getCurrentReminderDate(task)}
                          onChange={(e) => {
                            const currentTime = timeInputRef.current?.value || '09:00';
                            handleReminderDateChange(e.target.value, currentTime);
                          }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>{isEvent ? 'Event Time:' : 'Reminder Time:'}</label>
                        <input
                          type="time"
                          ref={timeInputRef}
                          defaultValue={getCurrentReminderTime(task)}
                          onChange={(e) => {
                            const currentDate = dateInputRef.current?.value;
                            handleReminderDateChange(currentDate, e.target.value);
                          }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                        />
                      </div>
                      {isEvent && (
                        <div>
                          <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>Multi-day End Date:</label>
                          <input
                            type="date"
                            defaultValue={task.end_date ? new Date(task.end_date).toLocaleDateString('en-CA') : ''}
                            onChange={(e) => handleEndDateChange(e.target.value || null)}
                            className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                          />
                          {task.end_date && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEndDateChange(null); }}
                              className={`mt-1 w-full text-left px-2 py-1 text-xs rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                            >
                              Remove end date (single-day)
                            </button>
                          )}
                          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            Event shows on each day from the event date through this date.
                          </p>
                        </div>
                      )}
                      <div className={`border-t pt-2 ${theme === 'dark' ? 'border-gray-700' : ''}`}>
                        <p className={`text-xs font-semibold uppercase mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Or switch to repeating</p>
                        <p className={`text-xs mb-0.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Frequent nudges</p>
                        <button onClick={() => handleIntervalChange('10min')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 10 min</button>
                        <button onClick={() => handleIntervalChange('30min')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 30 min</button>
                        <button onClick={() => handleIntervalChange('1hour')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every hour</button>
                        <button onClick={() => handleIntervalChange('2hours')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 2 hours</button>
                        <p className={`text-xs mt-1.5 mb-0.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Daily check-ins</p>
                        <button onClick={() => handleIntervalChange('daily')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Daily</button>
                        <button onClick={() => handleIntervalChange('every_other_day')} className={`w-full text-left px-3 py-1.5 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every other day</button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Show "Add Reminder" button if no reminder is set */}
              {!task.reminder_interval && !task.next_reminder && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-1 border border-dashed px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                        theme === 'dark'
                          ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                          : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Add Reminder
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-56 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1">
                      <div className={`px-3 py-2 text-xs font-semibold uppercase ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Recurring</div>
                      <button onClick={() => handleIntervalChange('30min')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 30 minutes</button>
                      <button onClick={() => handleIntervalChange('1hour')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every hour</button>
                      <button onClick={() => handleIntervalChange('2hours')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Every 2 hours</button>
                      <button onClick={() => handleIntervalChange('daily')} className={`w-full text-left px-3 py-2 text-sm rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'}`}>Daily</button>
                      <div className={`border-t my-1 ${theme === 'dark' ? 'border-gray-700' : ''}`}></div>
                      <button onClick={() => handleIntervalChange('once')} className={`w-full text-left px-3 py-2 text-sm rounded font-medium ${theme === 'dark' ? 'hover:bg-blue-900 text-blue-400' : 'hover:bg-blue-50 text-blue-600'}`}>📅 Set Specific Date</button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Subtask Badge - clickable to toggle */}
              {subtaskCount > 0 && !isEvent && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSubtasksExpanded(v => !v); }}
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
                    theme === 'dark'
                      ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <ListChecks className="w-3 h-3" />
                  {completedSubtaskCount}/{subtaskCount} Subtasks
                  {subtasksExpanded
                    ? <ChevronDown className="w-3 h-3 ml-0.5" />
                    : <ChevronRight className="w-3 h-3 ml-0.5" />
                  }
                </button>
              )}
            </div>

            {/* Actions: details + delete + snooze */}
            <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onShowDetails(task)}
                  className={`h-8 gap-1.5 font-medium ${
                    theme === 'dark'
                      ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  <ListChecks className="w-4 h-4" />
                  {isEvent ? 'Event Details' : 'Task Details'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleSilenced}
                  className={`h-8 gap-1.5 ${
                    task.silenced
                      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                      : theme === 'dark' ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                  title={task.silenced ? 'Reactivate reminders' : 'Silence reminders (back burner)'}
                >
                  {task.silenced ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  {task.silenced ? 'Reactivate' : 'Silence'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteTask}
                  className={`h-8 w-8 ${theme === 'dark' ? 'hover:bg-gray-700 text-red-500 hover:text-red-400' : 'text-red-600 hover:text-red-700 hover:bg-red-50'}`}
                  aria-label="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {task.status === 'completed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUncomplete && onUncomplete(task)}
                  className={`flex items-center gap-2 flex-shrink-0 ${theme === 'dark' ? 'hover:bg-gray-700 text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                  aria-label="Mark as active"
                >
                  <Clock className="w-4 h-4" />
                  Make Active
                </Button>
              )}
            </div>

            {(task.type === 'task' || task.type === 'reminder') && (
              <div className={`flex flex-wrap gap-2 pt-2 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSnooze(task, 15)}
                  className={`flex items-center gap-2 flex-1 min-w-[80px] ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : ''}`}
                >
                  <BellOff className="w-4 h-4" />
                  15 min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSnooze(task, 30)}
                  className={`flex items-center gap-2 flex-1 min-w-[80px] ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : ''}`}
                >
                  <BellOff className="w-4 h-4" />
                  30 min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSnooze(task, 60)}
                  className={`flex items-center gap-2 flex-1 min-w-[80px] ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : ''}`}
                >
                  <BellOff className="w-4 h-4" />
                  1 hour
                </Button>
              </div>
            )}

            {/* Collapsible subtasks — inside the same card */}
            {subtasksExpanded && subtasks && subtasks.length > 0 && !isEvent && (
              <div className={`pt-2 border-t space-y-1 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
                {subtasks.map(subtask => (
                  <div
                    key={subtask.id}
                    className={`flex items-center gap-2 px-1 py-1.5 rounded text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); subtask.status === 'completed' ? onUncomplete(subtask) : onComplete(subtask); }}
                      className={`flex-shrink-0 transition-colors ${
                        subtask.status === 'completed'
                          ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
                          : theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {subtask.status === 'completed'
                        ? <CheckCircle2 className="w-4 h-4" />
                        : <Circle className="w-4 h-4" />
                      }
                    </button>
                    <span className={`flex-1 ${
                      subtask.status === 'completed'
                        ? 'line-through opacity-50'
                        : theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {subtask.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}