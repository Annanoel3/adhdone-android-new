
import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Task } from "@/entities/Task";
import {
  CheckCircle2,
  Clock,
  Zap,
  ListChecks,
  Bell, // Bell is still used for snooze buttons
  BellOff,
  Trash2,
  Calendar,
  Pencil,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function TaskCard({
  task,
  theme,
  onRefreshTasks,
  onEditTitle,
  onEdit, // New prop
  onComplete,
  onSnooze,
  onShowDetails,
  onDelete,
  subtaskCount, // New prop
  completedSubtaskCount // New prop
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);

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
    } else {
      return {
        low: 'bg-teal-200 text-teal-800 border-teal-300 font-medium',
        medium: 'bg-purple-200 text-purple-800 border-purple-300 font-medium',
        high: 'bg-orange-200 text-orange-800 border-orange-300 font-medium',
        urgent: 'bg-red-300 text-red-900 border-red-400 font-bold'
      }[urgency];
    }
  };

  // The isReminder flag was used previously, but now we rely on specific properties like task.next_reminder or task.reminder_interval
  // const isReminder = task.is_reminder || task.reminder_interval === "once";

  // Moved and formatted reminderTime logic into a dedicated helper `formatReminderTime`
  // const reminderTime = task.next_reminder
  //   ? new Date(task.next_reminder).toLocaleTimeString('en-US', {
  //       hour: 'numeric',
  //       minute: '2-digit',
  //       hour12: true
  //     })
  //   : null;

  const taskDate = new Date(task.created_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: new Date(task.created_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  const isToday = new Date(task.created_date).toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

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

  const handleDeleteTask = () => {
    if (confirm(`Delete "${task.title}"?`)) {
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
      onRefreshTasks();
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
      const nextReminder = new Date(now.getTime());

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
          nextReminder.setDate(nextReminder.getDate() + 1);
          break;
        case 'every_other_day':
          nextReminder.setDate(nextReminder.getDate() + 2);
          break;
      }

      await Task.update(task.id, {
        reminder_interval: newInterval,
        next_reminder: nextReminder.toISOString()
      });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating interval:", error);
    }
  };

  const handleReminderTimeChange = async (newTime) => {
    try {
      const [hours, minutes] = newTime.split(':');
      const nextReminder = new Date(task.next_reminder || new Date()); // Use existing next_reminder date or current date
      nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // If time is in the past today, set for tomorrow
      if (nextReminder < new Date()) {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      await Task.update(task.id, {
        next_reminder: nextReminder.toISOString()
      });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating reminder time:", error);
    }
  };

  const handleUrgencyChange = async (newUrgency) => {
    try {
      await Task.update(task.id, { urgency: newUrgency });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating urgency:", error);
    }
  };

  const handleEnergyChange = async (newEnergy) => {
    try {
      await Task.update(task.id, { energy_required: newEnergy });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating energy:", error);
    }
  };

  // Get current time for reminder time input
  const getCurrentReminderTime = (taskItem) => { // Updated to accept taskItem
    if (!taskItem.next_reminder) return '';
    const date = new Date(taskItem.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

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
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge
              variant="outline"
              className={`flex items-center gap-1 text-xs flex-shrink-0 ${
                isToday
                  ? theme === 'dark' ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-green-50 border-green-300 text-green-700'
                  : theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-600'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {isToday ? 'Today' : taskDate}
            </Badge>
          </div>

          {isEditingTitle ? (
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={handleKeyDown}
              className="mb-2"
              autoFocus
            />
          ) : (
            <div className="flex items-start gap-2 min-w-0">
              <h3
                className={`text-base font-medium break-words flex-1 min-w-0 ${
                  task.status === 'completed' ? 'line-through opacity-60' : ''
                } ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}
              >
                {task.title}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
                aria-label="Edit task title"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {task.description && (
            <p className={`text-sm break-words ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              {task.description}
            </p>
          )}

          {/* Badges - Energy, Urgency, Reminders, Subtasks */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`${getUrgencyColor(task.urgency)} border px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity`}>
                  {task.urgency}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-1">
                  <button onClick={() => handleUrgencyChange('low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low</button>
                  <button onClick={() => handleUrgencyChange('medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium</button>
                  <button onClick={() => handleUrgencyChange('high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High</button>
                  <button onClick={() => handleUrgencyChange('urgent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Urgent</button>
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
                <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <button onClick={() => handleEnergyChange('low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low</button>
                    <button onClick={() => handleEnergyChange('medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium</button>
                    <button onClick={() => handleEnergyChange('high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High</button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Reminder interval badge */}
            {task.reminder_interval && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-50 transition-colors ${
                      theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600' : 'border-gray-300'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {formatReminderInterval(task.reminder_interval)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <button onClick={() => handleIntervalChange('10min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 10 minutes</button>
                    <button onClick={() => handleIntervalChange('20min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 20 minutes</button>
                    <button onClick={() => handleIntervalChange('30min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 30 minutes</button>
                    <button onClick={() => handleIntervalChange('1hour')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every hour</button>
                    <button onClick={() => handleIntervalChange('2hours')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 2 hours</button>
                    <button onClick={() => handleIntervalChange('daily')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Daily</button>
                    <button onClick={() => handleIntervalChange('every_other_day')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every other day</button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Next Reminder Time Badge */}
            {task.next_reminder && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="border border-blue-300 bg-blue-50 px-2 py-1 rounded text-xs text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors flex items-center gap-1"
                  >
                    <Clock className="w-3 h-3" />
                    {formatReminderTime(task.next_reminder)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Change reminder time:</label>
                    <input
                      type="time"
                      defaultValue={getCurrentReminderTime(task)}
                      onChange={(e) => handleReminderTimeChange(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Subtask Badge */}
            {subtaskCount > 0 && (
              <Badge
                variant="secondary"
                className={`flex items-center gap-1 text-xs font-medium ${
                  theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                <ListChecks className="w-3 h-3" />
                {completedSubtaskCount}/{subtaskCount} Subtasks
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onShowDetails(task)}
                className={`h-8 w-8 ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-900'}`}
                aria-label="View task details"
              >
                <ListChecks className="w-4 h-4" />
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
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCompleteTask}
              className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'hover:bg-gray-700 text-green-500 hover:text-green-400' : 'text-green-600 hover:text-green-700'}`}
              aria-label="Mark task complete"
            >
              <CheckCircle2 className="w-5 h-5" />
            </Button>
          </div>

          {(task.type === 'task' || task.type === 'reminder') && ( // Condition added to only show snooze for tasks/reminders
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
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
        </div>
      </CardContent>
    </Card>
  );
}
