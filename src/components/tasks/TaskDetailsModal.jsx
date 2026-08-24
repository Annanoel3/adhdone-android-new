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
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [taskPictures, setTaskPictures] = useState([]);
  const [taskNotes, setTaskNotes] = useState('');
  const [viewingImage, setViewingImage] = useState(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
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
    const fetchedSubTasks = await Task.filter({ parent_task_id: taskId }, '-created_date');
    setSubTasks(fetchedSubTasks);
    return fetchedSubTasks;
  };

  const handleSubTaskToggle = async (subTask) => {
    const newStatus = subTask.status === 'completed' ? 'active' : 'completed';
    await base44.entities.Task.update(subTask.id, { status: newStatus });
    await fetchSubTasks(task.id);
    
    // Call onUpdate with parent task to trigger refresh
    if (onUpdate) {
      onUpdate(task);
    }
  };

  const handleAddSubTask = async (e) => {
    e.preventDefault();
    if (!newSubTask.trim() || !task) return;

    try {
      const currentUser = await base44.auth.me();
      
      // Split by comma to support multiple subtasks
      const subtaskTitles = newSubTask.split(',').map(s => s.trim()).filter(s => s.length > 0);
      
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

      // Create all subtasks
      for (const title of subtaskTitles) {
        await Task.create({
          title: title,
          parent_task_id: task.id,
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

      setNewSubTask("");
      const updatedSubTasks = await fetchSubTasks(task.id);
      
      // Call onUpdate with the parent task to trigger refresh
      if (onUpdate) {
        onUpdate(task);
      }
    } catch (error) {
      console.error("Error adding subtask:", error);
      alert("Failed to add subtask. Please try again.");
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

      for (const subtaskTitle of response.subtasks || []) {
        await Task.create({
          title: subtaskTitle.trim(),
          parent_task_id: task.id,
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
    await Task.delete(subTaskId);
    await fetchSubTasks(task.id);
    
    // Call onUpdate with parent task to trigger refresh
    if (onUpdate) {
      onUpdate(task);
    }
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
      
      // Await the save so the loading spinner shows and the server has the
      // change before any parent refetch overwrites the optimistic update.
      try {
        await Task.update(task.id, updates);
      } catch (error) {
        console.error(`Error updating ${field}:`, error);
      }

      // Optimistically update parent immediately
      onUpdate({ ...task, ...updates });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateReminderTime = async (selectedTime, selectedDate) => {
    if (!task) return;
    
    setIsUpdating(true);
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

        // Future guard: never schedule a reminder in the past or immediate
        const guardNow = new Date();
        const guardTwoMin = new Date(guardNow.getTime() + 2 * 60 * 1000);
        if (nextReminder <= guardTwoMin) {
          if (interval && interval !== 'once' && intervalMs[interval]) {
            nextReminder = new Date(guardNow.getTime() + intervalMs[interval]);
          } else {
            alert("⚠️ The date and time you picked is in the past.\n\nPlease choose a future date and time, then tap Save again.");
            return;
          }
        }

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

      // Sync local state
      const savedRd = `${nextReminder.getFullYear()}-${String(nextReminder.getMonth()+1).padStart(2,'0')}-${String(nextReminder.getDate()).padStart(2,'0')}`;
      const savedRt = `${String(nextReminder.getHours()).padStart(2,'0')}:${String(nextReminder.getMinutes()).padStart(2,'0')}`;
      setReminderDate(savedRd);
      setReminderTime(savedRt);
      reminderDateRef.current = savedRd;
      reminderTimeRef.current = savedRt;

      onUpdate({ ...task, next_reminder: nextReminder.toISOString(), onesignal_notification_ids: newNotificationIds });
      toast({
        title: "Reminder saved ✓",
        description: `We'll remind you ${nextReminder.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`,
      });
    } finally {
      setIsUpdating(false);
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
    Task.update(task.id, { due_date: dueDateValue }).catch(error => {
      console.error("Error updating due date:", error);
    });
    onUpdate({ ...task, due_date: dueDateValue });
  };

  // Set the actual event date & time for event-classified tasks. Cancels any
  // old lead-time reminders and regenerates a fresh schedule from the new time.
  const handleUpdateEventTime = async (selectedDate, selectedTime) => {
    if (!task || !selectedDate || !selectedTime) return;
    setIsUpdating(true);
    try {
      const [year, month, day] = selectedDate.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = selectedTime.split(':').map(n => parseInt(n, 10));
      const eventTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

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
      toast({ title: 'Event time saved ✓' });
    } catch (e) {
      console.error('Error updating event time:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    if (!task) return;

    setIsUpdating(true);
    try {
      // CRITICAL FIX: Store local date/time, not UTC
      const now = new Date();
      const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

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

      // Optimistically update parent immediately
      onUpdate({ 
        ...task, 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: []
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
      // CRITICAL: Cancel all scheduled notifications before deleting
      if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
        console.log(`🗑️ [DELETE] Canceling ${task.onesignal_notification_ids.length} notifications for task "${task.title}"`);
        await cancelScheduledReminder(task.onesignal_notification_ids);
      }

      // Delete subtasks and their notifications
      for (const subTask of subTasks) {
        if (subTask.onesignal_notification_ids && subTask.onesignal_notification_ids.length > 0) {
          await cancelScheduledReminder(subTask.onesignal_notification_ids);
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
      // Always close the dialog so the user returns to the task list
      onClose();
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
    // Update in background without calling onUpdate to avoid reload
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
    setIsUpdating(true);
    try {
      const updates = { classification: newClass };
      // Keep birthday_person in sync so the Birthday tracker and calendar
      // agree on what's a birthday.
      if (newClass === 'birthday') {
        if (!task.birthday_person) updates.birthday_person = task.title;
      } else if (task.birthday_person) {
        updates.birthday_person = null;
      }
      await Task.update(task.id, updates);
      onUpdate({ ...task, ...updates });
      toast({ title: "Saved ✓", description: newClass === 'event' ? 'Marked as event' : newClass === 'birthday' ? 'Marked as birthday' : 'Marked as task' });
    } catch (error) {
      console.error("Error updating classification:", error);
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  // Switch a task to "Smart Reminders" — the LLM smart-nudge system takes over.
  // Cancels every scheduled notification (recurring + one-time/event schedule)
  // and clears all reminder fields so the task flows to the LLM.
  const handleSetSmartReminders = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      const allOldIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
      ]));
      if (allOldIds.length > 0) {
        try {
          await cancelScheduledReminder(allOldIds);
        } catch (e) {
          console.error("Failed to cancel reminders:", e);
        }
      }
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
      await Task.update(task.id, updates);
      onUpdate({ ...task, ...updates });
      toast({ title: "Smart Reminders on ✓", description: "AI will decide when to nudge you about this task." });
    } catch (e) {
      console.error("Error switching to smart reminders:", e);
    } finally {
      setIsUpdating(false);
    }
  };

  // Choosing "Event" cancels any old notifications, marks the task as an event,
  // and — if a date/time is already set — regenerates the LLM lead-time reminder
  // schedule so the future-notifications list appears immediately.
  const handleSelectEvent = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      const currentUser = await base44.auth.me();
      const allOldIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
      ]));
      if (allOldIds.length > 0) {
        try { await cancelScheduledReminder(allOldIds); } catch (e) { console.error(e); }
      }
      const updates = {
        classification: 'event',
        onesignal_notification_ids: [],
        reminder_schedule: [],
      };
      if (task.birthday_person) updates.birthday_person = null;
      await Task.update(task.id, updates);

      const eventDate = task.event_time || task.next_reminder;
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
      } else {
        onUpdate({ ...task, ...updates });
        toast({ title: 'Event saved', description: 'Set the event date & time to generate reminders.' });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  // Back Burner — silence all notifications for this task (or reactivate them).
  // The onTaskUpdate automation cancels/reschedules the actual OneSignal
  // notifications, so the frontend only flips the flag.
  const handleToggleSilenced = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      const newSilenced = !task.silenced;
      await Task.update(task.id, { silenced: newSilenced });
      onUpdate({ ...task, silenced: newSilenced });
      toast({
        title: newSilenced ? 'On the back burner 🔇' : 'Reminders back on 🔔',
        description: newSilenced
          ? 'No more notifications for this task until you reactivate it.'
          : 'Notifications resumed for this task.',
      });
    } catch (e) {
      console.error('Error toggling silenced:', e);
    } finally {
      setIsUpdating(false);
    }
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
          {isUpdating && (
            <div className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg ${theme === 'dark' ? 'bg-gray-900/80' : 'bg-white/80'}`}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-purple-600 rounded-full animate-spin"></div>
                <p className="text-sm font-medium text-gray-700">Updating...</p>
              </div>
            </div>
          )}
          
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

            <div className="flex flex-wrap gap-2">
              {/* Unified reminder-type selector — replaces the old classification,
                  interval, recurring, and add-reminder pills with one control */}
              <ReminderTypeSelector task={task} theme={theme} onChangeType={handleChangeReminderType} />

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

              {/* First-reminder date & time — shown for one-time, interval, and
                   repeat tasks. Smart reminders and events have their own controls. */}
              {(currentType === 'once' || currentType === 'interval' || currentType === 'repeat') && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.next_reminder ? (
                        <>
                          {isEvent ? formatEventDateRange() : formatReminderDate(task.next_reminder)} • {formatReminderTime(task.next_reminder)}
                        </>
                      ) : (
                        'Set Date & Time'
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
                        disabled={!reminderDate || !reminderTime || isUpdating}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isUpdating ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Date & Time</>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Due date — only for interval reminders (a deadline the reminders count down to) */}
              {currentType === 'interval' && (
                task.due_date ? (
                  <Popover>
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
                          onChange={(e) => handleDueDateChange(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <button
                          onClick={() => handleDueDateChange(null)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
                        >
                          {isEvent ? 'Remove event date' : 'Remove due date'}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover>
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
                          onChange={(e) => { if (e.target.value) handleDueDateChange(e.target.value); }}
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
                        disabled={!eventDate || !eventTime || isUpdating}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isUpdating ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Event Time</>}
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
                      <div className="space-y-2">
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
                        <p className="text-xs text-gray-500">💡 Tip: Separate multiple sub-tasks with commas</p>
                      </div>
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
                      <span className={`px-2 text-gray-500 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>Or</span>
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
                      <div className="space-y-2">
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
                        <p className="text-xs text-gray-500">💡 Tip: Separate multiple sub-tasks with commas</p>
                      </div>
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
                
                setIsUpdating(true);
                try {
                  // Cancel reminders if exist
                  if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
                    await cancelScheduledReminder(task.onesignal_notification_ids);
                  }
                  
                  // Create parking lot idea
                  await base44.entities.ParkingLotIdea.create({
                    idea: task.title + (task.description ? `\n\n${task.description}` : ''),
                    converted_to_task: false
                  });
                  
                  // Delete task
                  await base44.entities.Task.delete(task.id);
                  
                  if (onDelete) {
                    onDelete();
                  }
                  onClose();
                } finally {
                  setIsUpdating(false);
                }
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