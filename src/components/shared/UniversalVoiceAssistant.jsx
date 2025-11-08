import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Mic, Square, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Task } from "@/entities/Task";
import { ParkingLotIdea } from "@/entities/ParkingLotIdea";
import { User } from "@/entities/User";
import { scheduleReminder } from "../utils/reminderScheduler";

export default function UniversalVoiceAssistant({ theme, currentPageName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setFeedbackMessage("");
    };

    window.addEventListener('open-voice-assistant', handleOpen);
    return () => window.removeEventListener('open-voice-assistant', handleOpen);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size === 0) {
          setIsRecording(false);
          return;
        }

        setIsRecording(false);
        await handleTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  const handleTranscription = async (audioBlob) => {
    setIsProcessing(true);
    setProcessingMessage("Transcribing...");

    try {
      // Fix: Pass file directly, not wrapped in object
      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioBlob
      });

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio');
      }

      const response = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      if (response?.data?.success && response?.data?.transcription) {
        await processVoiceCommand(response.data.transcription);
      } else {
        throw new Error('Transcription failed');
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setFeedbackMessage("❌ Failed to process voice");
      setIsProcessing(false);
    }
  };

  const processVoiceCommand = async (command) => {
    const lowerCommand = command.toLowerCase();

    // Navigation commands
    if (lowerCommand.includes('go to') || lowerCommand.includes('open') || lowerCommand.includes('show me')) {
      const pages = {
        'home': 'Home',
        'tasks': 'Tasks',
        'task': 'Tasks',
        'focus': 'FocusTimer',
        'timer': 'FocusTimer',
        'support': 'SupportSpace',
        'parking lot': 'ParkingLot',
        'ideas': 'ParkingLot',
        'progress': 'Progress',
        'insights': 'Insights',
        'accountability': 'Accountability',
        'partners': 'Accountability',
        'leaderboard': 'Leaderboard',
        'profile': 'Profile',
        'settings': 'ProfileSettings'
      };

      for (const [keyword, page] of Object.entries(pages)) {
        if (lowerCommand.includes(keyword)) {
          setFeedbackMessage(`✅ Opening ${keyword}...`);
          setIsProcessing(false);
          setTimeout(() => {
            setIsOpen(false);
            navigate(createPageUrl(page));
          }, 1000);
          return;
        }
      }
    }

    // Task creation
    if (lowerCommand.includes('remind me') ||
        lowerCommand.includes('create a task') ||
        lowerCommand.includes('add a task') ||
        lowerCommand.includes('make a task') ||
        lowerCommand.includes('new task')) {

      setIsProcessing(true);
      setProcessingMessage("Creating your task...");

      try {
        const user = await User.me();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const prompt = `Extract task details from: "${command}"

Current context:
- Current time: ${now.toLocaleTimeString()}
- Today: ${today.toISOString().split('T')[0]}
- Tomorrow: ${tomorrow.toISOString().split('T')[0]}

CRITICAL PARSING RULES:

1. RELATIVE TIME ("in X minutes/hours"):
   - "in 5 minutes", "in 10 minutes" → Calculate exact future time, set reminder_interval to "once"
   - "in 1 hour", "in 2 hours" → Calculate exact future time, set reminder_interval to "once"
   - These are ONE-TIME reminders at a future point

2. RECURRING TIME ("every X"):
   - "every 30 minutes" → reminder_interval: "30min", no specific time
   - "every 2 hours" → reminder_interval: "2hours", no specific time
   - "every day" → reminder_interval: "daily"

3. SPECIFIC TIME:
   - "at 6 pm tomorrow" → reminder_time: "18:00", specific_date: tomorrow, reminder_interval: "once"
   - "at 3:30" → reminder_time: "15:30", reminder_interval: "once"

4. TASK TITLE:
   - Remove "remind me to/in/at", "every", time phrases
   - Keep only the core action (2-8 words)

Examples:
"Remind me in 5 minutes to call mom" →
  title: "Call mom"
  relative_minutes: 5
  reminder_interval: "once"
  reminder_time: null
  specific_date: null

"Remind me every 30 minutes to stretch" →
  title: "Stretch"
  relative_minutes: null
  reminder_interval: "30min"
  reminder_time: null
  specific_date: null

"Remind me at 6 pm tomorrow to pick up package" →
  title: "Pick up package"
  relative_minutes: null
  reminder_interval: "once"
  reminder_time: "18:00"
  specific_date: "${tomorrow.toISOString().split('T')[0]}"

Return JSON:
{
  "title": "Task title (2-8 words)",
  "relative_minutes": number or null (for "in X minutes/hours" - convert hours to minutes),
  "reminder_interval": "10min" | "20min" | "30min" | "1hour" | "2hours" | "daily" | "every_other_day" | "once" | null,
  "reminder_time": "HH:MM" or null,
  "specific_date": "YYYY-MM-DD" or null,
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high"
}`;

        const taskData = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              relative_minutes: { type: "number" },
              reminder_interval: { type: "string" },
              reminder_time: { type: "string" },
              specific_date: { type: "string" },
              urgency: { type: "string" },
              energy_required: { type: "string" }
            }
          }
        });

        let nextReminderTime = null;

        // Handle relative time (in X minutes/hours)
        if (taskData.relative_minutes && taskData.relative_minutes > 0) {
          nextReminderTime = new Date(now.getTime() + taskData.relative_minutes * 60 * 1000);
          console.log(`🕐 [VOICE TASK] Relative time: ${taskData.relative_minutes} minutes from now = ${nextReminderTime.toLocaleString()}`);
        }
        // Handle specific date + time
        else if (taskData.reminder_time) {
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

          console.log(`🕐 [VOICE TASK] Setting reminder for ${nextReminderTime.toLocaleString()}`);
        }
        // Handle recurring reminders without specific time
        else if (taskData.reminder_interval && taskData.reminder_interval !== 'once') {
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

        const createdTask = await Task.create({
          title: taskData.title,
          urgency: taskData.urgency || 'medium',
          energy_required: taskData.energy_required || 'medium',
          status: 'active',
          reminder_interval: taskData.reminder_interval || null,
          reminder_count: 0,
          next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null
        });

        if (nextReminderTime) {
          try {
            await scheduleReminder({
              email: user.email,
              title: "Task Reminder 📋",
              body: createdTask.title,
              sendAtISO: nextReminderTime.toISOString(),
              taskId: createdTask.id,
              data: {
                screen: "/Tasks",
                taskId: createdTask.id,
                urgency: createdTask.urgency,
                type: 'task_reminder'
              }
            });
            console.log(`✅ [VOICE TASK] Scheduled reminder for "${createdTask.title}" at ${nextReminderTime.toLocaleString()}`);
          } catch (error) {
            console.error("Failed to schedule reminder:", error);
          }
        }

        setFeedbackMessage(`✅ Created: "${taskData.title}"`);
        setIsProcessing(false);

        setTimeout(() => {
          window.location.reload();
        }, 1500);

        return;
      } catch (error) {
        console.error("Error creating task:", error);
        setFeedbackMessage("❌ Failed to create task");
        setIsProcessing(false);
        return;
      }
    }

    // Parking lot idea
    if (lowerCommand.includes('save this idea') ||
        lowerCommand.includes('parking lot') ||
        lowerCommand.includes('remember this')) {

      setIsProcessing(true);
      setProcessingMessage("Saving idea...");

      try {
        const ideaText = command.replace(/save this idea|parking lot|remember this/gi, '').trim();

        await ParkingLotIdea.create({
          idea: ideaText,
          converted_to_task: false
        });

        setFeedbackMessage("✅ Idea saved to parking lot!");
        setIsProcessing(false);

        setTimeout(() => {
          setIsOpen(false);
          navigate(createPageUrl("ParkingLot"));
        }, 1500);

        return;
      } catch (error) {
        console.error("Error saving idea:", error);
        setFeedbackMessage("❌ Failed to save idea");
        setIsProcessing(false);
        return;
      }
    }

    // If nothing matched
    setFeedbackMessage("❓ I didn't quite catch that. Try:\n• 'Remind me to...'\n• 'Go to tasks'\n• 'Save this idea...'");
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (isRecording) {
      stopRecording();
    }
    setIsOpen(false);
    setFeedbackMessage("");
    setProcessingMessage("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-md ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="flex flex-col items-center justify-center p-6 space-y-6">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClose}
            className="absolute top-4 right-4"
          >
            <X className="w-5 h-5" />
          </Button>

          <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
            isRecording
              ? 'bg-red-500 animate-pulse'
              : isProcessing
                ? 'bg-blue-500'
                : theme === 'minimalist'
                  ? 'bg-purple-600'
                  : theme === 'dark'
                    ? 'bg-purple-600'
                    : 'bg-gradient-to-br from-purple-600 to-pink-600'
          }`}>
            {isProcessing ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : isRecording ? (
              <Mic className="w-12 h-12 text-white animate-pulse" />
            ) : (
              <Mic className="w-12 h-12 text-white" />
            )}
          </div>

          <div className="text-center">
            <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {isProcessing
                ? processingMessage
                : isRecording
                  ? "Listening..."
                  : "Voice Assistant"}
            </h3>
            {feedbackMessage ? (
              <p className={`text-sm whitespace-pre-line ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                {feedbackMessage}
              </p>
            ) : (
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {isRecording
                  ? "Tap to stop recording"
                  : "Tap to start speaking"}
              </p>
            )}
          </div>

          {!isProcessing && (
            <Button
              size="lg"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-full ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700'
                  : theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-5 h-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Start Recording
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}