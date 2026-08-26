import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Keyboard } from "lucide-react";
import VoiceTaskInput from "../tasks/VoiceTaskInput";
import PriorityPickerDialog from "../tasks/PriorityPickerDialog";
import DatePickerDialog from "../tasks/DatePickerDialog";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { scheduleReminder, scheduleRecurringReminders } from "../utils/reminderScheduler";
import { buildTaskParsePrompt } from "../../base44/shared/taskParsePrompt";

export default function QuickAddModal({ isOpen, onClose, theme }) {
  const [mode, setMode] = useState('voice');
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [pendingPriorityTask, setPendingPriorityTask] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDateTask, setPendingDateTask] = useState(null);
  const navigate = useNavigate();

  const handleVoiceInput = async (transcription) => {
    try {
      console.log('🎤 [QUICK ADD] Voice input received:', transcription);
      const user = await base44.auth.me();

      // Close modal immediately — don't make the user wait for LLM parsing
      onClose();
      navigate(createPageUrl("Home"));

      // Create the task immediately with the raw transcription as the title.
      // The user sees the task card right away — no waiting for LLM parsing.
      const createdTask = await base44.entities.Task.create({
        title: transcription,
        classification: 'task',
        urgency: 'medium',
        energy_required: 'medium',
        status: 'active',
        reminder_interval: null,
        reminder_count: 0,
        notification_recipient_email: user.email
      });
      // Reload the task list to show the new task
      window.dispatchEvent(new CustomEvent('tasks-changed'));

      // Use the shared parse prompt — same one AddTask uses. This ensures
      // Quick Add and full Add Task go through the EXACT same AI decision process.
      // The shared prompt enforces: reminder_interval=null unless the user
      // EXPLICITLY asked for recurring ("every X", "daily", etc.). The smart
      // nudge cron handles when to remind for everything else.
      const prompt = buildTaskParsePrompt(transcription);

      const result = await base44.functions.invoke('parseTask', { prompt });
      const taskData = result?.data?.response;

      if (!taskData) {
        console.error('❌ [QUICK ADD] No parse response from parseTask');
        window.dispatchEvent(new CustomEvent('tasks-changed'));
        return;
      }

      let nextReminderTime = null;

      if (taskData.reminder_interval === 'once' && taskData.target_date) {
        const [sy, sm, sd] = taskData.target_date.split('-').map(n => parseInt(n, 10));
        if (taskData.target_time) {
          const [hours, minutes] = taskData.target_time.split(':');
          nextReminderTime = new Date(sy, sm - 1, sd, parseInt(hours), parseInt(minutes), 0, 0);
        } else {
          nextReminderTime = new Date(sy, sm - 1, sd, 9, 0, 0, 0);
        }
        if (nextReminderTime <= new Date()) {
          nextReminderTime.setDate(nextReminderTime.getDate() + 1);
        }
      } else if (taskData.reminder_interval && taskData.reminder_interval !== 'once') {
        const now = new Date();
        const intervalMs = {
          '10min': 10*60*1000, '20min': 20*60*1000, '30min': 30*60*1000,
          '1hour': 60*60*1000, '2hours': 2*60*60*1000, '4hours': 4*60*60*1000,
          'daily': 24*60*60*1000, 'every_other_day': 2*24*60*60*1000,
        };
        const ms = intervalMs[taskData.reminder_interval];
        if (ms) nextReminderTime = new Date(now.getTime() + ms);
      }

      // Build due_date ISO if the parser set one
      let dueDateISO = null;
      if (taskData.due_date) {
        const [dy, dm, dd] = taskData.due_date.split('-').map(n => parseInt(n, 10));
        if (!isNaN(dy) && !isNaN(dm) && !isNaN(dd)) {
          dueDateISO = new Date(dy, dm - 1, dd, 23, 59, 0, 0).toISOString();
        }
      }

      // Update the task with the LLM-parsed data
      await base44.entities.Task.update(createdTask.id, {
        title: taskData.title,
        classification: taskData.classification || 'task',
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        reminder_interval: taskData.reminder_interval || null,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
        due_date: dueDateISO,
        day_only_task: taskData.day_only_task || false,
      });

      // Only schedule per-task push notifications for explicit recurring tasks.
      // One-time tasks use the multi-reminder scheduler. Smart nudge tasks (null
      // interval) are handled entirely by the cronSmartTaskNudge cron.
      if (nextReminderTime && taskData.reminder_interval && taskData.reminder_interval !== 'once') {
        const intervalMs = {
          '10min': 10*60*1000, '20min': 20*60*1000, '30min': 30*60*1000,
          '1hour': 60*60*1000, '2hours': 2*60*60*1000, '4hours': 4*60*60*1000,
          'daily': 24*60*60*1000, 'every_other_day': 2*24*60*60*1000,
        };
        scheduleRecurringReminders({
          email: user.email,
          title: "Task Reminder 📋",
          body: taskData.title,
          startTime: nextReminderTime.toISOString(),
          intervalMs: intervalMs[taskData.reminder_interval],
          count: 10,
          taskId: createdTask.id,
          data: { screen: "/Tasks", taskId: createdTask.id, urgency: taskData.urgency, type: 'task_reminder' },
          buttons: [
            { id: "snooze_15", text: "Snooze 15 min" },
            { id: "snooze_60", text: "Snooze 1 hour" },
            { id: "complete", text: "✅ Done" }
          ]
        }).then(({ notificationIds, lastScheduledUntil }) => {
          if (notificationIds && notificationIds.length > 0) {
            base44.entities.Task.update(createdTask.id, {
              onesignal_notification_ids: notificationIds,
              ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
            });
          }
        }).catch(error => console.error("Failed to schedule reminders:", error));
      } else if (nextReminderTime && taskData.reminder_interval === 'once') {
        import('../utils/multiReminderScheduler').then(({ scheduleMultiReminders }) => {
          return scheduleMultiReminders({
            email: user.email,
            title: taskData.title,
            scheduledDateISO: nextReminderTime.toISOString(),
            taskId: createdTask.id,
            urgency: taskData.urgency,
            classification: taskData.classification || 'task',
          });
        }).then(multiIds => {
          if (multiIds) {
            base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: multiIds });
          }
        }).catch(error => console.error("Failed to schedule one-time reminders:", error));
      }

      // Reload the task list to show the updated task
      window.dispatchEvent(new CustomEvent('tasks-changed'));
    } catch (error) {
      console.error("❌ [QUICK ADD] Error processing input:", error);
    }
  };

  const handleDateChoice = async (date, time) => {
    if (!pendingDateTask) return;
    const { title, energy_required, urgency, user } = pendingDateTask;
    setShowDatePicker(false);

    try {
      const [year, month, day] = date.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = time.split(':').map(n => parseInt(n, 10));
      const nextReminderTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const now = new Date();
      if (nextReminderTime <= new Date(now.getTime() + 2 * 60 * 1000)) {
        alert('The selected time is in the past or too soon. Please pick a future time.');
        return;
      }

      const createdTask = await base44.entities.Task.create({
        title, urgency, energy_required, status: 'active',
        classification: pendingDateTask.classification || 'task',
        reminder_interval: 'once', reminder_count: 0,
        next_reminder: nextReminderTime.toISOString(),
        notification_recipient_email: user.email
      });

      // Check for multi-reminder category first (appointments, events, payments)
      const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
      const multiIds = await scheduleMultiReminders({
        email: user.email,
        title: createdTask.title,
        scheduledDateISO: nextReminderTime.toISOString(),
        taskId: createdTask.id,
        urgency,
        classification: pendingDateTask.classification || 'task',
      });

      if (multiIds) {
        base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: multiIds });
      } else {
        scheduleReminder({
          email: user.email,
          title: "Task Reminder 📋",
          body: `${createdTask.title}\n\nTap to mark as complete!`,
          sendAtISO: nextReminderTime.toISOString(),
          taskId: createdTask.id,
          data: { screen: "/TaskNotification", taskId: createdTask.id, urgency, type: 'task_reminder' },
          buttons: [
            { id: "snooze_15", text: "Snooze 15 min" },
            { id: "snooze_60", text: "Snooze 1 hour" },
            { id: "complete", text: "✅ Done" }
          ]
        }).then(notificationId => {
          if (notificationId) {
            base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: [notificationId] });
          }
        }).catch(error => console.error("Failed to schedule reminder:", error));
      }

      onClose();
      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("❌ [QUICK ADD] Error creating task with date:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setPendingDateTask(null);
    }
  };

  const handleDateAnyDay = async () => {
    if (!pendingDateTask) return;
    const { title, energy_required, urgency, fallbackInterval, user } = pendingDateTask;
    setShowDatePicker(false);

    try {
      // "Any day" = flexible task with no fixed time. Smart nudge handles
      // when to remind — no hardcoded recurring interval.
      const createdTask = await base44.entities.Task.create({
        title, urgency, energy_required, status: 'active',
        classification: pendingDateTask.classification || 'task',
        reminder_interval: null, // smart nudge — no hardcoded interval
        reminder_count: 0,
        next_reminder: null,
        notification_recipient_email: user.email
      });

      onClose();
      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("❌ [QUICK ADD] Error creating task with any day:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setPendingDateTask(null);
    }
  };

  const handlePriorityChoice = async (priority) => {
    if (!pendingPriorityTask) return;

    const { title, energy_required, user } = pendingPriorityTask;
    setShowPriorityPicker(false);

    try {
      // Priority sets URGENCY ONLY — no recurring interval. The smart nudge
      // cron decides when/how often to remind based on urgency and due date.
      // Hardcoding 2h/4h intervals here was the source of notification fatigue
      // and was supposed to be removed long ago.
      const urgencyMap = {
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      const urgency = urgencyMap[priority] || 'medium';

      const createdTask = await base44.entities.Task.create({
        title,
        urgency,
        energy_required,
        classification: pendingPriorityTask.classification || 'task',
        status: 'active',
        reminder_interval: null, // smart nudge — no hardcoded interval
        reminder_count: 0,
        next_reminder: null,
        notification_recipient_email: user.email
      });

      onClose();
      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("❌ [QUICK ADD] Error creating task with priority:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setPendingPriorityTask(null);
    }
  };

  return (
    <>
    <DatePickerDialog
      isOpen={showDatePicker}
      onClose={() => { setShowDatePicker(false); setPendingDateTask(null); }}
      onSelect={handleDateChoice}
      onAnyDay={handleDateAnyDay}
      taskTitle={pendingDateTask?.title}
      initialDate={pendingDateTask?.initialDate}
      initialTime={pendingDateTask?.initialTime}
    />
    <PriorityPickerDialog
      isOpen={showPriorityPicker}
      onClose={() => {
        setShowPriorityPicker(false);
        setPendingPriorityTask(null);
      }}
      onSelect={handlePriorityChoice}
    />
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-6 space-y-6">
          <div className="text-center">
            <h3 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              What's on your mind?
            </h3>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Tap the mic and speak your task or idea
            </p>
          </div>

          {mode === 'voice' ? (
            <div className="space-y-4">
              <VoiceTaskInput
                onTranscription={handleVoiceInput}
                theme={theme}
                inline={false}
              />
              <Button
                variant="ghost"
                onClick={() => setMode('text')}
                className="w-full flex items-center justify-center gap-2 text-sm"
              >
                <Keyboard className="w-4 h-4" />
                Or type instead
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={() => navigate(createPageUrl("AddTask"))}
                className={`w-full ${
                  theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : theme === 'dark'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'
                }`}
              >
                Add Task
              </Button>
              <Button
                onClick={() => navigate(createPageUrl("ParkingLot"))}
                className={`w-full ${
                  theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                Save Idea
              </Button>
              <Button
                variant="ghost"
                onClick={() => setMode('voice')}
                className="w-full flex items-center justify-center gap-2 text-sm"
              >
                <Mic className="w-4 h-4" />
                Or use voice
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}