
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Zap, Pencil } from "lucide-react";
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
  const activeTasks = tasks.filter(t => t.status === 'active').slice(0, 5);
  const [celebratingTaskId, setCelebratingTaskId] = React.useState(null);
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

    await base44.entities.Task.update(task.id, { 
      reminder_interval: newInterval,
      next_reminder: nextReminder.toISOString()
    });
    window.location.reload();
  };

  const handleReminderTimeChange = async (task, newTime) => {
    const [hours, minutes] = newTime.split(':');
    const nextReminder = new Date();
    nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // CRITICAL FIX: If the time is in the past today, set it for tomorrow
    const now = new Date();
    if (nextReminder <= now) {
      nextReminder.setDate(nextReminder.getDate() + 1);
    }

    console.log(`🕐 [REMINDER TIME] Setting reminder for ${nextReminder.toLocaleString()} (${nextReminder.toISOString()})`);

    await base44.entities.Task.update(task.id, { 
      next_reminder: nextReminder.toISOString()
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
          {activeTasks.map((task) => (
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

                      {task.reminder_interval && (
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
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}

                      {task.next_reminder && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button 
                              onClick={(e) => e.stopPropagation()}
                              className="border border-blue-300 bg-white px-2 py-1 rounded text-xs text-blue-700 cursor-pointer hover:bg-blue-50 transition-colors"
                            >
                              {new Date(task.next_reminder).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Change reminder time:</label>
                              <input
                                type="time"
                                defaultValue={getCurrentReminderTime(task)}
                                onChange={(e) => handleReminderTimeChange(task, e.target.value)}
                                className="w-full border rounded px-3 py-2"
                              />
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
              </motion.div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
