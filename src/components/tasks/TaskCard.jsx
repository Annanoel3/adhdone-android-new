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
  Bell,
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
  onEdit,
  onComplete,
  onUncomplete,
  onSnooze,
  onShowDetails,
  onDelete,
  subtaskCount,
  completedSubtaskCount
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
      const nextReminder = new Date(task.next_reminder || new Date());
      nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (nextReminder < new Date() && task.reminder_interval === 'once') {
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

  const handleReminderDateChange = async (newDate, newTime) => {
    try {
      let nextReminder;
      
      if (newDate) {
        nextReminder = new Date(newDate);
        if (newTime) {
          const [hours, minutes] = newTime.split(':');
          nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        } else {
          const currentReminder = task.next_reminder ? new Date(task.next_reminder) : new Date();
          nextReminder.setHours(currentReminder.getHours(), currentReminder.getMinutes(), 0, 0);
        }
      } else if (newTime) {
        nextReminder = task.next_reminder ? new Date(task.next_reminder) : new Date();
        const [hours, minutes] = newTime.split(':');
        nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      } else {
          return;
      }

      if (nextReminder < new Date() && task.reminder_interval === 'once') {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      await Task.update(task.id, {
        next_reminder: nextReminder.toISOString()
      });
      onRefreshTasks();
    } catch (error) {
      console.error("Error updating reminder date/time:", error);
    }
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

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`${getUrgencyColor(task.urgency)} border px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity`}>
                  {task.urgency}
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
                    {formatReminderDate(task.next_reminder)} • {formatReminderTime(task.next_reminder)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className={`w-72 p-2 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-4 p-2">
                    <div>
                      <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>Reminder Date:</label>
                      <input
                        type="date"
                        defaultValue={getCurrentReminderDate(task)}
                        onChange={(e) => {
                          const currentTime = getCurrentReminderTime(task);
                          handleReminderDateChange(e.target.value, currentTime);
                        }}
                        className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                      />
                    </div>
                    <div>
                      <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>Reminder Time:</label>
                      <input
                        type="time"
                        defaultValue={getCurrentReminderTime(task)}
                        onChange={(e) => {
                          const currentDate = getCurrentReminderDate(task);
                          handleReminderDateChange(currentDate, e.target.value);
                        }}
                        className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : ''}`}
                      />
                    </div>
                    <div className={`border-t pt-2 ${theme === 'dark' ? 'border-gray-700' : ''}`}>
                      <button 
                        onClick={() => handleIntervalChange('daily')} 
                        className={`w-full text-left px-3 py-2 text-sm rounded font-medium ${theme === 'dark' ? 'hover:bg-blue-900 text-blue-400' : 'hover:bg-blue-50 text-blue-600'}`}
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

          <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
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
            {task.status === 'completed' ? (
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
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCompleteTask}
                className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'hover:bg-gray-700 text-green-500 hover:text-green-400' : 'text-green-600 hover:text-green-700'}`}
                aria-label="Mark task complete"
              >
                <CheckCircle2 className="w-5 h-5" />
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
        </div>
      </CardContent>
    </Card>
  );
}