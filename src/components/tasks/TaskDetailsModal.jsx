import React, { useState, useEffect, useRef } from 'react';
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
  CalendarClock,
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
  X,
  Lightbulb,
  Image as ImageIcon,
  Upload,
  FileText,
  Bell,
  BellOff
} from "lucide-react";
import { Task } from "@/entities/Task";
import TaskDecompositionModal from "./TaskDecompositionModal";
import SmartReminderEditor from "./SmartReminderEditor";
import AddSubTaskCard from "./AddSubTaskCard";
import ReminderTypeSelector, { getCurrentReminderType } from "./ReminderTypeSelector";
import VoiceTaskInput from "./VoiceTaskInput";
import { scheduleReminder, cancelScheduledReminder } from "../utils/reminderScheduler";
import { User } from "@/entities/User";
import { base44 } from "@/api/base44Client";
import ImageViewer from "../shared/ImageViewer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LaunchButtons from "../launch/LaunchButtons";
import { useToast } from "@/components/ui/use-toast";

export default function TaskDetailsModal({ task, isOpen, onClose, onUpdate, onDelete, theme, itemClassification }) {
  const { toast } = useToast();
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
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [taskPictures, setTaskPictures] = useState([]);
  const [taskNotes, setTaskNotes] = useState('');
  const [viewingImage, setViewingImage] = useState(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  const reminderDateRef = useRef('');
  const reminderTimeRef = useRef('');
  const isInitializingRef = useRef(false);

  useEffect(() => {
    if (task && isOpen) {
      fetchSubTasks(task.id);
      setPreviousSubTasks(null);
      setHasDecomposedSuccessfully(false);
      setEditedTitle(task.title);
      setIsEditingTitle(false);
      setTaskPictures(task.pictures || []);
      setTaskNotes(task.notes || '');
      // Initialize controlled date/time inputs from task
      isInitializingRef.current = true;
      if (task.next_reminder) {
        const d = new Date(task.next_reminder);
        const rd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const rt = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        setReminderDate(rd);
        setReminderTime(rt);
        reminderDateRef.current = rd;
        reminderTimeRef.current = rt;
      } else {
        setReminderDate('');
        setReminderTime('');
        reminderDateRef.current = '';
        reminderTimeRef.current = '';
      }
      if (task.event_time) {
        const ed = new Date(task.event_time);
        setEventDate(`${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`);
        setEventTime(`${String(ed.getHours()).padStart(2,'0')}:${String(ed.getMinutes()).padStart(2,'0')}`);
      } else {
        setEventDate('');
        setEventTime('');
      }
      setTimeout(() => { isInitializingRef.current = false; }, 100);
    }
  }, [task?.id, isOpen]);

  const fetchSubTasks = async (taskId) => {
    // Sub-tasks are STEPS — always show them in the order they're performed:
    // by subtask_order when set, otherwise oldest-created first. Sorting by
    // '-created_date' showed the last step first (put clothes away before
    // starting the washer).
    const fetchedSubTasks = await Task.filter({ parent_task_id: taskId }, 'created_date');
    const ordered = [...fetchedSubTasks].sort((a, b) => {
      const ao = a.subtask_order ?? Infinity;
      const bo = b.subtask_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(a.created_date) - new Date(b.created_date);
    });
    setSubTasks(ordered);
    return ordered;
  };

  const handleSubTaskToggle = async (subTask) => {
    const newStatus = subTask.status === 'completed' ? 'active' : 'completed';
    // Optimistic — update local state immediately
    setSubTasks(prev => prev.map(s => s.id === subTask.id ? { ...s, status: newStatus } : s));
    if (onUpdate) {
      onUpdate(task);
    }
    // Save in the background, then re-fetch to sync
    base44.entities.Task.update(subTask.id, { status: newStatus })
      .then(() => fetchSubTasks(task.id))
      .catch(error => console.error("Error toggling subtask:", error));
  };

  const handleAddSubTask = async (e) => {
    e.preventDefault();
    if (!newSubTask.trim() || !task) return;

    try {
      const currentUser = await base44.auth.me();

      // Split by comma to support multiple subtasks
      const subtaskTitles = newSubTask.split(',').map(s => s.trim()).filter(s => s.length > 0);

      // Optimistic — add subtasks to local state immediately
      const tempSubTasks = subtaskTitles.map((title, i) => ({
        id: `temp_${Date.now()}_${i}`,
        title,
        parent_task_id: task.id,
        urgency: task.urgency,
        energy_required: task.energy_required,
        status: 'active',
        reminder_interval: task.reminder_interval,
        subtask_order: subTasks.length + i + 1,
      }));
      setSubTasks(prev => [...prev, ...tempSubTasks]);
      setNewSubTask("");
      if (onUpdate) onUpdate(task);

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
        case '4hours':
          nextReminder.setHours(nextReminder.getHours() + 4);
          break;
        case 'daily':
          nextReminder.setDate(nextReminder.getDate() + 1);
          break;
        case 'every_other_day':
          nextReminder.setDate(nextReminder.getDate() + 2);
          break;
        default: // This includes 'once' or null interval
          nextReminder = null;
          break;
      }

      // Create all subtasks in the background
      (async () => {
        try {
          for (let i = 0; i < subtaskTitles.length; i++) {
            const title = subtaskTitles[i];
            await Task.create({
              title: title,
              parent_task_id: task.id,
              subtask_order: subTasks.length + i + 1,
              urgency: task.urgency,
              energy_required: task.energy_required,
              status: 'active',
              reminder_interval: task.reminder_interval,
              reminder_count: 0,
              next_reminder: task.reminder_interval && task.reminder_interval !== 'once' && nextReminder ? nextReminder.toISOString() : null,
              notification_recipient_email: currentUser.email
            });
          }
          // Re-fetch to replace temp subtasks with real ones
          await fetchSubTasks(task.id);
          if (onUpdate) onUpdate(task);
        } catch (error) {
          console.error("Error adding subtask:", error);
          fetchSubTasks(task.id);
        }
      })();
    } catch (error) {
      console.error("Error adding subtask:", error);
    }
  };

  const handleVoiceSubtask = async (transcription) => {
    if (!transcription.trim() || !task) return;

    setIsProcessingVoice(true);

    try {
      const prompt = `Parse this voice input and extract task items to add as sub-tasks:

INPUT: "${transcription}"

If it's a list of things, return each as a separate subtask.
If it's one thing, return it as a single subtask.

CRITICAL: Maintain the EXACT ORDER the items were spoken in.

Return JSON:
{
  "subtasks": ["subtask 1", "subtask 2", ...] (IN THE ORDER SPOKEN)
}`;

      const result = await base44.functions.invoke('extractSubtasks', { prompt });
      const response = result?.data?.response;

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
        case '4hours':
          nextReminder.setHours(nextReminder.getHours() + 4);
          break;
        case 'daily':
          nextReminder.setDate(nextReminder.getDate() + 1);
          break;
        case 'every_other_day':
          nextReminder.setDate(nextReminder.getDate() + 2);
          break;
        default: // This includes 'once' or null interval
          nextReminder = null;
          break;
      }

      const spoken = response.subtasks || [];

      // OPTIMISTIC: show the parsed steps right away, then create them in the
      // background — the user shouldn't stare at a spinner after speaking.
      setSubTasks(prev => [
        ...prev,
        ...spoken.map((title, i) => ({
          id: `temp_${Date.now()}_${i}`,
          title: title.trim(),
          parent_task_id: task.id,
          status: 'active',
          subtask_order: prev.length + i + 1,
        })),
      ]);
      setIsProcessingVoice(false);

      for (let i = 0; i < spoken.length; i++) {
        const subtaskTitle = spoken[i];
        await Task.create({
          title: subtaskTitle.trim(),
          parent_task_id: task.id,
          subtask_order: subTasks.length + i + 1,
          urgency: task.urgency,
          energy_required: task.energy_required,
          status: 'active',
          reminder_interval: task.reminder_interval,
          reminder_count: 0,
          next_reminder: task.reminder_interval && task.reminder_interval !== 'once' && nextReminder ? nextReminder.toISOString() : null,
          notification_recipient_email: currentUser.email
        });

        // Note: Recurring reminders are handled by cron job, not OneSignal
        // Only one-time reminders (interval='once') should use OneSignal
      }

      await fetchSubTasks(task.id);
      
      // Call onUpdate with parent task to trigger refresh
      if (onUpdate) {
        onUpdate(task);
      }
    } catch (error) {
      console.error("Error processing voice subtask:", error);
      alert("Failed to process voice input. Please try again.");
    }

    setIsProcessingVoice(false);
  };

  const handleDeleteSubTask = async (subTaskId) => {
    // Optimistic — remove from local state immediately
    setSubTasks(prev => prev.filter(s => s.id !== subTaskId));
    if (onUpdate) {
      onUpdate(task);
    }
    // Delete in the background, then re-fetch to sync
    Task.delete(subTaskId)
      .then(() => fetchSubTasks(task.id))
      .catch(error => console.error("Error deleting subtask:", error));
  };

  const handleUndoDecomposition = async () => {
    if (!previousSubTasks || !task) return;

    const previousSubTaskIds = new Set(previousSubTasks.map(st => st.id));
    const tasksToDelete = subTasks.filter(st => !previousSubTaskIds.has(st.id));

    // OPTIMISTIC: revert the list instantly, then delete in the background.
    setSubTasks(previousSubTasks);
    setPreviousSubTasks(null);
    setHasDecomposedSuccessfully(false);

    (async () => {
      try {
        for (const subTaskToDelete of tasksToDelete) {
          await Task.delete(subTaskToDelete.id);
        }
        await fetchSubTasks(task.id);
        onUpdate();
      } catch (e) {
        console.error('Error undoing breakdown:', e);
        fetchSubTasks(task.id);
      }
    })();
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !task) {
      setEditedTitle(task?.title || '');
      setIsEditingTitle(false);
      return;
    }

    // Optimistic update — user sees the title change instantly
    onUpdate({ ...task, title: editedTitle.trim() });
    setIsEditingTitle(false);

    try {
      // If task has recurring reminders, cancel old notifications and reschedule with new title
      if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0 && task.reminder_interval && task.reminder_interval !== 'once') {
        try {
          const currentUser = await base44.auth.me();

          // Cancel existing scheduled notifications
          await cancelScheduledReminder(task.onesignal_notification_ids);

          // Reschedule with updated title
          const intervalMs = {
            '10min': 10 * 60 * 1000,
            '20min': 20 * 60 * 1000,
            '30min': 30 * 60 * 1000,
            '1hour': 60 * 60 * 1000,
            '2hours': 2 * 60 * 60 * 1000,
            '4hours': 4 * 60 * 60 * 1000,
            'daily': 24 * 60 * 60 * 1000,
            'every_other_day': 2 * 24 * 60 * 60 * 1000,
          };

          if (intervalMs[task.reminder_interval] && task.next_reminder) {
            const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
            const { notificationIds: newNotificationIds } = await scheduleRecurringReminders({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${editedTitle.trim()}\n\nTap to mark as complete!`,
              startTime: task.next_reminder,
              intervalMs: intervalMs[task.reminder_interval],
              count: 10,
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });

            // Update with new notification IDs
            Task.update(task.id, { 
              title: editedTitle.trim(),
              onesignal_notification_ids: newNotificationIds 
            }).catch(error => {
              console.error("Error updating task:", error);
            });
          }
        } catch (error) {
          console.error("Failed to reschedule notifications:", error);
        }
      } else if (task.reminder_schedule && task.reminder_schedule.length > 0) {
        // One-time / event task — cancel the LLM-decided reminder schedule and
        // reschedule each entry at the same time with the updated title so the
        // notification content stays in sync with the new title.
        try {
          const currentUser = await base44.auth.me();
          const oldIds = Array.from(new Set([
            ...(task.onesignal_notification_ids || []),
            ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
          ]));
          if (oldIds.length > 0) {
            await cancelScheduledReminder(oldIds);
          }
          const newSchedule = [];
          const newIds = [];
          for (const entry of task.reminder_schedule) {
            const notificationId = await scheduleReminder({
              email: currentUser.email,
              title: `📌 ${editedTitle.trim()}`,
              body: `You've got this! ${editedTitle.trim()}`,
              sendAtISO: entry.send_at,
              taskId: task.id,
              data: {
                screen: '/TaskNotification',
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder',
              },
              buttons: [
                { id: 'snooze_15', text: 'Snooze 15 min' },
                { id: 'snooze_60', text: 'Snooze 1 hour' },
                { id: 'complete', text: '✅ Done' },
              ],
            });
            if (notificationId) {
              newIds.push(notificationId);
              newSchedule.push({
                ...entry,
                notification_id: notificationId,
                notification_title: `📌 ${editedTitle.trim()}`,
                notification_body: `You've got this! ${editedTitle.trim()}`,
              });
            } else {
              newSchedule.push(entry);
            }
          }
          Task.update(task.id, {
            title: editedTitle.trim(),
            reminder_schedule: newSchedule,
            onesignal_notification_ids: newIds,
          }).catch((error) => {
            console.error("Error updating task:", error);
          });
        } catch (error) {
          console.error("Failed to reschedule one-time reminders:", error);
        }
      } else {
        // Just update title if no recurring reminders
        Task.update(task.id, { title: editedTitle.trim() }).catch(error => {
          console.error("Error updating task title:", error);
        });
      }
    } catch (error) {
      console.error("Error saving title:", error);
    }
  };

  const handleUpdateField = async (field, value) => {
    if (!task) return;

    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, [field]: value });

    try {
      const updates = { [field]: value };
      
      // CRITICAL: Don't cancel reminders when only updating recurrence_pattern
      const shouldCancelReminders = field !== 'recurrence_pattern' && 
        task.onesignal_notification_ids && 
        task.onesignal_notification_ids.length > 0;
      
      if (shouldCancelReminders) {
        try {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        } catch (error) {
          console.error("Failed to cancel existing reminders:", error);
        }
      }

      // If changing reminder interval, recalculate next_reminder and schedule new notifications
      if (field === 'reminder_interval') {
        const now = new Date();
        let nextReminderDate = null;
        const currentUser = await User.me();

        const intervalMs = {
          '10min': 10 * 60 * 1000,
          '20min': 20 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        if (value === 'once') {
          // If changing to 'once', keep current next_reminder if it exists,
          // otherwise set a default future date (e.g., tomorrow 9 AM)
          if (task.next_reminder) {
            // Parse preserving local time — avoid UTC midnight crossing
            const d = new Date(task.next_reminder);
            nextReminderDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
          } else {
            nextReminderDate = new Date();
            nextReminderDate.setDate(nextReminderDate.getDate() + 1);
            nextReminderDate.setHours(9, 0, 0, 0);
          }
          // Ensure it's in the future
          if (nextReminderDate <= now) {
            nextReminderDate.setDate(nextReminderDate.getDate() + 1);
          }
          
          updates.next_reminder = nextReminderDate.toISOString();
          updates.onesignal_notification_ids = [];
          updates.reminder_schedule = null;

          // Schedule single one-time reminder
          try {
            const notificationId = await scheduleReminder({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${task.title}\n\nTap to mark as complete!`,
              sendAtISO: nextReminderDate.toISOString(),
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });
            if (notificationId) {
              updates.onesignal_notification_ids = [notificationId];
            }
          } catch (error) {
            console.error("Failed to schedule one-time reminder:", error);
          }
        } else if (intervalMs[value]) {
          // FIXED: Preserve existing next_reminder when switching to recurring
          // This allows setting a specific date THEN making it recurring
          if (task.next_reminder) {
            // Parse preserving local time — avoid UTC midnight crossing
            const d = new Date(task.next_reminder);
            nextReminderDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
            // Only adjust if in the past
            if (nextReminderDate <= now) {
              nextReminderDate = new Date(now.getTime());
              switch (value) {
                case '10min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 10); break;
                case '20min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 20); break;
                case '30min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 30); break;
                case '1hour': nextReminderDate.setHours(nextReminderDate.getHours() + 1); break;
                case '2hours': nextReminderDate.setHours(nextReminderDate.getHours() + 2); break;
                case '4hours': nextReminderDate.setHours(nextReminderDate.getHours() + 4); break;
                case 'daily': nextReminderDate.setDate(nextReminderDate.getDate() + 1); break;
                case 'every_other_day': nextReminderDate.setDate(nextReminderDate.getDate() + 2); break;
              }
            }
          } else {
            // No existing date, calculate from now
            nextReminderDate = new Date(now.getTime());
            switch (value) {
              case '10min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 10); break;
              case '20min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 20); break;
              case '30min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 30); break;
              case '1hour': nextReminderDate.setHours(nextReminderDate.getHours() + 1); break;
              case '2hours': nextReminderDate.setHours(nextReminderDate.getHours() + 2); break;
              case 'daily': nextReminderDate.setDate(nextReminderDate.getDate() + 1); break;
              case 'every_other_day': nextReminderDate.setDate(nextReminderDate.getDate() + 2); break;
            }
          }
          
          updates.next_reminder = nextReminderDate.toISOString();
          updates.reminder_schedule = null;

          // Schedule recurring reminders (10 at a time)
          try {
            const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
            const { notificationIds: newNotificationIds } = await scheduleRecurringReminders({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${task.title}\n\nTap to mark as complete!`,
              startTime: nextReminderDate.toISOString(),
              intervalMs: intervalMs[value],
              count: 10,
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });
            updates.onesignal_notification_ids = newNotificationIds || [];
          } catch (error) {
            console.error("Failed to schedule recurring reminders:", error);
            updates.onesignal_notification_ids = [];
          }
        }
      }
      
      // Fire the save in the background — don't block the UI
      Task.update(task.id, updates).catch(error => {
        console.error(`Error updating ${field}:`, error);
      });

      // Sync backend-generated fields (notification IDs, next_reminder)
      onUpdate({ ...task, ...updates });
    } catch (error) {
      console.error(`Error in handleUpdateField for ${field}:`, error);
    }
  };

  const handleUpdateReminderTime = async (selectedTime, selectedDate) => {
    if (!task) return;

    try {
      const currentTaskTime = getCurrentReminderTime(task);
      const currentTaskDate = getCurrentReminderDate(task);

      const effectiveTime = selectedTime !== undefined ? selectedTime : currentTaskTime;
      const effectiveDate = selectedDate !== undefined ? selectedDate : currentTaskDate;

      const _now = new Date();
      const localToday = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
      if (!effectiveTime) return; // No hidden time default — require user to set time
      const finalEffectiveDate = effectiveDate || localToday;
      const finalEffectiveTime = effectiveTime;

      // Parse date components explicitly to avoid UTC midnight crossing (same as task creation)
      const [year, month, day] = finalEffectiveDate.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = finalEffectiveTime.split(':').map(n => parseInt(n, 10));
      let nextReminder = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // Past-date guard runs FIRST (synchronously) so we never optimistically
      // show a save that we're about to reject.
      const intervalMsGuard = {
        '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };
      const guardNowSync = new Date();
      if (nextReminder <= new Date(guardNowSync.getTime() + 2 * 60 * 1000)) {
        const iv = task.reminder_interval;
        if (iv && iv !== 'once' && intervalMsGuard[iv]) {
          nextReminder = new Date(guardNowSync.getTime() + intervalMsGuard[iv]);
        } else {
          alert("⚠️ The date and time you picked is in the past.\n\nPlease choose a future date and time, then tap Save again.");
          return;
        }
      }

      // OPTIMISTIC: show the new time + confirmation immediately, then do all
      // the cancel/reschedule network work in the background.
      onUpdate({ ...task, next_reminder: nextReminder.toISOString() });
      const savedRdNow = `${nextReminder.getFullYear()}-${String(nextReminder.getMonth()+1).padStart(2,'0')}-${String(nextReminder.getDate()).padStart(2,'0')}`;
      const savedRtNow = `${String(nextReminder.getHours()).padStart(2,'0')}:${String(nextReminder.getMinutes()).padStart(2,'0')}`;
      setReminderDate(savedRdNow);
      setReminderTime(savedRtNow);
      reminderDateRef.current = savedRdNow;
      reminderTimeRef.current = savedRtNow;
      toast({
        title: "Reminder saved ✓",
        description: `We'll remind you ${nextReminder.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`,
      });

      (async () => {
      // Cancel existing reminders — include every notification ID we know about
      // (both onesignal_notification_ids and any IDs stored on individual
      // reminder_schedule entries) so no stale reminder survives a date/time
      // change and fires with outdated "in about 30 minutes" wording.
      const allOldNotificationIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map(r => r.notification_id).filter(Boolean)),
      ]));
      if (allOldNotificationIds.length > 0) {
        try {
          await cancelScheduledReminder(allOldNotificationIds);
        } catch (error) {
          console.error("Failed to cancel existing reminders:", error);
        }
      }

      // Reschedule — use recurring or one-time depending on interval (same as task creation)
      let newNotificationIds = [];
      const intervalMs = {
        '10min': 10 * 60 * 1000,
        '20min': 20 * 60 * 1000,
        '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000,
        '2hours': 2 * 60 * 60 * 1000,
        '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000,
        'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };

      try {
        const currentUser = await base44.auth.me();
        const interval = task.reminder_interval;

        if (interval && interval !== 'once' && intervalMs[interval]) {
          // Recurring: schedule 10 future occurrences (same as creation)
          const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
          const { notificationIds, lastScheduledUntil } = await scheduleRecurringReminders({
            email: currentUser.email,
            title: "Task Reminder 📋",
            body: `${task.title}\n\nTap to mark as complete!`,
            startTime: nextReminder.toISOString(),
            intervalMs: intervalMs[interval],
            count: 10,
            taskId: task.id,
            data: {
              screen: "/TaskNotification",
              taskId: task.id,
              urgency: task.urgency,
              type: 'task_reminder'
            },
            buttons: [
              { id: "snooze_15", text: "Snooze 15 min" },
              { id: "snooze_60", text: "Snooze 1 hour" },
              { id: "complete", text: "✅ Done" }
            ]
          });
          newNotificationIds = notificationIds || [];

          Task.update(task.id, {
            next_reminder: nextReminder.toISOString(),
            onesignal_notification_ids: newNotificationIds,
            reminder_schedule: null,
            ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
          }).catch(err => console.error("Error updating task:", err));
        } else {
          // One-time reminder — check for multi-reminder category first
          const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
          const multiIds = await scheduleMultiReminders({
            email: currentUser.email,
            title: task.title,
            scheduledDateISO: nextReminder.toISOString(),
            taskId: task.id,
            urgency: task.urgency,
          });

          let scheduleData = null;
          if (multiIds) {
            newNotificationIds = multiIds;
          } else {
            // No multi-reminder match — single reminder at the scheduled time
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
              },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            });
            if (notificationId) newNotificationIds = [notificationId];
          }

          Task.update(task.id, {
            next_reminder: nextReminder.toISOString(),
            onesignal_notification_ids: newNotificationIds,
            reminder_schedule: scheduleData,
          }).catch(err => console.error("Error updating task:", err));
        }
      } catch (error) {
        console.error("Failed to reschedule reminder:", error);
      }
      })();
    } catch (error) {
      console.error("Error saving reminder time:", error);
    }
  };

  const handleDueDateChange = async (newDate) => {
    if (!task) return;
    let dueDateValue = null;
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
      const existing = task.due_date ? new Date(task.due_date) : null;
      const hours = existing ? existing.getHours() : 17;
      const minutes = existing ? existing.getMinutes() : 0;
      dueDateValue = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
    }
    // Track when the user pushes a due date LATER — used by Insights and the
    // smart-nudge LLM to spot chronically postponed tasks. Only counts as a
    // push when there was an existing due date and the new one is later.
    const updates = { due_date: dueDateValue };
    if (dueDateValue && task.due_date) {
      const oldDate = new Date(task.due_date);
      const newDateObj = new Date(dueDateValue);
      if (newDateObj.getTime() > oldDate.getTime()) {
        updates.due_date_pushes = (task.due_date_pushes || 0) + 1;
      }
    }
    // One-time tasks with a Smart Reminder Schedule: the schedule is anchored
    // to the old date, so a due-date change MUST cancel every old OneSignal
    // notification and regenerate a fresh schedule at the new date. (Recurring
    // interval tasks are rescheduled by the backend onTaskUpdate automation.)
    const hasSmartSchedule = (task.reminder_schedule && task.reminder_schedule.length > 0);
    const isOneTime = !task.reminder_interval || task.reminder_interval === 'once';

    if (isOneTime && (hasSmartSchedule || dueDateValue)) {
      if (dueDateValue) updates.next_reminder = dueDateValue;
      // Optimistic — show the new date and a schedule that's being rebuilt
      onUpdate({ ...task, ...updates, reminder_schedule: [], onesignal_notification_ids: [] });
      toast({ title: 'Due date saved ✓', description: dueDateValue ? 'Rebuilding your reminder schedule…' : undefined });

      (async () => {
        try {
          // Cancel every notification we know about — batch IDs and per-entry IDs
          const allOldIds = Array.from(new Set([
            ...(task.onesignal_notification_ids || []),
            ...((task.reminder_schedule || []).map(r => r.notification_id).filter(Boolean)),
          ]));
          if (allOldIds.length > 0) {
            await cancelScheduledReminder(allOldIds).catch(e => console.error('Failed to cancel old reminders:', e));
          }

          await Task.update(task.id, {
            ...updates,
            onesignal_notification_ids: [],
            reminder_schedule: [],
          });

          if (dueDateValue) {
            const currentUser = await base44.auth.me();
            const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
            const multiIds = await scheduleMultiReminders({
              email: currentUser.email,
              title: task.title,
              scheduledDateISO: dueDateValue,
              taskId: task.id,
              urgency: task.urgency,
              classification: task.classification,
            });
            if (multiIds && multiIds.length > 0) {
              await Task.update(task.id, { onesignal_notification_ids: multiIds });
            }
            const refreshed = await Task.filter({ id: task.id });
            if (refreshed[0]) onUpdate(refreshed[0]);
          }
        } catch (error) {
          console.error('Error rescheduling reminders for new due date:', error);
        }
      })();
      return;
    }

    Task.update(task.id, updates).catch(error => {
      console.error("Error updating due date:", error);
    });
    onUpdate({ ...task, ...updates });
  };

  // Start date — only meaningful when there's a future due date. Lets the user
  // say "this is due Friday but I should be working on it all week." Default
  // is no start date; clearing it sets it back to null.
  const handleStartDateChange = async (newDate) => {
    if (!task) return;
    let startDateValue = null;
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
      startDateValue = new Date(year, month - 1, day, 9, 0, 0, 0).toISOString();
    }
    Task.update(task.id, { start_date: startDateValue }).catch(error => {
      console.error("Error updating start date:", error);
    });
    onUpdate({ ...task, start_date: startDateValue });
  };

  // Set the actual event date & time for event-classified tasks. Cancels any
  // old lead-time reminders and regenerates a fresh schedule from the new time.
  const handleUpdateEventTime = async (selectedDate, selectedTime) => {
    if (!task || !selectedDate || !selectedTime) return;
    const [year, month, day] = selectedDate.split('-').map(n => parseInt(n, 10));
    const [hours, minutes] = selectedTime.split(':').map(n => parseInt(n, 10));
    const eventTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // OPTIMISTIC: show the new event time + confirmation immediately, then
    // cancel/reschedule in the background instead of blocking on the network.
    onUpdate({ ...task, event_time: eventTime.toISOString(), next_reminder: eventTime.toISOString() });
    toast({ title: 'Event time saved ✓' });

    (async () => {
      try {
      const allOldIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map(r => r.notification_id).filter(Boolean)),
      ]));
      if (allOldIds.length > 0) {
        try { await cancelScheduledReminder(allOldIds); } catch (e) { console.error('Failed to cancel old reminders:', e); }
      }

      await Task.update(task.id, {
        event_time: eventTime.toISOString(),
        next_reminder: eventTime.toISOString(),
        onesignal_notification_ids: [],
        reminder_schedule: [],
      });

      const currentUser = await base44.auth.me();
      const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
      const multiIds = await scheduleMultiReminders({
        email: currentUser.email,
        title: task.title,
        scheduledDateISO: eventTime.toISOString(),
        taskId: task.id,
        urgency: task.urgency,
        classification: 'event',
      });
      if (multiIds && multiIds.length > 0) {
        await Task.update(task.id, { onesignal_notification_ids: multiIds });
      }

      const refreshed = await Task.filter({ id: task.id });
      if (refreshed[0]) {
        onUpdate(refreshed[0]);
      } else {
        onUpdate({ ...task, event_time: eventTime.toISOString(), next_reminder: eventTime.toISOString() });
      }
      } catch (e) {
        console.error('Error updating event time:', e);
      }
    })();
  };

  const handleComplete = async () => {
    if (!task) return;

    // CRITICAL FIX: Store local date/time, not UTC
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

    // Optimistic update — user sees the task complete instantly
    onUpdate({
      ...task,
      status: 'completed',
      completed_at: localISOString,
      onesignal_notification_ids: []
    });
    onClose();

    try {
      console.log('✅ [COMPLETE] Marking task complete with local time:', localISOString);

      // Cancel all scheduled reminders when task is completed
      if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
        try {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        } catch (error) {
          console.error("Failed to cancel reminders on completion:", error);
        }
      }

      // Update in background
      Task.update(task.id, { 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: [] // Clear notification IDs as reminders are cancelled
      }).catch(error => {
        console.error("Error completing task:", error);
      });

      // Check if task is recurring and create new instance
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
        console.log('🔄 [RECURRING] Creating new instance for pattern:', task.recurrence_pattern);

        const currentUser = await base44.auth.me();
        let nextReminder;

        // If task has a specific reminder time, use that as the base (local time, no UTC shift)
        if (task.next_reminder) {
          const d = new Date(task.next_reminder);
          nextReminder = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
        } else {
          nextReminder = new Date();
        }

        // Calculate next reminder based on recurrence pattern
        switch (task.recurrence_pattern) {
          case 'daily':
            nextReminder.setDate(nextReminder.getDate() + 1);
            break;
          case 'weekly':
            nextReminder.setDate(nextReminder.getDate() + 7);
            break;
          case 'monthly':
            nextReminder.setMonth(nextReminder.getMonth() + 1);
            break;
        }

        // Create new task instance
        const newTask = await Task.create({
          title: task.title,
          description: task.description,
          urgency: task.urgency,
          energy_required: task.energy_required,
          reminder_interval: task.reminder_interval,
          reminder_count: 0,
          next_reminder: nextReminder.toISOString(),
          status: 'active',
          recurrence_pattern: task.recurrence_pattern,
          notification_recipient_email: currentUser.email,
          pictures: task.pictures || [],
          notes: task.notes || ''
        });

        // Schedule reminders for new task if needed
        const intervalMs = {
          '10min': 10 * 60 * 1000,
          '20min': 20 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        if (task.reminder_interval && task.reminder_interval !== 'once' && intervalMs[task.reminder_interval]) {
          try {
            const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
            const { notificationIds } = await scheduleRecurringReminders({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${task.title}\n\nTap to mark as complete!`,
              startTime: nextReminder.toISOString(),
              intervalMs: intervalMs[task.reminder_interval],
              count: 10,
              taskId: newTask.id,
              data: {
                screen: "/TaskNotification",
                taskId: newTask.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });

            if (notificationIds && notificationIds.length > 0) {
              await Task.update(newTask.id, { onesignal_notification_ids: notificationIds });
            }
          } catch (error) {
            console.error("Failed to schedule reminders for recurring task:", error);
          }
        }

        console.log('✅ [RECURRING] New task created:', newTask.id);
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}" and all its sub-tasks?`)) return;

    // Optimistic — close dialog and notify parent immediately
    if (onDelete) {
      onDelete();
    }
    onClose();

    // Cancel notifications + delete in the background
    (async () => {
      try {
        if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        }
        for (const subTask of subTasks) {
          if (subTask.onesignal_notification_ids && subTask.onesignal_notification_ids.length > 0) {
            await cancelScheduledReminder(subTask.onesignal_notification_ids);
          }
          Task.delete(subTask.id).catch(error => console.error("Error deleting subtask:", error));
        }
        Task.delete(task.id).catch(error => console.error("Error deleting task:", error));
      } catch (error) {
        console.error("Error during delete:", error);
      }
    })();
  };

  const completedCount = subTasks.filter(s => s.status === 'completed').length;
  const progress = subTasks.length > 0
    ? (completedCount / subTasks.length) * 100
    : 0;

  if (!task) return null;

  const formatReminderTime = (dateString) => {
    if (!dateString) return null;
    // FIXED: Parse UTC time and display as local
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatReminderDate = (dateString) => {
    if (!dateString) return null;
    // FIXED: Parse UTC time and display as local
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // For multi-day events, show "Aug 1 – Aug 3" instead of just the start.
  const formatEventDateRange = () => {
    if (!task.next_reminder) return null;
    const startStr = formatReminderDate(task.next_reminder);
    if (!task.end_date) return startStr;
    const startDay = new Date(task.next_reminder).toDateString();
    const endDay = new Date(task.end_date).toDateString();
    if (startDay === endDay) return startStr;
    return `${startStr} – ${formatReminderDate(task.end_date)}`;
  };

  const getCurrentReminderTime = (task) => {
    if (!task.next_reminder) return '';
    // FIXED: Parse UTC and display in local time zone
    const date = new Date(task.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getCurrentReminderDate = (task) => {
    if (!task.next_reminder) return '';
    // FIXED: Parse UTC and display in local time zone
    const date = new Date(task.next_reminder);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatReminderInterval = (interval) => {
    const formats = {
      '10min': 'Every 10 minutes',
      '20min': 'Every 20 minutes',
      '30min': 'Every 30 minutes',
      '1hour': 'Every hour',
      '2hours': 'Every 2 hours',
      '4hours': 'Every 4 hours',
      'daily': 'Daily',
      'every_other_day': 'Every other day',
      'once': 'One time'
    };
    return formats[interval] || interval;
  };

  const handlePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPicture(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const updatedPictures = [...taskPictures, file_url];
      setTaskPictures(updatedPictures);
      
      // Update in background without calling onUpdate to avoid reload
      Task.update(task.id, { pictures: updatedPictures }).catch(error => {
        console.error("Error updating task pictures:", error);
      });
    } catch (error) {
      console.error("Error uploading picture:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleRemovePicture = async (pictureUrl) => {
    const updatedPictures = taskPictures.filter(p => p !== pictureUrl);
    setTaskPictures(updatedPictures);
    
    // Update in background without calling onUpdate to avoid reload
    Task.update(task.id, { pictures: updatedPictures }).catch(error => {
      console.error("Error updating task pictures:", error);
    });
  };

  const handleNotesUpdate = async () => {
    // Instant confirmation; the write happens in the background.
    toast({ title: 'Notes saved ✓' });
    Task.update(task.id, { notes: taskNotes }).catch(error => {
      console.error("Error updating task notes:", error);
    });
  };

  // Calendar classification (Event / Task / Birthday). A user-set value on the
  // task overrides the auto-detected kind passed in from the calendar view.
  const currentClassification = task.classification || itemClassification || (task.birthday_person ? 'birthday' : 'task');
  const isEvent = currentClassification === 'event';
  const currentType = getCurrentReminderType(task);
  const dueLabel = isEvent ? 'Event Date' : 'Due Date';

  const handleClassificationChange = async (newClass) => {
    if (!task || newClass === currentClassification) return;
    const updates = { classification: newClass };
    if (newClass === 'birthday') {
      if (!task.birthday_person) updates.birthday_person = task.title;
    } else if (task.birthday_person) {
      updates.birthday_person = null;
    }
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    toast({ title: "Saved ✓", description: newClass === 'event' ? 'Marked as event' : newClass === 'birthday' ? 'Marked as birthday' : 'Marked as task' });
    // Save in the background
    Task.update(task.id, updates).catch(error => {
      console.error("Error updating classification:", error);
    });
  };

  // Switch a task to "Smart Reminders" — the LLM smart-nudge system takes over.
  // Cancels every scheduled notification (recurring + one-time/event schedule)
  // and clears all reminder fields so the task flows to the LLM.
  const handleSetSmartReminders = async () => {
    if (!task) return;
    const updates = {
      reminder_interval: null,
      recurrence_pattern: 'none',
      next_reminder: null,
      event_time: null,
      day_only_task: false,
      onesignal_notification_ids: [],
      reminder_schedule: [],
      classification: 'task',
      birthday_person: null,
    };
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    toast({ title: "Smart Reminders on ✓", description: "AI will decide when to nudge you about this task." });
    // Cancel old reminders + save in the background
    (async () => {
      try {
        const allOldIds = Array.from(new Set([
          ...(task.onesignal_notification_ids || []),
          ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
        ]));
        if (allOldIds.length > 0) {
          await cancelScheduledReminder(allOldIds).catch(e => console.error("Failed to cancel reminders:", e));
        }
        await Task.update(task.id, updates);
      } catch (e) {
        console.error("Error switching to smart reminders:", e);
      }
    })();
  };

  // Choosing "Event" cancels any old notifications, marks the task as an event,
  // and — if a date/time is already set — regenerates the LLM lead-time reminder
  // schedule so the future-notifications list appears immediately.
  const handleSelectEvent = async () => {
    if (!task) return;
    const updates = {
      classification: 'event',
      onesignal_notification_ids: [],
      reminder_schedule: [],
    };
    if (task.birthday_person) updates.birthday_person = null;
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    const eventDate = task.event_time || task.next_reminder;
    if (!eventDate) {
      toast({ title: 'Event saved', description: 'Set the event date & time to generate reminders.' });
    }
    // Cancel old reminders + save + schedule in the background
    (async () => {
      try {
        const currentUser = await base44.auth.me();
        const allOldIds = Array.from(new Set([
          ...(task.onesignal_notification_ids || []),
          ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
        ]));
        if (allOldIds.length > 0) {
          await cancelScheduledReminder(allOldIds).catch(e => console.error(e));
        }
        await Task.update(task.id, updates);

        if (eventDate) {
          try {
            const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
            const multiIds = await scheduleMultiReminders({
              email: currentUser.email,
              title: task.title,
              scheduledDateISO: eventDate,
              taskId: task.id,
              urgency: task.urgency,
              classification: 'event',
            });
            if (multiIds && multiIds.length > 0) {
              await Task.update(task.id, { onesignal_notification_ids: multiIds });
            }
          } catch (e) {
            console.error('Failed to generate event reminders:', e);
          }
          const refreshed = await Task.filter({ id: task.id });
          if (refreshed[0]) onUpdate(refreshed[0]);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  };

  // Back Burner — silence all notifications for this task (or reactivate them).
  // The onTaskUpdate automation cancels/reschedules the actual OneSignal
  // notifications, so the frontend only flips the flag.
  const handleToggleSilenced = async () => {
    if (!task) return;
    const newSilenced = !task.silenced;
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, silenced: newSilenced });
    toast({
      title: newSilenced ? 'On the back burner 🔇' : 'Reminders back on 🔔',
      description: newSilenced
        ? 'No more notifications for this task until you reactivate it.'
        : 'Notifications resumed for this task.',
    });
    // Save in the background
    Task.update(task.id, { silenced: newSilenced }).catch(e => {
      console.error('Error toggling silenced:', e);
    });
  };

  // One entry point for the ReminderTypeSelector — routes each type to the
  // right existing handler so all the cancel/reschedule logic stays in one place.
  const handleChangeReminderType = (type, sub) => {
    if (type === 'smart') return handleSetSmartReminders();
    if (type === 'interval') return handleUpdateField('reminder_interval', sub);
    if (type === 'repeat') return handleUpdateField('recurrence_pattern', sub);
    if (type === 'once') return handleUpdateField('reminder_interval', 'once');
    if (type === 'event') return handleSelectEvent();
    if (type === 'birthday') return handleClassificationChange('birthday');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={`max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
          
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold pt-6 pb-2 ${theme === 'dark' ? 'text-white' : ''}`}>
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
                <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Description</h4>
                <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>{task.description}</p>
              </div>
            )}

            {/* Task Type — the primary control that determines notification behavior.
                Pulled into its own row above the other pills so it stands out. */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Task Type</span>
              <ReminderTypeSelector task={task} theme={theme} onChangeType={handleChangeReminderType} />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Back Burner — silence all notifications for this task */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSilenced}
                className={`gap-1.5 h-8 transition-all active:scale-95 ${
                  task.silenced
                    ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-sm'
                    : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {task.silenced ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {task.silenced ? 'Back Burner 🔇' : 'Back Burner'}
              </Button>

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
                    <button onClick={() => handleUpdateField('urgency', 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium Priority</button>
                    <button onClick={() => handleUpdateField('urgency', 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High Priority</button>
                    <button onClick={() => handleUpdateField('urgency', 'urgent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Urgent</button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Intelligent notification schedule — visible directly, not buried in a popover.
                  Always shown for events so the future-reminder list is visible. */}
              {((task.reminder_schedule && task.reminder_schedule.length > 0) || task.classification === 'event') && (
                <div className="w-full mt-2">
                  <SmartReminderEditor task={task} theme={theme} onUpdate={onUpdate} />
                </div>
              )}

              {/* First-reminder date & time — only for tasks whose reminders
                   are NOT run by the smart schedule. When a Smart Reminder
                   Schedule exists it already shows (and owns) the times, so a
                   separate date/time pill just duplicates it. */}
              {(currentType === 'once' || currentType === 'interval' || currentType === 'repeat') &&
                !(task.reminder_schedule && task.reminder_schedule.length > 0) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.next_reminder ? (
                        <>
                          {isEvent ? formatEventDateRange() : formatReminderDate(task.next_reminder)} • {formatReminderTime(task.next_reminder)}
                        </>
                      ) : (
                        'Add reminder'
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-4 ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
                  }`}>
                    <div className="space-y-3">
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Reminder Date:</label>
                        <input
                          type="date"
                          value={reminderDate}
                          onChange={(e) => { setReminderDate(e.target.value); reminderDateRef.current = e.target.value; }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Reminder Time:</label>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => { setReminderTime(e.target.value); reminderTimeRef.current = e.target.value; }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleUpdateReminderTime(reminderTime, reminderDate)}
                        disabled={!reminderDate || !reminderTime || isSavingReminder}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isSavingReminder ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Date & Time</>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Due date — editable for one-time, interval, and repeat tasks.
                   Events use the Event Date control above instead. */}
              {(currentType === 'once' || currentType === 'interval' || currentType === 'repeat') && (
                task.due_date ? (
                  <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                          ? theme === 'dark' ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'
                          : theme === 'dark' ? 'bg-amber-900 text-amber-300' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <CalendarClock className="w-3 h-3" />
                        {new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                          ? (isEvent ? 'Past event' : 'Overdue')
                          : `${isEvent ? 'Event' : 'Due'} ${formatReminderDate(task.due_date)}`}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{dueLabel}:</label>
                        <input
                          type="date"
                          defaultValue={task.due_date ? task.due_date.split('T')[0] : ''}
                          onChange={(e) => { handleDueDateChange(e.target.value); setDueDatePopoverOpen(false); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <button
                          onClick={() => { handleDueDateChange(null); setDueDatePopoverOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
                        >
                          {isEvent ? 'Remove event date' : 'Remove due date'}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {isEvent ? 'Add Event Date' : 'Add Due Date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{dueLabel}:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) { handleDueDateChange(e.target.value); setDueDatePopoverOpen(false); } }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <p className="text-xs text-gray-500">
                          {isEvent ? 'The date this event takes place.' : 'Reminders continue until this date, then switch to overdue reminders.'}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Start date — only available when the task has a future due
                   date, so the user can say "due Friday, work on it all week."
                   Default is no start date. */}
              {task.due_date && new Date(task.due_date).getTime() > Date.now() && !isEvent && (
                task.start_date ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        theme === 'dark' ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <CalendarClock className="w-3 h-3" />
                        Start {formatReminderDate(task.start_date)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Start Date:</label>
                        <input
                          type="date"
                          defaultValue={task.start_date ? task.start_date.split('T')[0] : ''}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <button
                          onClick={() => handleStartDateChange(null)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
                        >
                          Remove start date
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        Add Start Date
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Start Date:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) handleStartDateChange(e.target.value); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <p className="text-xs text-gray-500">When you'll start working on this before it's due.</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Event date & time — editable for event tasks. Setting it
                   regenerates the lead-time reminder schedule automatically. */}
              {currentType === 'event' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity bg-indigo-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {task.event_time
                        ? `Event ${formatReminderDate(task.event_time)} • ${formatReminderTime(task.event_time)}`
                        : 'Set Event Date & Time'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-4 ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
                  }`}>
                    <div className="space-y-3">
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Event Date:</label>
                        <input
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Event Time:</label>
                        <input
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleUpdateEventTime(eventDate, eventTime)}
                        disabled={!eventDate || !eventTime || isSavingEvent}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isSavingEvent ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Event Time</>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Pictures Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className={`text-sm font-medium flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <ImageIcon className="w-4 h-4" />
                  Pictures
                </label>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePictureUpload}
                    className="hidden"
                    disabled={isUploadingPicture}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploadingPicture}
                    className="cursor-pointer"
                    onClick={(e) => e.currentTarget.previousElementSibling?.click()}
                  >
                    {isUploadingPicture ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Image
                      </>
                    )}
                  </Button>
                </label>
              </div>
              {taskPictures.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {taskPictures.map((pic, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={pic}
                        alt="Task attachment"
                        className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setViewingImage(pic)}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePicture(pic);
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600 transition-colors"
                        title="Delete photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <FileText className="w-4 h-4" />
                Notes
              </label>
              <div className="relative">
                <Textarea
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  className="min-h-[80px] pr-10"
                />
                <button
                  onClick={handleNotesUpdate}
                  title="Save notes"
                  className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isEvent && (
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
                <AddSubTaskCard
                  theme={theme}
                  mode={subtaskInputMode}
                  setMode={setSubtaskInputMode}
                  newSubTask={newSubTask}
                  setNewSubTask={setNewSubTask}
                  onSubmit={handleAddSubTask}
                  onVoice={handleVoiceSubtask}
                  isProcessingVoice={isProcessingVoice}
                  onAIBreakdown={() => {
                    setPreviousSubTasks(subTasks);
                    setHasDecomposedSuccessfully(false);
                    setShowDecomposition(true);
                  }}
                />
              )}

              {subTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Sub-tasks</h4>
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

                  <AddSubTaskCard
                    theme={theme}
                    boxed={false}
                    mode={subtaskInputMode}
                    setMode={setSubtaskInputMode}
                    newSubTask={newSubTask}
                    setNewSubTask={setNewSubTask}
                    onSubmit={handleAddSubTask}
                    onVoice={handleVoiceSubtask}
                    isProcessingVoice={isProcessingVoice}
                  />
                </div>
              )}
            </div>)}

            {progress === 100 && subTasks.length > 0 && !isEvent && (
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

          <DialogFooter className="gap-2 flex-wrap">
            {task.status !== 'completed' && !isEvent && (
              <div className="w-full mb-1">
                <LaunchButtons task={task} theme={theme} />
              </div>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                if (!confirm(`Convert "${task.title}" to a parking lot idea?`)) return;
                
                // Optimistic — close dialog and notify parent immediately
                if (onDelete) {
                  onDelete();
                }
                onClose();

                // Cancel reminders + create idea + delete task in the background
                (async () => {
                  try {
                    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
                      await cancelScheduledReminder(task.onesignal_notification_ids);
                    }
                    await base44.entities.ParkingLotIdea.create({
                      idea: task.title + (task.description ? `\n\n${task.description}` : ''),
                      converted_to_task: false
                    });
                    await base44.entities.Task.delete(task.id);
                  } catch (error) {
                    console.error("Error converting to parking lot:", error);
                  }
                })();
              }}
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              To Parking Lot
            </Button>
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

      <ImageViewer
        imageUrl={viewingImage}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </>
  );
}