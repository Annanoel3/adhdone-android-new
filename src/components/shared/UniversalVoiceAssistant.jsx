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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg;codecs=opus';
      }

      const recorder = new MediaRecorder(stream, { 
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
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
          setFeedbackMessage("❌ No audio recorded");
          return;
        }

        await handleTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      setFeedbackMessage("❌ Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (audioBlob) => {
    setIsProcessing(true);
    setProcessingMessage("Transcribing...");

    try {
      // Step 1: Upload the audio file
      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioBlob
      });

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio file');
      }

      // Step 2: Transcribe using the file URL
      const response = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      if (response?.success && response?.transcription) {
        await processVoiceCommand(response.transcription);
      } else {
        setFeedbackMessage("❌ Transcription failed");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setFeedbackMessage("❌ Transcription failed");
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

        const prompt = `Extract task details from this voice command. The user said: "${command}"

CRITICAL RULES:
1. Extract the CORE ACTION only - remove "remind me", "create a task", etc.
2. If a specific time is mentioned (like "at 4 pm tomorrow", "at 8 am", "at 3:30"), extract it
3. If "tomorrow" is mentioned with a time, calculate tomorrow's date
4. If "every X" is mentioned (every day, every 2 hours, etc.), map to reminder_interval
5. Keep the task title SHORT and ACTION-FOCUSED (2-8 words max)

Examples:
"Remind me to call mom at 3 pm tomorrow" → 
  title: "Call mom"
  reminder_time: "15:00" (3 PM)
  specific_date: tomorrow's date

"Remind me to remind my husband to bring his laptop at 4 pm tomorrow" →
  title: "Remind husband to bring laptop"
  reminder_time: "16:00" (4 PM)
  specific_date: tomorrow's date

"Make a task to finish the report every day at 9 am" →
  title: "Finish report"
  reminder_time: "09:00"
  reminder_interval: "daily"

"Add a task for grocery shopping" →
  title: "Grocery shopping"
  (no reminder)

Return JSON with this structure:
{
  "title": "Clean task title (2-8 words)",
  "reminder_interval": "10min" | "20min" | "30min" | "1hour" | "2hours" | "daily" | "every_other_day" | "once" | null,
  "reminder_time": "HH:MM" (24-hour format) or null,
  "specific_date": "YYYY-MM-DD" or null (if "tomorrow" or specific date mentioned),
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high"
}`;

        const taskData = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              reminder_interval: { type: "string" },
              reminder_time: { type: "string" },
              specific_date: { type: "string" },
              urgency: { type: "string" },
              energy_required: { type: "string" }
            }
          }
        });

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

        const createdTask = await Task.create({
          title: taskData.title,
          urgency: taskData.urgency || 'medium',
          energy_required: taskData.energy_required || 'medium',
          status: 'active',
          reminder_interval: taskData.reminder_interval || null,
          reminder_count: 0,
          next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null
        });

        if (nextReminderTime && taskData.reminder_interval !== 'once') {
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