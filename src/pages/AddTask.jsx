
import React, { useState } from "react";
import { Task } from "@/entities/Task";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Mic } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } => "framer-motion";
import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "../components/utils/reminderScheduler";

export default function AddTask() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [isSaving, setIsSaving] = useState(false);
  const [inputMode, setInputMode] = useState('voice');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const startVoiceRecording = async () => {
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
          return;
        }

        await handleVoiceTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Could not access microphone");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceTranscription = async (audioBlob) => {
    setIsProcessingVoice(true);

    try {
      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioBlob
      });

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio file');
      }

      const response = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      if (response?.success && response?.transcription) {
        const transcription = response.transcription;
        
        // Parse with comprehensive reminder logic
        const prompt = `Parse this voice input and extract tasks with COMPLETE details. Return as JSON array.

INPUT: "${transcription}"

CRITICAL: Extract ALL reminder information:
- Specific times (e.g., "at 3pm", "tomorrow at 6pm")
- Relative times (e.g., "in 30 minutes", "in 2 hours")
- Events (e.g., "30 minutes before meeting", "before dinner")
- Recurring (e.g., "every day", "every 2 hours")

Return JSON:
{
  "tasks": [
    {
      "title": "clean task title",
      "reminder_type": "specific_time" | "relative" | "before_event" | "recurring" | "none",
      "reminder_value": "ISO timestamp or interval like '2hours'",
      "event_description": "optional event description for before_event type",
      "urgency": "low" | "medium" | "high" | "urgent",
      "energy_required": "low" | "medium" | "high"
    }
  ]
}`;

        const taskData = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    reminder_type: { type: "string" },
                    reminder_value: { type: "string" },
                    event_description: { type: "string" },
                    urgency: { type: "string" },
                    energy_required: { type: "string" }
                  }
                }
              }
            }
          }
        });

        // Process and immediately save tasks
        const currentUser = await User.me();
        for (const t of (taskData.tasks || [])) {
          let nextReminderTime = null;
          let reminderInterval = null;

          if (t.reminder_type === 'specific_time' && t.reminder_value) {
            nextReminderTime = new Date(t.reminder_value);
            reminderInterval = 'once';
          } else if (t.reminder_type === 'relative' && t.reminder_value) {
            const now = new Date();
            nextReminderTime = new Date(now.getTime());
            
            if (t.reminder_value.includes('minutes')) {
              const mins = parseInt(t.reminder_value);
              nextReminderTime.setMinutes(nextReminderTime.getMinutes() + mins);
              reminderInterval = 'once';
            } else if (t.reminder_value.includes('hours')) {
              const hrs = parseInt(t.reminder_value);
              nextReminderTime.setHours(nextReminderTime.getHours() + hrs);
              reminderInterval = 'once';
            }
          } else if (t.reminder_type === 'recurring') {
            reminderInterval = t.reminder_value || '2hours';
            const now = new Date();
            nextReminderTime = new Date(now.getTime());
            
            switch (reminderInterval) {
              case '2hours':
                nextReminderTime.setHours(nextReminderTime.getHours() + 2);
                break;
              case 'daily':
                nextReminderTime.setDate(nextReminderTime.getDate() + 1);
                break;
            }
          } else {
            // Default to 2 hour recurring if no reminder specified
            reminderInterval = '2hours';
            nextReminderTime = new Date();
            nextReminderTime.setHours(nextReminderTime.getHours() + 2);
          }

          const createdTask = await Task.create({
            title: t.title,
            description: t.event_description || '',
            reminder_interval: reminderInterval,
            reminder_count: 0,
            next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
            urgency: t.urgency || 'medium',
            energy_required: t.energy_required || 'medium',
            status: 'active'
          });

          if (nextReminderTime && reminderInterval !== 'once') {
            try {
              await scheduleReminder({
                email: currentUser.email,
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
        }

        // Navigate back immediately
        navigate(createPageUrl("Home"), { state: { reload: true } });
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      alert("Failed to process voice input");
    }

    setIsProcessingVoice(false);
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    setIsProcessingVoice(true);

    try {
      const prompt = `Parse this text input and extract task details with COMPLETE reminder information.

INPUT: "${textInput}"

Extract:
- Task title (clean, concise)
- Priority based on urgency words
- Energy level based on complexity
- REMINDER: specific time, relative time, before event, or recurring
  
Examples:
"Call dentist tomorrow at 2pm" → specific_time: tomorrow 2pm
"Water plants in 30 minutes" → relative: 30 minutes from now
"Review notes 15 minutes before meeting" → before_event: 15 minutes before
"Take vitamins every day at 9am" → recurring: daily at 9am

Return JSON:
{
  "title": "clean task title",
  "reminder_type": "specific_time" | "relative" | "before_event" | "recurring" | "none",
  "reminder_value": "ISO timestamp or interval",
  "event_description": "event description if before_event",
  "urgency": "low" | "medium" | "high" | "urgent",
  "energy_required": "low" | "medium" | "high"
}`;

      const taskData = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            reminder_type: { type: "string" },
            reminder_value: { type: "string" },
            event_description: { type: "string" },
            urgency: { type: "string" },
            energy_required: { type: "string" }
          }
        }
      });

      const currentUser = await User.me();
      let nextReminderTime = null;
      let reminderInterval = null;

      if (taskData.reminder_type === 'specific_time' && taskData.reminder_value) {
        nextReminderTime = new Date(taskData.reminder_value);
        reminderInterval = 'once';
      } else if (taskData.reminder_type === 'recurring' && taskData.reminder_value) {
        reminderInterval = taskData.reminder_value;
        nextReminderTime = new Date();
        if (reminderInterval === 'daily') {
          nextReminderTime.setDate(nextReminderTime.getDate() + 1);
        } else {
          nextReminderTime.setHours(nextReminderTime.getHours() + 2);
        }
      } else {
        // Default
        reminderInterval = '2hours';
        nextReminderTime = new Date();
        nextReminderTime.setHours(nextReminderTime.getHours() + 2);
      }

      const createdTask = await Task.create({
        title: taskData.title || textInput.trim(),
        description: taskData.event_description || '',
        reminder_interval: reminderInterval,
        reminder_count: 0,
        next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium',
        status: 'active'
      });

      if (nextReminderTime && reminderInterval !== 'once') {
        try {
          await scheduleReminder({
            email: currentUser.email,
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

      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("Error parsing task:", error);
      alert("Failed to create task");
    }

    setIsProcessingVoice(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ 
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(8rem, calc(8rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-3xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("Home"))}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <Card className={`border-none shadow-2xl overflow-hidden ${
          theme === 'dark'
            ? 'bg-gray-800'
            : theme === 'minimalist'
              ? 'bg-white'
              : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
        }`}>
          <CardContent className="p-8 md:p-12">
            <div className="flex justify-center gap-3 mb-8">
              <Button
                variant={inputMode === 'voice' ? 'default' : 'outline'}
                onClick={() => setInputMode('voice')}
                className={`px-6 h-12 ${
                  inputMode === 'voice' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'voice' && theme !== 'dark'
                      ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                      : ''
                }`}
              >
                <Mic className="w-5 h-5 mr-2" />
                Voice
              </Button>
              <Button
                variant={inputMode === 'text' ? 'default' : 'outline'}
                onClick={() => setInputMode('text')}
                className={`px-6 h-12 ${
                  inputMode === 'text' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'text' && theme !== 'dark'
                      ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                      : ''
                }`}
              >
                Type
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {inputMode === 'voice' ? (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center gap-8 py-12"
                >
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center ${
                    theme === 'minimalist'
                      ? 'bg-purple-100'
                      : 'bg-gradient-to-br from-purple-100 to-pink-100'
                  }`}>
                    <Sparkles className={`w-16 h-16 ${
                      theme === 'minimalist' ? 'text-purple-600' : 'text-purple-700'
                    }`} />
                  </div>
                  <div className="text-center space-y-3 max-w-md">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {isProcessingVoice ? 'Creating your tasks...' : isRecording ? 'Listening...' : 'Ready to capture your tasks?'}
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      {isRecording 
                        ? 'Tap again when done' 
                        : 'Tap the mic and speak - say them one at a time or all at once'
                      }
                    </p>
                  </div>
                  <button
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={isProcessingVoice}
                    className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : isProcessingVoice
                          ? 'bg-gray-400'
                          : theme === 'minimalist'
                            ? 'bg-purple-600 hover:bg-purple-700 hover:scale-110'
                            : 'bg-gradient-to-br from-purple-600 to-pink-600 hover:scale-110'
                    } shadow-2xl`}
                  >
                    <Mic className="w-16 h-16 text-white" />
                  </button>
                  <p className="text-sm text-gray-500 text-center">Tap to Speak</p>
                </motion.div>
              ) : (
                <motion.div
                  key="text"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6 py-8"
                >
                  <div className="text-center space-y-3 max-w-md mx-auto mb-6">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Type your tasks
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      Enter each task and press Enter to add - AI will organize it with smart reminders
                    </p>
                  </div>
                  <form onSubmit={handleTextSubmit} className="max-w-xl mx-auto">
                    <div className="flex gap-3">
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder='e.g., "Call dentist tomorrow at 2pm" or "Water plants every day"'
                        className="h-14 text-lg flex-1"
                        autoFocus
                        disabled={isProcessingVoice}
                      />
                      <Button 
                        type="submit" 
                        disabled={!textInput.trim() || isProcessingVoice}
                        className={`h-14 px-8 ${
                          theme === 'minimalist'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-gradient-to-r from-purple-600 to-orange-600'
                        }`}
                      >
                        {isProcessingVoice ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
      
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
