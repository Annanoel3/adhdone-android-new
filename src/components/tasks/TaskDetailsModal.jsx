
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Clock,
  Zap,
  ListChecks,
  Sparkles,
  Plus,
  Trash2,
  Undo,
  Mic,
  Keyboard,
  Pencil,
  Check,
  X
} from "lucide-react";
import { Task } from "@/entities/Task";
import TaskDecompositionModal from "./TaskDecompositionModal";
import VoiceTaskInput from "./VoiceTaskInput";
import { InvokeLLM } from "@/integrations/Core";
import { scheduleReminder, cancelScheduledReminder } from "../utils/reminderScheduler";
import { User } from "@/entities/User";
import { base44 } from "@/api/base44Client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TaskDetailsModal({ task, isOpen, onClose, onUpdate, onDelete, theme }) {
  const [subTasks, setSubTasks] = useState([]);
  const [newSubTask, setNewSubTask] = useState("");
  const [showDecomposition, setShowDecomposition] = useState(false);
  const [previousSubTasks, setPreviousSubTasks] = useState(null);
  const [hasDecomposedSuccessfully, setHasDecomposedSuccessfully] = useState(false);
  const [subtaskInputMode, setSubtaskInputMode] = useState('text');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task ? task.title : '');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (task && isOpen) {
      fetchSubTasks(task.id);
      setPreviousSubTasks(null);
      setHasDecomposedSuccessfully(false);
      setEditedTitle(task.title);
      setIsEditingTitle(false);
    }
  }, [task, isOpen]);

  const fetchSubTasks = async (taskId) => {
    const fetchedSubTasks = await Task.filter({ parent_task_id: taskId }, '-created_date');
    setSubTasks(fetchedSubTasks);
    return fetchedSubTasks;
  };

  const handleSubTaskToggle = async (subTask) => {
    const newStatus = subTask.status === 'completed' ? 'active' : 'completed';
    await Task.update(subTask.id, { status: newStatus });
    fetchSubTasks(task.id);
    onUpdate();
  };

  const handleAddSubTask = async (e) => {
    e.preventDefault();
    if (!newSubTask.trim() || !task) return;

    const currentUser = await base44.auth.me();
    const now = new Date();
    let nextReminder = new Date(now.getTime());
    
    switch (task.reminder_interval) {
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
      default:
        nextReminder = null;
        break;
    }

    const createdTask = await Task.create({
      title: newSubTask,
      parent_task_id: task.id,
      urgency: task.urgency,
      energy_required: task.energy_required,
      status: 'active',
      reminder_interval: task.reminder_interval,
      reminder_count: 0,
      next_reminder: task.reminder_interval && task.reminder_interval !== 'once' && nextReminder ? nextReminder.toISOString() : null
    });

    if (createdTask.next_reminder && task.reminder_interval !== 'once') {
      try {
        await scheduleReminder({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: createdTask.title,
          sendAtISO: createdTask.next_reminder,
          taskId: createdTask.id,
          data: {
            screen: "/Tasks",
            taskId: createdTask.id,
            urgency: createdTask.urgency,
            type: 'task_reminder'
          }
        });
      } catch (error) {
        console.error("Failed to schedule reminder:", error);
      }
    }

    setNewSubTask("");
    fetchSubTasks(task.id);
    onUpdate();
  };

  const handleVoiceSubtask = async (transcription) => {
    if (!transcription.trim() || !task) return;

    setIsProcessingVoice(true);

    try {
      const prompt = `Parse this voice input and extract task items to add as sub-tasks:

INPUT: "${transcription}"

If it's a list of things, return each as a separate subtask.
If it's one thing, return it as a single subtask.

Return JSON:
{
  "subtasks": ["subtask 1", "subtask 2", ...]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            subtasks: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });

      const currentUser = await base44.auth.me();
      const now = new Date();
      let nextReminder = new Date(now.getTime());

      switch (task.reminder_interval) {
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
        default:
          nextReminder = null;
          break;
      }

      for (const subtaskTitle of response.subtasks || []) {
        const createdTask = await Task.create({
          title: subtaskTitle.trim(),
          parent_task_id: task.id,
          urgency: task.urgency,
          energy_required: task.energy_required,
          status: 'active',
          reminder_interval: task.reminder_interval,
          reminder_count: 0,
          next_reminder: task.reminder_interval && task.reminder_interval !== 'once' && nextReminder ? nextReminder.toISOString() : null
        });

        if (createdTask.next_reminder && task.reminder_interval !== 'once') {
          try {
            await scheduleReminder({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: createdTask.title,
              sendAtISO: createdTask.next_reminder,
              taskId: createdTask.id,
              data: {
                screen: "/Tasks",
                taskId: createdTask.id,
                urgency: createdTask.urgency,
                type: 'task_reminder'
              }
            });
          } catch (error) {
            console.error("Failed to schedule reminder:", error);
          }
        }
      }

      fetchSubTasks(task.id);
      onUpdate();
    } catch (error) {
      console.error("Error processing voice subtask:", error);
      alert("Failed to process voice input. Please try again.");
    }

    setIsProcessingVoice(false);
  };

  const handleDeleteSubTask = async (subTaskId) => {
    await Task.delete(subTaskId);
    fetchSubTasks(task.id);
    onUpdate();
  };

  const handleUndoDecomposition = async () => {
    if (!previousSubTasks || !task) return;

    const previousSubTaskIds = new Set(previousSubTasks.map(st => st.id));
    const tasksToDelete = subTasks.filter(st => !previousSubTaskIds.has(st.id));

    for (const subTaskToDelete of tasksToDelete) {
      await Task.delete(subTaskToDelete.id);
    }

    setPreviousSubTasks(null);
    setHasDecomposedSuccessfully(false);
    await fetchSubTasks(task.id);
    onUpdate();
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !task) {
      setEditedTitle(task?.title || '');
      setIsEditingTitle(false);
      return;
    }

    setIsUpdating(true);
    try {
      // Update in background
      Task.update(task.id, { title: editedTitle.trim() }).catch(error => {
        console.error("Error updating task title:", error);
      });
      
      // Optimistically update parent immediately
      onUpdate({ ...task, title: editedTitle.trim() });
      setIsEditingTitle(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateField = async (field, value) => {
    if (!task) return;
    
    setIsUpdating(true);
    try {
      const updates = { [field]: value };
      
      // If changing reminder interval, recalculate next_reminder
      if (field === 'reminder_interval') {
        const now = new Date();
        let nextReminder = new Date(now.getTime());
        
        switch (value) {
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
          case 'once':
          default:
            nextReminder = null;
            break;
        }
        
        updates.next_reminder = nextReminder ? nextReminder.toISOString() : null;
        
        // Schedule the new recurring reminder
        if (nextReminder && value !== 'once') {
          try {
            const currentUser = await User.me();
            await scheduleReminder({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: task.title,
              sendAtISO: nextReminder.toISOString(),
              taskId: task.id,
              data: {
                screen: "/Tasks",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });
          } catch (error) {
            console.error("Failed to schedule reminder:", error);
          }
        }
      }
      
      // Update in background
      Task.update(task.id, updates).catch(error => {
        console.error(`Error updating ${field}:`, error);
      });
      
      // Optimistically update parent immediately
      onUpdate({ ...task, ...updates });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateReminderTime = async (newTime) => {
    if (!task) return;
    
    setIsUpdating(true);
    try {
      const [hours, minutes] = newTime.split(':');
      const nextReminder = new Date();
      nextReminder.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      const now = new Date();
      if (nextReminder <= now) {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      console.log(`🕐 [REMINDER TIME] Setting reminder for ${nextReminder.toLocaleString()} (${nextReminder.toISOString()})`);

      // Reschedule the notification
      try {
        const currentUser = await User.me();
        await scheduleReminder({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: task.title,
          sendAtISO: nextReminder.toISOString(),
          taskId: task.id,
          data: {
            screen: "/Tasks",
            taskId: task.id,
            urgency: task.urgency,
            type: 'task_reminder'
          }
        });
      } catch (error) {
        console.error("Failed to schedule reminder:", error);
      }

      // Update in background
      Task.update(task.id, { next_reminder: nextReminder.toISOString() }).catch(error => {
        console.error("Error updating reminder time:", error);
      });
      
      // Optimistically update parent immediately
      onUpdate({ ...task, next_reminder: nextReminder.toISOString() });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    if (!task) return;
    
    setIsUpdating(true);
    try {
      // Update in background
      Task.update(task.id, { 
        status: 'completed',
        completed_at: new Date().toISOString()
      }).catch(error => {
        console.error("Error completing task:", error);
      });
      
      // Optimistically update parent immediately
      onUpdate({ 
        ...task, 
        status: 'completed',
        completed_at: new Date().toISOString()
      });
      
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}" and all its sub-tasks?`)) return;
    
    setIsUpdating(true);
    try {
      // CRITICAL: Cancel scheduled notification before deleting
      if (task.onesignal_notification_id) {
        console.log(`🗑️ [DELETE] Canceling notification ${task.onesignal_notification_id} for task "${task.title}"`);
        await cancelScheduledReminder(task.onesignal_notification_id);
      }

      // Delete subtasks and their notifications
      for (const subTask of subTasks) {
        if (subTask.onesignal_notification_id) {
          await cancelScheduledReminder(subTask.onesignal_notification_id);
        }
        Task.delete(subTask.id).catch(error => {
          console.error("Error deleting subtask:", error);
        });
      }

      // Delete the task
      Task.delete(task.id).catch(error => {
        console.error("Error deleting task:", error);
      });
      
      // Notify parent immediately
      if (onDelete) {
        onDelete();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const completedCount = subTasks.filter(s => s.status === 'completed').length;
  const progress = subTasks.length > 0
    ? (completedCount / subTasks.length) * 100
    : 0;

  if (!task) return null;

  const formatReminderTime = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getCurrentReminderTime = (task) => {
    if (!task.next_reminder) return '';
    const date = new Date(task.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
      'once': 'One time'
    };
    return formats[interval] || interval;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          {isUpdating && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-purple-600 rounded-full animate-spin"></div>
                <p className="text-sm font-medium text-gray-700">Updating...</p>
              </div>
            </div>
          )}
          
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="flex-1 text-2xl font-bold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') {
                        setEditedTitle(task.title);
                        setIsEditingTitle(false);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveTitle}
                    className="h-8 w-8"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditedTitle(task.title);
                      setIsEditingTitle(false);
                    }}
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1">{task.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditingTitle(true)}
                    className="h-8 w-8"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {task.description && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Description</h4>
                <p className="text-gray-700">{task.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* Energy Badge - Clickable */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`cursor-pointer hover:opacity-80 transition-opacity ${
                    theme === 'minimalist'
                      ? 'bg-blue-100 text-blue-700'
                      : theme === 'dark'
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-purple-200 text-purple-800'
                  } px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1`}>
                    <Zap className="w-3 h-3" />
                    {task.energy_required} energy
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2">
                  <div className="space-y-1">
                    <button onClick={() => handleUpdateField('energy_required', 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low Energy</button>
                    <button onClick={() => handleUpdateField('energy_required', 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium Energy</button>
                    <button onClick={() => handleUpdateField('energy_required', 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High Energy</button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Reminder Interval Badge - Clickable */}
              {task.reminder_interval && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity border px-3 py-1 rounded-full text-sm font-medium bg-white flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatReminderInterval(task.reminder_interval)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <div className="space-y-1">
                      <button onClick={() => handleUpdateField('reminder_interval', '10min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 10 minutes</button>
                      <button onClick={() => handleUpdateField('reminder_interval', '20min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 20 minutes</button>
                      <button onClick={() => handleUpdateField('reminder_interval', '30min')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 30 minutes</button>
                      <button onClick={() => handleUpdateField('reminder_interval', '1hour')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every hour</button>
                      <button onClick={() => handleUpdateField('reminder_interval', '2hours')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every 2 hours</button>
                      <button onClick={() => handleUpdateField('reminder_interval', 'daily')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Daily</button>
                      <button onClick={() => handleUpdateField('reminder_interval', 'every_other_day')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Every other day</button>
                      <button onClick={() => handleUpdateField('reminder_interval', 'once')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">One time</button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Next Reminder Time Badge - Clickable */}
              {task.next_reminder && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next: {formatReminderTime(task.next_reminder)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-64 p-4 ${
                    theme === 'dark' 
                      ? 'bg-gray-800 border-gray-700 text-gray-100' 
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="space-y-2">
                      <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        Change reminder time:
                      </label>
                      <input
                        type="time"
                        defaultValue={getCurrentReminderTime(task)}
                        onChange={(e) => handleUpdateReminderTime(e.target.value)}
                        className={`w-full border rounded px-3 py-2 ${
                          theme === 'dark'
                            ? 'bg-gray-900 border-gray-600 text-gray-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Priority Badge - Clickable */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium ${
                    task.urgency === 'urgent' ? 'bg-red-100 text-red-700' :
                    task.urgency === 'high' ? 'bg-amber-100 text-amber-700' :
                    task.urgency === 'medium' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {task.urgency} priority
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2">
                  <div className="space-y-1">
                    <button onClick={() => handleUpdateField('urgency', 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low Priority</button>
                    <button onClick={() => handleUpdateField('urgency', 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-100 rounded">Medium Priority</button>
                    <button onClick={() => handleUpdateField('urgency', 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High Priority</button>
                    <button onClick={() => handleUpdateField('urgency', 'urgent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Urgent</button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-4">
              {subTasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ListChecks className="w-4 h-4" />
                      Progress: {completedCount} of {subTasks.length}
                    </h4>
                    <span className="text-sm font-bold">{Math.round(progress)}%</span>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-3 ${
                      theme === 'minimalist'
                        ? '[&>div]:bg-green-500'
                        : theme === 'dark'
                          ? '[&>div]:bg-green-600'
                          : '[&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-orange-500'
                    }`}
                  />
                </div>
              )}

              {/* UPDATED: Better visual separation for manual input when no subtasks */}
              {subTasks.length === 0 && (
                <div className="space-y-4">
                  {/* Manual subtask input - FIRST and more prominent */}
                  <div className={`p-4 rounded-lg border-2 ${
                    theme === 'minimalist'
                      ? 'border-green-200 bg-green-50/30'
                      : theme === 'dark'
                        ? 'border-green-800 bg-green-900/20'
                        : 'border-green-300 bg-green-100/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Plus className="w-5 h-5 text-green-600" />
                      <h4 className="text-sm font-semibold text-gray-900">Add Sub-Tasks Manually</h4>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <Button
                        variant={subtaskInputMode === 'text' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSubtaskInputMode('text')}
                        className="flex-1"
                      >
                        <Keyboard className="w-3 h-3 mr-1" />
                        Type
                      </Button>
                      <Button
                        variant={subtaskInputMode === 'voice' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSubtaskInputMode('voice')}
                        className="flex-1"
                      >
                        <Mic className="w-3 h-3 mr-1" />
                        Voice
                      </Button>
                    </div>

                    {subtaskInputMode === 'text' ? (
                      <form onSubmit={handleAddSubTask} className="flex gap-2">
                        <Input
                          value={newSubTask}
                          onChange={(e) => setNewSubTask(e.target.value)}
                          placeholder="Add a new sub-task..."
                          className="flex-1"
                        />
                        <Button type="submit" size="icon" className="flex-shrink-0">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-gray-500 text-center">
                          {isProcessingVoice ? "Processing..." : "Speak your subtasks (you can say multiple at once)"}
                        </p>
                        <div className="flex justify-center">
                          <VoiceTaskInput
                            onTranscription={handleVoiceSubtask}
                            theme={theme}
                            inline={false}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">Or</span>
                    </div>
                  </div>

                  {/* AI suggestion - SECOND */}
                  <div className={`p-4 rounded-lg border-2 border-dashed text-center ${
                    theme === 'minimalist'
                      ? 'border-purple-200 bg-purple-50/30'
                      : theme === 'dark'
                        ? 'border-purple-800 bg-purple-900/20'
                        : 'border-purple-300 bg-purple-100/30'
                  }`}>
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                    <p className="text-sm text-gray-700 mb-3">
                      Task feels overwhelming? Let AI break it down!
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPreviousSubTasks(subTasks);
                        setHasDecomposedSuccessfully(false);
                        setShowDecomposition(true);
                      }}
                      className="border-purple-300 hover:bg-purple-50"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI Break Down Task
                    </Button>
                  </div>
                </div>
              )}

              {subTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Sub-tasks</h4>
                    <div className="flex items-center gap-2">
                      {subTasks.length < 3 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPreviousSubTasks(subTasks);
                            setHasDecomposedSuccessfully(false);
                            setShowDecomposition(true);
                          }}
                          className="text-xs"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Suggest More
                        </Button>
                      )}
                      {previousSubTasks !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleUndoDecomposition}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          <Undo className="w-3 h-3 mr-1" />
                          Undo AI Breakdown
                        </Button>
                      )}
                    </div>
                  </div>
                  {subTasks.map((subTask) => (
                    <div
                      key={subTask.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        subTask.status === 'completed'
                          ? theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                          : theme === 'minimalist'
                            ? 'bg-white border-gray-200'
                            : theme === 'dark'
                              ? 'bg-gray-800/50 border-gray-700'
                              : 'bg-gradient-to-r from-purple-50/30 to-orange-50/30 border-purple-100'
                      }`}
                    >
                      <Checkbox
                        checked={subTask.status === 'completed'}
                        onCheckedChange={() => handleSubTaskToggle(subTask)}
                        className={theme === 'colorful' ? 'data-[state=checked]:bg-purple-600' : ''}
                      />
                      <span className={`flex-1 ${
                        subTask.status === 'completed' ? 'line-through text-gray-500' : theme === 'dark' ? 'text-gray-200' : 'text-gray-900'
                      }`}>
                        {subTask.title}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleDeleteSubTask(subTask.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="pt-2">
                    <div className="flex gap-2 mb-2">
                      <Button
                        variant={subtaskInputMode === 'text' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setSubtaskInputMode('text')}
                        className="flex-1"
                      >
                        <Keyboard className="w-3 h-3 mr-1" />
                        Type
                      </Button>
                      <Button
                        variant={subtaskInputMode === 'voice' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setSubtaskInputMode('voice')}
                        className="flex-1"
                      >
                        <Mic className="w-3 h-3 mr-1" />
                        Voice
                      </Button>
                    </div>

                    {subtaskInputMode === 'text' ? (
                      <form onSubmit={handleAddSubTask} className="flex gap-2">
                        <Input
                          value={newSubTask}
                          onChange={(e) => setNewSubTask(e.target.value)}
                          placeholder="Add a new sub-task..."
                          className="flex-1"
                        />
                        <Button type="submit" size="icon" className="flex-shrink-0">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-gray-500 text-center">
                          {isProcessingVoice ? "Processing..." : "Speak your subtasks (you can say multiple at once)"}
                        </p>
                        <div className="flex justify-center">
                          <VoiceTaskInput
                            onTranscription={handleVoiceSubtask}
                            theme={theme}
                            inline={false}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {progress === 100 && subTasks.length > 0 && (
              <div className={`p-6 rounded-xl text-center ${
                theme === 'minimalist'
                  ? 'bg-green-50 border-2 border-green-200'
                  : theme === 'dark'
                    ? 'bg-green-900/20 border-2 border-green-800'
                    : 'bg-gradient-to-r from-purple-100 to-orange-100 border-2 border-purple-300'
              }`}>
                <Sparkles className={`w-12 h-12 mx-auto mb-3 ${
                  theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
                }`} />
                <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                  All sub-tasks complete! 🎉
                </h3>
                <p className={theme === 'dark' ? 'text-gray-400 mb-4' : 'text-gray-600 mb-4'}>
                  You're ready to mark this main task as done.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={handleComplete}
              className={theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark as Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDecompositionModal
        task={task}
        isOpen={showDecomposition}
        onClose={() => {
          setShowDecomposition(false);
          if (!hasDecomposedSuccessfully) {
            setPreviousSubTasks(null);
          }
          setHasDecomposedSuccessfully(false);
        }}
        onUpdate={() => {
          setHasDecomposedSuccessfully(true);
          fetchSubTasks(task.id);
          onUpdate();
        }}
        theme={theme}
      />
    </>
  );
}
