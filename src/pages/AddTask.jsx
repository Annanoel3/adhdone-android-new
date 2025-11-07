import React, { useState } from "react";
import { Task } from "@/entities/Task";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Mic, Keyboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
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
        
        // Parse transcription with AI to extract tasks
        const prompt = `Parse this voice input and extract tasks. Return as JSON array.

INPUT: "${transcription}"

If it's a list, return each as separate task.
If it's one thing, return single task.

Return JSON:
{
  "tasks": [
    {
      "title": "task title",
      "reminder_interval": "2hours" | "daily" | null,
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
                    reminder_interval: { type: "string" },
                    urgency: { type: "string" },
                    energy_required: { type: "string" }
                  }
                }
              }
            }
          }
        });

        // Add parsed tasks to the list
        const newTasks = (taskData.tasks || []).map(t => ({
          id: `temp-${Date.now()}-${Math.random()}`,
          title: t.title,
          description: '',
          reminder_interval: t.reminder_interval || '2hours',
          urgency: t.urgency || 'medium',
          energy_required: t.energy_required || 'medium'
        }));

        setTasks(prev => [...prev, ...newTasks]);
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
      // Parse text with AI to extract task details
      const prompt = `Parse this text input and extract task details. Return as JSON.

INPUT: "${textInput}"

Extract:
- Task title (clean, concise)
- Priority (based on urgency words)
- Energy level (based on complexity)
- Reminder interval if mentioned

Return JSON:
{
  "title": "clean task title",
  "reminder_interval": "2hours" | "daily" | null,
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
            urgency: { type: "string" },
            energy_required: { type: "string" }
          }
        }
      });

      const newTask = {
        id: `temp-${Date.now()}`,
        title: taskData.title || textInput.trim(),
        description: '',
        reminder_interval: taskData.reminder_interval || '2hours',
        urgency: taskData.urgency || 'medium',
        energy_required: taskData.energy_required || 'medium'
      };

      setTasks(prev => [...prev, newTask]);
      setTextInput('');
    } catch (error) {
      console.error("Error parsing task:", error);
      // Fallback: just create simple task
      const newTask = {
        id: `temp-${Date.now()}`,
        title: textInput.trim(),
        description: '',
        reminder_interval: '2hours',
        urgency: 'medium',
        energy_required: 'medium'
      };
      setTasks(prev => [...prev, newTask]);
      setTextInput('');
    }

    setIsProcessingVoice(false);
  };

  const handleDeleteTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleSaveAll = async () => {
    if (tasks.length === 0) return;

    setIsSaving(true);
    try {
      const currentUser = await User.me();
      if (!currentUser || !currentUser.email) {
        throw new Error("User not logged in");
      }

      for (const task of tasks) {
        let nextReminderTime = null;
        const now = new Date();

        if (task.reminder_interval && task.reminder_interval !== 'once') {
          nextReminderTime = new Date(now.getTime());
          
          switch (task.reminder_interval) {
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
            default:
              nextReminderTime = null;
              break;
          }
          
          if (nextReminderTime) {
            console.log(`🕐 [NEW TASK] Setting initial reminder for ${nextReminderTime.toLocaleString()} (${nextReminderTime.toISOString()})`);
          }
        }
        
        const createdTask = await Task.create({
          title: task.title,
          description: task.description,
          reminder_interval: task.reminder_interval,
          reminder_count: 0,
          next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null,
          urgency: task.urgency,
          energy_required: task.energy_required,
          status: 'active'
        });

        if (nextReminderTime && task.reminder_interval !== 'once') {
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
            console.log(`✅ [NEW TASK] Scheduled reminder for "${createdTask.title}"`);
          } catch (error) {
            console.error(`Failed to schedule reminder:`, error);
          }
        }
      }

      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("Error saving tasks:", error);
      alert("Failed to save tasks. Please try again.");
    }
    setIsSaving(false);
  };

  const getUrgencyColor = (urgency) => {
    if (theme === 'dark') {
      return {
        low: 'bg-gray-700 text-gray-300',
        medium: 'bg-blue-700 text-blue-200',
        high: 'bg-amber-700 text-amber-200',
        urgent: 'bg-red-700 text-red-200'
      }[urgency];
    }
    return {
      low: 'bg-gray-100 text-gray-700',
      medium: 'bg-blue-100 text-blue-700',
      high: 'bg-amber-100 text-amber-700',
      urgent: 'bg-red-100 text-red-700'
    }[urgency];
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("Home"))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          {tasks.length > 0 && (
            <Button
              onClick={handleSaveAll}
              disabled={isSaving}
              className={
                theme === 'minimalist'
                  ? 'bg-green-600 hover:bg-green-700'
                  : theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }
            >
              {isSaving ? 'Saving...' : `Save ${tasks.length} Task${tasks.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>

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
                <Keyboard className="w-5 h-5 mr-2" />
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
                  <div className="text-center space-y-3 max-w-md">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {isProcessingVoice ? 'Processing...' : isRecording ? 'Listening...' : 'Speak your tasks'}
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      {isRecording ? 'Tap again to finish' : 'Tap the mic and speak naturally'}
                    </p>
                  </div>
                  <button
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={isProcessingVoice}
                    className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : isProcessingVoice
                          ? 'bg-gray-400'
                          : theme === 'minimalist'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-gradient-to-br from-purple-600 to-orange-600 hover:scale-110'
                    } shadow-2xl`}
                  >
                    <Mic className="w-12 h-12 text-white" />
                  </button>
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
                      Type your task or idea
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      AI will organize it - just describe what needs to be done
                    </p>
                  </div>
                  <form onSubmit={handleTextSubmit} className="max-w-xl mx-auto">
                    <div className="flex gap-3">
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="e.g., Call dentist tomorrow at 2pm"
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

        {tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {tasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`border shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700'
                      : theme === 'minimalist'
                        ? 'bg-white'
                        : 'bg-gradient-to-r from-purple-50/50 to-orange-50/50'
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className={`font-semibold text-lg mb-3 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                          {task.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getUrgencyColor(task.urgency)}`}>
                            {task.urgency}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {task.energy_required} energy
                          </span>
                          {task.reminder_interval && (
                            <span className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
                              {task.reminder_interval === '2hours' ? 'Every 2 hours' :
                               task.reminder_interval === 'daily' ? 'Daily' :
                               task.reminder_interval}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-500 hover:bg-red-50"
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}