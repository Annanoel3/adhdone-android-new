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

      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
      const endOfThisWeek = new Date(now);
      const daysUntilSunday = now.getDay() === 0 ? 0 : 7 - now.getDay();
      endOfThisWeek.setDate(now.getDate() + daysUntilSunday);
      const endOfThisWeekISO = `${endOfThisWeek.getFullYear()}-${String(endOfThisWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfThisWeek.getDate()).padStart(2, '0')}`;
      const endOfNextWeek = new Date(endOfThisWeek);
      endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);
      const endOfNextWeekISO = `${endOfNextWeek.getFullYear()}-${String(endOfNextWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfNextWeek.getDate()).padStart(2, '0')}`;

      const prompt = `Extract task details from this voice input: "${transcription}"

TODAY IS: ${todayISO} (YYYY-MM-DD) — ${dayOfWeek}
END OF THIS WEEK (Sunday): ${endOfThisWeekISO}
END OF NEXT WEEK (Sunday): ${endOfNextWeekISO}

RULES:
1. Extract the CORE ACTION only
2. If time mentioned (like "at 4 pm", "tomorrow at 8"), extract it
3. If "every X" mentioned, map to reminder_interval
4. Keep title SHORT (2-8 words)
5. CRITICAL: NEVER infer, guess, or hallucinate a reminder_time. Only set reminder_time when the user EXPLICITLY states a time (e.g., "at 5pm", "at 3:30", "by noon"). If the user did not mention a specific time, set reminder_time=null. Do not use domain knowledge to guess times (e.g., don't assume daycare pickup is 5pm, don't assume work starts at 9am).

RELATIVE DEADLINES / DUE DATES (CRITICAL — commonly missed):
If the user mentions a relative deadline or time boundary, you MUST set due_date to the calculated date. These are DEADLINES (the task must be done by then), not one-time events. The task is still RECURRING — keep reminding until done or the due date passes.
- "by Friday" / "by [day of week]" → due_date = next occurrence of that day
- "before the end of this week" / "end of the week" / "this week" / "by the end of the week" → due_date = ${endOfThisWeekISO}
- "next week" / "by next week" / "end of next week" → due_date = ${endOfNextWeekISO}
- "by tomorrow" → due_date = tomorrow
- "by [date]" / "before [date]" → due_date = that date
When a due_date is set for a relative deadline:
- Keep reminder_interval as RECURRING (e.g., "2hours", "4hours") — do NOT use "once".
- Do NOT set needs_date_pick — the deadline was already specified.
- Set is_flexible=false (a deadline was mentioned).

SMART INFERENCE (when user does NOT specify a time, frequency, or date):
Infer the best reminder_interval and urgency from the NATURE of the task:

- PERISHABLE / TIME-SENSITIVE (food, laundry, meds, cooking, pets/plants):
  e.g. "move food to freezer", "move laundry", "take meds", "feed the cat"
  → reminder_interval="2hours", urgency="high"
  → CRITICAL: These are RECURRING, not one-time. Set needs_date_pick=false.
    They must start recurring reminders immediately — never show the date picker.
    "move food to the freezer" → reminder_interval="2hours", urgency="high", needs_date_pick=false

- HARD DEADLINE / IMPORTANT OBLIGATION (financial, legal, work, appointments):
  e.g. "pay rent", "submit form", "call doctor", "send report"
  → reminder_interval="1hour" (if deadline is today/tomorrow) or "2hours", urgency="high"

- "TODAY" OVERRIDE: if the user said "today" (e.g., "clean the dishes today", "do laundry today"), the task needs doing TODAY — use reminder_interval="2hours" (NOT "daily"), even for chores. ALSO set due_date = today's date (YYYY-MM-DD) so it becomes overdue the next day if unfinished. Do NOT set due_date for one-time events.
- ROUTINE / HABIT (wellness, daily maintenance):
  e.g. "stretch", "take vitamins", "drink water", "meditate"
  → reminder_interval="daily", urgency="low" or "medium" (ONLY when the user did NOT say "today")

- GENERAL ACTIONABLE TASKS (not perishable, not a hard deadline, not a routine/habit):
  Tasks that need to get done but have no specific deadline or schedule.
  Examples: "post the Subaru parts on Marketplace", "sell the old laptop", "fix the leaky faucet",
  "organize the garage", "research vacuum cleaners", "list items on eBay", "clean the car",
  "Amazon returns", "drop off donation"
  - These are RECURRING — remind until done. Do NOT ask for a date.
  - ALWAYS infer urgency and reminder_interval yourself based on the task's nature:
    * Real consequences if delayed (deadline today, someone waiting, time-sensitive) → urgency="high", reminder_interval="2hours"
    * Important but flexible — no deadline pressure (selling items, errands, projects, organizing) → urgency="medium", reminder_interval="4hours"
    * Low-stakes, nice-to-have, no rush → urgency="low", reminder_interval="daily"
    * When in doubt, default to medium.
  - Set priority_uninferrable=false, is_flexible=true

PRIORITY UNINFERRABLE (ABSOLUTE LAST RESORT — almost never use):
Only set priority_uninferrable=true if the task is SO VAGUE that you genuinely cannot
determine any reasonable urgency level. This should be extremely rare — almost every task
has enough context to infer at least a medium priority. When in doubt, default to
urgency="medium", reminder_interval="4hours" rather than asking the user.

If the task DOES fit a SMART INFERENCE category, or has a specific time/date:
- Set priority_uninferrable=false
- Set is_flexible=false if a specific time/date/deadline is mentioned
- Set is_flexible=true if no specific time/date is mentioned but the task fits an inference category

CLASSIFICATION (Event vs Task — CRITICAL):
Determine whether this is a TASK, EVENT, or BIRTHDAY:
- EVENT: A scheduled occurrence the user attends or goes to at a specific time/place.
  Keywords: "go to", "attend", "visit", "watch", "see" + a named happening.
  Examples: "go to the Import Expo car show", "attend the wedding", "see the concert",
  car shows, expos, festivals, parties, meetings, appointments, classes, sports games, travel.
  → classification="event"
- TASK: An actionable to-do that needs doing — paying bills, chores, errands, selling,
  cleaning, organizing, calling, researching, cooking, fixing. Something you DO and complete.
  → classification="task"
- BIRTHDAY: Only when explicitly about someone's birthday.
  → classification="birthday"
When in doubt: "Is the user going somewhere / attending something?" → event.
"Is the user doing a thing that needs doing?" → task. Default to "task" if unsure.

NEEDS DATE PICK (VERY RESTRICTIVE — only for scheduled events):
ONLY set needs_date_pick=true for tasks tied to a SPECIFIC calendar date/event that the user
explicitly referenced but didn't give a time for:
- Appointments: "dentist tomorrow", "doctor on Friday", "therapy at 12pm"
- Events: "concert on the 28th", "wedding Saturday", "Martin's party on the 30th"
- Scheduled activities: "make lunch tomorrow", "pick up cake Tuesday"

NEVER use needs_date_pick for:
- General actionable tasks (selling, posting, errands, chores, projects) → infer urgency and set recurring reminder_interval
- PERISHABLE/TIME-SENSITIVE tasks → recurring (reminder_interval set)
- HARD DEADLINE tasks → recurring (reminder_interval set)
- Routine/habit tasks → recurring (reminder_interval="daily")

If needs_date_pick=true:
- Still provide reminder_interval as a fallback (used if user picks "any day")
- Do NOT set reminder_time or specific_date — let the user pick

Return JSON:
{
  "title": "Clean task title",
  "classification": "task" | "event" | "birthday",
  "reminder_interval": "10min" | "20min" | "30min" | "1hour" | "2hours" | "4hours" | "daily" | "every_other_day" | "once" | null,
  "reminder_time": "HH:MM" or null,
  "specific_date": "YYYY-MM-DD" or null,
  "due_date": "YYYY-MM-DD or null — set when the user mentions a DEADLINE (e.g., 'by Friday', 'end of the week', 'by tomorrow', 'by the 15th', 'today' tasks). For 'today' tasks, set due_date=today. For relative deadline phrases, use the calculated date from the RELATIVE DEADLINES rules above.",
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high",
  "priority_uninferrable": false,
  "is_flexible": false,
  "needs_date_pick": false
}`;

      const result = await base44.functions.invoke('extractTaskFromVoice', { prompt });
      const taskData = result?.data?.taskData;

      // If priority can't be inferred and task is flexible, ask the user
      if (taskData.priority_uninferrable && taskData.is_flexible) {
        setPendingPriorityTask({
          title: taskData.title,
          energy_required: taskData.energy_required || 'medium',
          classification: taskData.classification || 'task',
          user
        });
        setShowPriorityPicker(true);
        return;
      }

      // If the task is one-time but no date/time was given, ask the user
      if (taskData.needs_date_pick || (taskData.specific_date && !taskData.reminder_time)) {
        setPendingDateTask({
          title: taskData.title,
          energy_required: taskData.energy_required || 'medium',
          urgency: taskData.urgency || 'medium',
          fallbackInterval: taskData.reminder_interval || '2hours',
          initialDate: taskData.specific_date || null,
          classification: taskData.classification || 'task',
          user
        });
        setShowDatePicker(true);
        return;
      }

      let nextReminderTime = null;
      
      if (taskData.reminder_time) {
        const [hours, minutes] = taskData.reminder_time.split(':');
        
        if (taskData.specific_date) {
          const [sy, sm, sd] = taskData.specific_date.split('-').map(n => parseInt(n, 10));
          nextReminderTime = new Date(sy, sm - 1, sd, parseInt(hours), parseInt(minutes), 0, 0);
        } else {
          nextReminderTime = new Date();
          nextReminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          
          if (nextReminderTime <= new Date()) {
            nextReminderTime.setDate(nextReminderTime.getDate() + 1);
          }
        }
      } else if (taskData.reminder_interval && taskData.reminder_interval !== 'once') {
        const now = new Date();
        nextReminderTime = new Date(now.getTime());
        
        switch (taskData.reminder_interval) {
          case '10min':
            nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 10);
            break;
          case '20min':
            nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 20);
            break;
          case '30min':
            nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 30);
            break;
          case '1hour':
            nextReminderTime.setHours(nextReminderTime.getHours() + 1);
            break;
          case '2hours':
            nextReminderTime.setHours(nextReminderTime.getHours() + 2);
            break;
          case '4hours':
            nextReminderTime.setHours(nextReminderTime.getHours() + 4);
            break;
          case 'daily':
            nextReminderTime.setDate(nextReminderTime.getDate() + 1);
            break;
          case 'every_other_day':
            nextReminderTime.setDate(nextReminderTime.getDate() + 2);
            break;
        }
      }

      // For "today" recurring tasks, set due_date = end of today so the task becomes
      // overdue the next day if it isn't finished.
      let dueDateISO = null;
      if (taskData.due_date && taskData.reminder_interval && taskData.reminder_interval !== 'once') {
        const [dy, dm, dd] = taskData.due_date.split('-').map(n => parseInt(n, 10));
        if (!isNaN(dy) && !isNaN(dm) && !isNaN(dd)) {
          dueDateISO = new Date(dy, dm - 1, dd, 23, 59, 0, 0).toISOString();
        }
      }

      console.log('✅ [QUICK ADD] Creating task with data:', {
        title: taskData.title,
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        reminder_interval: taskData.reminder_interval || null,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
        due_date: dueDateISO
      });

      const createdTask = await base44.entities.Task.create({
        title: taskData.title,
        classification: taskData.classification || 'task',
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        status: 'active',
        reminder_interval: taskData.reminder_interval || null,
        reminder_count: 0,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
        due_date: dueDateISO,
        notification_recipient_email: user.email
      });

      console.log('✅ [QUICK ADD] Task created successfully:', createdTask);

      // Future guard: never schedule a reminder in the past or immediate
      if (nextReminderTime) {
        const now = new Date();
        const twoMinFromNow = new Date(now.getTime() + 2 * 60 * 1000);
        if (nextReminderTime <= twoMinFromNow) {
          if (taskData.reminder_interval && taskData.reminder_interval !== 'once') {
            const guardMs = {
              '10min': 10*60*1000, '20min': 20*60*1000, '30min': 30*60*1000,
              '1hour': 60*60*1000, '2hours': 2*60*60*1000, '4hours': 4*60*60*1000,
              'daily': 24*60*60*1000, 'every_other_day': 2*24*60*60*1000,
            };
            const ms = guardMs[taskData.reminder_interval];
            if (ms) nextReminderTime = new Date(now.getTime() + ms);
            else nextReminderTime = null;
          } else {
            nextReminderTime = null;
          }
        }
      }

      // Schedule reminder in background (don't await)
      if (nextReminderTime && taskData.reminder_interval !== 'once') {
        scheduleReminder({
          email: user.email,
          title: "Task Reminder 📋",
          body: taskData.title,
          sendAtISO: nextReminderTime.toISOString(),
          taskId: createdTask.id,
          data: {
            screen: "/Tasks",
            taskId: createdTask.id,
            urgency: taskData.urgency,
            type: 'task_reminder'
          }
        }).catch(error => {
          console.error("Failed to schedule reminder:", error);
        });
      }

      onClose();
      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("❌ [QUICK ADD] Error processing input:", error);
      alert("Failed to process your input. Please try again.");
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
      const intervalMs = {
        '10min': 10*60*1000, '20min': 20*60*1000, '30min': 30*60*1000,
        '1hour': 60*60*1000, '2hours': 2*60*60*1000, '4hours': 4*60*60*1000,
        'daily': 24*60*60*1000, 'every_other_day': 2*24*60*60*1000,
      };
      const interval = fallbackInterval || '2hours';
      const ms = intervalMs[interval] || intervalMs['2hours'];
      const now = new Date();
      const nextReminderTime = new Date(now.getTime() + ms);

      const createdTask = await base44.entities.Task.create({
        title, urgency, energy_required, status: 'active',
        classification: pendingDateTask.classification || 'task',
        reminder_interval: interval, reminder_count: 0,
        next_reminder: nextReminderTime.toISOString(),
        notification_recipient_email: user.email
      });

      scheduleRecurringReminders({
        email: user.email,
        title: "Task Reminder 📋",
        body: `${createdTask.title}\n\nTap to mark as complete!`,
        startTime: nextReminderTime.toISOString(),
        intervalMs: ms, count: 10, taskId: createdTask.id,
        data: { screen: "/TaskNotification", taskId: createdTask.id, urgency, type: 'task_reminder' },
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
      const priorityMap = {
        high: { interval: '2hours', urgency: 'high', intervalMs: 2 * 60 * 60 * 1000 },
        medium: { interval: '4hours', urgency: 'medium', intervalMs: 4 * 60 * 60 * 1000 },
        low: { interval: 'daily', urgency: 'low', intervalMs: 24 * 60 * 60 * 1000 },
      };

      const { interval, urgency, intervalMs } = priorityMap[priority];
      const now = new Date();
      const nextReminderTime = new Date(now.getTime() + intervalMs);

      const createdTask = await base44.entities.Task.create({
        title,
        urgency,
        energy_required,
        classification: pendingPriorityTask.classification || 'task',
        status: 'active',
        reminder_interval: interval,
        reminder_count: 0,
        next_reminder: nextReminderTime.toISOString(),
        notification_recipient_email: user.email
      });

      scheduleRecurringReminders({
        email: user.email,
        title: "Task Reminder 📋",
        body: `${createdTask.title}\n\nTap to mark as complete!`,
        startTime: nextReminderTime.toISOString(),
        intervalMs,
        count: 10,
        taskId: createdTask.id,
        data: {
          screen: "/TaskNotification",
          taskId: createdTask.id,
          urgency,
          type: 'task_reminder'
        },
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
      }).catch(error => {
        console.error("Failed to schedule reminders:", error);
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