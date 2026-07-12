import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Keyboard } from "lucide-react";
import VoiceTaskInput from "../tasks/VoiceTaskInput";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "../utils/reminderScheduler";

export default function QuickAddModal({ isOpen, onClose, theme }) {
  const [mode, setMode] = useState('voice');
  const navigate = useNavigate();

  const handleVoiceInput = async (transcription) => {
    try {
      console.log('🎤 [QUICK ADD] Voice input received:', transcription);
      const user = await base44.auth.me();

      const prompt = `Extract task details from this voice input: "${transcription}"

RULES:
1. Extract the CORE ACTION only
2. If time mentioned (like "at 4 pm", "tomorrow at 8"), extract it
3. If "every X" mentioned, map to reminder_interval
4. Keep title SHORT (2-8 words)

SMART INFERENCE (when user does NOT specify a time, frequency, or date):
Infer the best reminder_interval and urgency from the NATURE of the task:

- PERISHABLE / TIME-SENSITIVE (food, laundry, meds, cooking, pets/plants):
  e.g. "move food to freezer", "move laundry", "take meds", "feed the cat"
  → reminder_interval="2hours", urgency="high"

- HARD DEADLINE / IMPORTANT OBLIGATION (financial, legal, work, appointments):
  e.g. "pay rent", "submit form", "call doctor", "send report"
  → reminder_interval="1hour" (if deadline is today/tomorrow) or "2hours", urgency="high"

- ROUTINE / HABIT (wellness, daily maintenance):
  e.g. "stretch", "take vitamins", "drink water", "meditate"
  → reminder_interval="daily", urgency="low" or "medium"

- General fallback (none of the above):
  → reminder_interval="2hours", urgency="medium"

Return JSON:
{
  "title": "Clean task title",
  "reminder_interval": "10min" | "20min" | "30min" | "1hour" | "2hours" | "daily" | "every_other_day" | "once" | null,
  "reminder_time": "HH:MM" or null,
  "specific_date": "YYYY-MM-DD" or null,
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high"
}`;

      const result = await base44.functions.invoke('extractTaskFromVoice', { prompt });
      const taskData = result?.data?.taskData;

      let nextReminderTime = null;
      
      if (taskData.reminder_time) {
        const [hours, minutes] = taskData.reminder_time.split(':');
        
        if (taskData.specific_date) {
          nextReminderTime = new Date(taskData.specific_date);
          nextReminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
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
          case 'daily':
            nextReminderTime.setDate(nextReminderTime.getDate() + 1);
            break;
          case 'every_other_day':
            nextReminderTime.setDate(nextReminderTime.getDate() + 2);
            break;
        }
      }

      console.log('✅ [QUICK ADD] Creating task with data:', {
        title: taskData.title,
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        reminder_interval: taskData.reminder_interval || null,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null
      });

      const createdTask = await base44.entities.Task.create({
        title: taskData.title,
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        status: 'active',
        reminder_interval: taskData.reminder_interval || null,
        reminder_count: 0,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
        notification_recipient_email: user.email
      });

      console.log('✅ [QUICK ADD] Task created successfully:', createdTask);

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

  return (
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
  );
}