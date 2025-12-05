import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Zap, Pencil, Calendar, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { checkAndAwardAchievements } from "../utils/achievementTracker";
import { awardPoints, getPointsForAction } from "../utils/gamification";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import TaskCompletionCelebration from "../tasks/TaskCompletionCelebration";
import { updateTodaysSummary } from "../utils/dailySummaryHelper";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function TodaysTasks({ tasks, theme, onTaskAction, onViewDetails }) {
  const navigate = useNavigate();
  // Filter out subtasks - only show parent tasks
  const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id).slice(0, 5);
  const [celebratingTaskId, setCelebratingTaskId] = React.useState(null);
  const [expandedTasks, setExpandedTasks] = React.useState({});
  const specialMode = localStorage.getItem('special_mode') || 'normal';

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
    setCelebratingTaskId(task.id);
    
    setTimeout(async () => {
      await onTaskAction(task);
      await updateTodaysSummary();
      
      const points = task.urgency === 'urgent' 
        ? getPointsForAction('urgent_task_completed')
        : getPointsForAction('task_completed');
      
      const hour = new Date().getHours();
      const bonusPoints = hour < 9 ? getPointsForAction('early_morning_task') : 0;
      
      await awardPoints(points + bonusPoints);
      
      const allTasks = await base44.entities.Task.list();
      const completedTasks = allTasks.filter(t => t.status === 'completed');
      const summaries = await base44.entities.DailySummary.list('-date', 1);
      const currentStreak = summaries[0]?.streak_days || 0;
      
      await checkAndAwardAchievements({
        totalTasksCompleted: completedTasks.length,
        streakDays: currentStreak,
        completedUrgentTask: task.urgency === 'urgent',
        completedBeforeNineAM: hour < 9
      });
      
      setCelebratingTaskId(null);
    }, 1500);
  };

  const handleUrgencyChange = async (task, newUrgency) => {
    await base44.entities.Task.update(task.id, { urgency: newUrgency });
    window.location.reload();
  };

  const handleEnergyChange = async (task, newEnergy) => {
    await base44.entities.Task.update(task.id, { energy_required: newEnergy });
    window.location.reload();
  };

  const handleIntervalChange = async (task, newInterval) => {
    console.log('🔄 [INTERVAL CHANGE] Updating interval to:', newInterval);
    
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
    
    // Schedule new reminders
    try {
      const currentUser = await base44.auth.me();
      
      if (newInterval === 'once') {
        // Schedule single one-time reminder
        const { scheduleReminder } = await import('../utils/reminderScheduler');
        const notificationId = await scheduleReminder({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${task.title}\n\nTap to mark as complete!`,
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
        newNotificationIds = await scheduleRecurringReminders({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${task.title}\n\nTap to mark as complete!`,
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
        console.log('🔄 [INTERVAL CHANGE] Scheduled recurring reminders:', newNotificationIds.length);
      }
    } catch (error) {
      console.error('Failed to schedule new reminders:', error);
    }

    await base44.entities.Task.update(task.id, { 
      reminder_interval: newInterval,
      next_reminder: nextReminder.toISOString(),
      onesignal_notification_ids: newNotificationIds
    });
    window.location.reload();
  };

  const handleReminderDateChange = async (task, newDate, newTime) => {
    const currentNextReminder = task.next_reminder ? new Date(task.next_reminder) : new Date();
    let updatedNextReminder = new Date(currentNextReminder);

    if (newDate) {
        const selectedDate = new Date(newDate);
        updatedNextReminder.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    }

    if (newTime) {
        const [hours, minutes] = newTime.split(':');
        updatedNextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    // CRITICAL FIX: If the new reminder date/time is in the past on the current day, adjust it to tomorrow.
    const now = new Date();
    if (updatedNextReminder <= now && updatedNextReminder.toDateString() === now.toDateString()) {
      updatedNextReminder.setDate(updatedNextReminder.getDate() + 1);
    }

    console.log(`📅 [REMINDER DATE] Setting reminder for ${updatedNextReminder.toLocaleString()} (${updatedNextReminder.toISOString()})`);

    await base44.entities.Task.update(task.id, { 
      next_reminder: updatedNextReminder.toISOString()
    });
    window.location.reload();
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

  if (activeTasks.length === 0) {
    return (
      <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
        specialMode === 'normal' ? (
          theme === 'minimalist'
            ? 'bg-white/80 backdrop-blur-sm'
            : theme === 'dark'
              ? 'bg-gray-800 border border-gray-700 text-gray-100'
              : 'bg-white/80 backdrop-blur-sm'
        ) : ''
      }`}>
        <CardContent className="p-12 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            specialMode !== 'normal' ? '' :
            theme === 'minimalist' ? 'bg-green-100' : 
            theme === 'dark' ? 'bg-green-700' :
            'bg-gradient-to-br from-purple-100 to-orange-100'
          }`}>
            <CheckCircle2 className={`w-8 h-8 ${
              specialMode !== 'normal' ? '' :
              theme === 'minimalist' ? 'text-green-600' : 
              theme === 'dark' ? 'text-green-200' :
              'text-purple-600'
            }`} />
          </div>
          <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>All clear!</h3>
          <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-6`}>No active tasks. Ready to add something new?</p>
          <Button
            onClick={() => navigate(createPageUrl("AddTask"))}
            className={
              theme === 'minimalist' 
                ? 'bg-green-600 hover:bg-green-700' 
                : theme === 'dark'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
            }
          >
            Add Your First Task
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getSubtasks = (taskId) => {
    return tasks.filter(t => t.parent_task_id === taskId);
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(createPageUrl("Tasks"))}
            className={`text-sm ${theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : ''}`}
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {activeTasks.map((task) => {
            const subtasks = getSubtasks(task.id);
            const completedSubtasks = subtasks.filter(st => st.status === 'completed');
            return (
            <div key={task.id} className="relative">
              {celebratingTaskId === task.id && (
                <TaskCompletionCelebration theme={theme} />
              )}
              <motion.div
                initial={{ opacity: 1, scale: 1 }}
                animate={celebratingTaskId === task.id ? { 
                  scale: [1, 1.05, 1],
                  opacity: [1, 0.8, 1]
                } : {}}
                transition={{ duration: 0.5 }}
                className={`p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                  theme === 'minimalist' 
                    ? 'bg-white border-gray-100 hover:border-gray-200' 
                    : theme === 'dark'
                      ? 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                      : 'bg-gradient-to-r from-purple-50/50 to-orange-50/50 border-purple-100 hover:border-purple-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 cursor-pointer" onClick={() => onViewDetails(task)}>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className={`font-medium flex-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{task.title}</h4>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(task);
                        }}
                        className={`h-6 w-6 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : ''}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className={`${getUrgencyColor(task.urgency)} px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            {task.urgency}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <button onClick={() => handleUrgencyChange(task, 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low</button>
                            <button onClick={() => handleUrgencyChange(task, 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium</button>
                            <button onClick={() => handleUrgencyChange(task, 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High</button>
                            <button onClick={() => handleUrgencyChange(task, 'urgent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Urgent</button>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {task.energy_required && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button 
                              onClick={(e) => e.stopPropagation()}
                              className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-50 transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'border-gray-300'}`}
                            >
                              <Zap className="w-3 h-3" />
                              {task.energy_required} energy
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <button onClick={() => handleEnergyChange(task, 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low</button>
                              <button onClick={() => handleEnergyChange(task, 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium</button>
                              <button onClick={() => handleEnergyChange(task, 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High</button>
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
                              className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-50 transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'border-gray-300'}`}
                            >
                              <Clock className="w-3 h-3" />
                              {formatReminderInterval(task.reminder_interval)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <button onClick={() => handleIntervalChange(task, '10min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 10 minutes</button>
                              <button onClick={() => handleIntervalChange(task, '20min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 20 minutes</button>
                              <button onClick={() => handleIntervalChange(task, '30min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 30 minutes</button>
                              <button onClick={() => handleIntervalChange(task, '1hour')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every hour</button>
                              <button onClick={() => handleIntervalChange(task, '2hours')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 2 hours</button>
                              <button onClick={() => handleIntervalChange(task, 'daily')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Daily</button>
                              <button onClick={() => handleIntervalChange(task, 'every_other_day')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every other day</button>
                              <div className={`border-t my-1 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>
                              <button onClick={() => handleIntervalChange(task, 'once')} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded text-blue-600 font-medium">📅 Set Specific Date Instead</button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}

                      {/* Show date badge for one-time reminders with a date set */}
                      {task.reminder_interval === 'once' && task.next_reminder && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button 
                              onClick={(e) => e.stopPropagation()}
                              className="border border-purple-300 bg-purple-50 px-2 py-1 rounded text-xs text-purple-700 cursor-pointer hover:bg-purple-100 transition-colors flex items-center gap-1"
                            >
                              <Calendar className="w-3 h-3" />
                              {formatReminderDate(task.next_reminder)} • {new Date(task.next_reminder).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className={`w-72 p-2 ${
                            theme === 'dark' 
                              ? 'bg-gray-800 border-gray-700 text-gray-100' 
                              : 'bg-white border-gray-200'
                          }`} onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-4 p-2">
                              <div>
                                <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                  Reminder Date:
                                </label>
                                <input
                                  type="date"
                                  defaultValue={getCurrentReminderDate(task)}
                                  onChange={(e) => {
                                    const currentTime = getCurrentReminderTime(task);
                                    handleReminderDateChange(task, e.target.value, currentTime);
                                  }}
                                  className={`w-full border rounded px-3 py-2 ${
                                    theme === 'dark'
                                      ? 'bg-gray-900 border-gray-600 text-gray-100'
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                />
                              </div>
                              <div>
                                <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                  Reminder Time:
                                </label>
                                <input
                                  type="time"
                                  defaultValue={getCurrentReminderTime(task)}
                                  onChange={(e) => {
                                    const currentDate = getCurrentReminderDate(task);
                                    handleReminderDateChange(task, currentDate, e.target.value);
                                  }}
                                  className={`w-full border rounded px-3 py-2 ${
                                    theme === 'dark'
                                      ? 'bg-gray-900 border-gray-600 text-gray-100'
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                />
                              </div>
                              <div className={`border-t pt-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                <button 
                                  onClick={() => handleIntervalChange(task, 'daily')} 
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded text-blue-600 font-medium"
                                >
                                  🔄 Use Recurring Reminder Instead
                                </button>
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
                              className="flex items-center gap-1 border border-dashed border-gray-300 px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-50 transition-colors text-gray-500"
                            >
                              <Clock className="w-3 h-3" />
                              Add Reminder
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Recurring</div>
                              <button onClick={() => handleIntervalChange(task, '30min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 30 minutes</button>
                              <button onClick={() => handleIntervalChange(task, '1hour')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every hour</button>
                              <button onClick={() => handleIntervalChange(task, '2hours')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 2 hours</button>
                              <button onClick={() => handleIntervalChange(task, 'daily')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Daily</button>
                              <div className={`border-t my-1 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>
                              <button onClick={() => handleIntervalChange(task, 'once')} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded text-blue-600 font-medium">📅 Set Specific Date</button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleComplete(task);
                    }}
                    disabled={celebratingTaskId === task.id}
                    className={`flex-shrink-0 ${theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : ''}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Subtasks Dropdown */}
                {subtasks.length > 0 && (
                  <div className="mt-2 pl-2">
                    <button
                      onClick={() => toggleTaskExpansion(task.id)}
                      className={`flex items-center gap-2 text-sm w-full text-left p-2 rounded ${
                        theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <ListChecks className="w-4 h-4" />
                      <span>{completedSubtasks.length}/{subtasks.length} subtasks</span>
                      <span className="ml-auto">{expandedTasks[task.id] ? '▼' : '▶'}</span>
                    </button>
                    
                    {expandedTasks[task.id] && (
                      <div className="mt-1 space-y-1 pl-6">
                        {subtasks.map(subtask => (
                          <div
                            key={subtask.id}
                            className={`flex items-center gap-2 p-2 rounded text-sm ${
                              theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                            }`}
                          >
                            <button
                              onClick={() => handleComplete(subtask)}
                              className={`flex-shrink-0 ${
                                subtask.status === 'completed'
                                  ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
                                  : theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
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
              </motion.div>
            </div>
          );
          })}
        </div>
      </CardContent>
    </Card>
  );
}