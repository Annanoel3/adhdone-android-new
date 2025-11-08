
import React, { useState } from "react";
import { Task } from "@/entities/Task";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Mic, Loader2, ListChecks, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "../components/utils/reminderScheduler";
import { Badge } from "@/components/ui/badge";

export default function AddTask() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputMode, setInputMode] = useState('voice');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [optimisticTasks, setOptimisticTasks] = useState([]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const createTaskOptimistically = (taskTitle, taskDetails = {}) => {
    const tempTask = {
      id: 'temp-' + Date.now(),
      title: taskTitle,
      status: 'active',
      urgency: 'medium',
      energy_required: 'medium',
      isProcessing: true,
      created_date: new Date().toISOString(),
      ...taskDetails
    };

    setOptimisticTasks(prev => [tempTask, ...prev]);
    return tempTask.id;
  };

  const replaceOptimisticTask = (tempId, realTask) => {
    setOptimisticTasks(prev => prev.filter(t => t.id !== tempId));
  };

  const removeOptimisticTask = (tempId) => {
    setOptimisticTasks(prev => prev.filter(t => t.id !== tempId));
  };

  const processAndCreateTask = async (inputText) => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    const tempId = createTaskOptimistically(inputText);

    try {
      const currentUser = await User.me();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const prompt = `Parse this task: "${inputText}"

Context:
- Today: ${today.toISOString().split('T')[0]}
- Tomorrow: ${tomorrow.toISOString().split('T')[0]}
- Current time: ${now.toLocaleTimeString()}

CRITICAL: Keep ALL important details in the task title. Only remove filler words like "remind me to", "I need to", etc.

Example:
"Remind me to call the dentist about my appointment and pick up the prescription" 
→ "Call dentist about appointment and pick up prescription" (NOT just "Call dentist")

Extract:
1. Task title - Keep it detailed and complete (remove only filler words)
2. Urgency (low/medium/high/urgent)
3. Energy needed (low/medium/high)
4. Reminder timing if mentioned

Return JSON:
{
  "title": "complete task description here",
  "urgency": "medium",
  "energy_required": "medium",
  "reminder_interval": "30min" | "1hour" | "2hours" | "daily" | "once" | null,
  "reminder_time": "HH:MM" | null,
  "relative_minutes": number | null
}`;

      const parsed = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            urgency: { type: "string" },
            energy_required: { type: "string" },
            reminder_interval: { type: "string" },
            reminder_time: { type: "string" },
            relative_minutes: { type: "number" }
          }
        }
      });

      let nextReminder = null;
      let actualReminderInterval = parsed.reminder_interval || null;

      if (parsed.relative_minutes && parsed.relative_minutes > 0) {
        nextReminder = new Date(now.getTime() + parsed.relative_minutes * 60 * 1000);
        actualReminderInterval = 'once';
      } else if (parsed.reminder_time) {
        const [hours, minutes] = parsed.reminder_time.split(':');
        nextReminder = new Date();
        nextReminder.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        if (nextReminder <= now) {
          nextReminder.setDate(nextReminder.getDate() + 1);
        }
        actualReminderInterval = actualReminderInterval || 'once';
      } else if (parsed.reminder_interval && parsed.reminder_interval !== 'once') {
        nextReminder = new Date(now.getTime());
        switch (parsed.reminder_interval) {
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
        }
      } else if (!parsed.reminder_interval && !parsed.reminder_time && !parsed.relative_minutes) {
        actualReminderInterval = '2hours';
        nextReminder = new Date();
        nextReminder.setHours(nextReminder.getHours() + 2);
      }

      // Create task in background - don't wait
      Task.create({
        title: parsed.title || inputText.trim(),
        description: '',
        reminder_interval: actualReminderInterval,
        reminder_count: 0,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        urgency: parsed.urgency || 'medium',
        energy_required: parsed.energy_required || 'medium',
        status: 'active'
      }).then(createdTask => {
        if (nextReminder) {
          scheduleReminder({
            email: currentUser.email,
            title: "Task Reminder 📋",
            body: createdTask.title,
            sendAtISO: nextReminder.toISOString(),
            taskId: createdTask.id,
            data: {
              screen: "/Tasks",
              taskId: createdTask.id,
              urgency: createdTask.urgency,
              type: 'task_reminder'
            }
          }).catch(error => {
            console.error("Failed to schedule reminder:", error);
          });
        }
        
        replaceOptimisticTask(tempId, createdTask);
      }).catch(error => {
        console.error("Error creating task:", error);
        removeOptimisticTask(tempId);
      });

      // Navigate immediately without waiting
      setTimeout(() => {
        navigate(createPageUrl("Home"), { state: { reload: true } });
      }, 500);
      
      return true;
    } catch (error) {
      console.error("Error creating task:", error);
      removeOptimisticTask(tempId);
      alert("Failed to create task. Please try again.");
      setIsProcessing(false);
      return false;
    }
  };

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
          setIsProcessing(false);
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
      setIsProcessing(true);
    }
  };

  const handleVoiceTranscription = async (audioBlob) => {
    try {
      // CRITICAL FIX: Convert Blob to File object with proper name and extension
      const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, {
        type: audioBlob.type
      });

      console.log('🎤 [VOICE] Uploading audio file:', {
        name: audioFile.name,
        size: audioFile.size,
        type: audioFile.type
      });

      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioFile
      });

      console.log('✅ [VOICE] Upload result:', uploadResult);

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio file');
      }

      const response = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      console.log('✅ [VOICE] Transcription response:', response);

      if (response?.data?.success && response?.data?.transcription) {
        await processAndCreateTask(response.data.transcription);
      } else {
        throw new Error('Failed to transcribe audio');
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      alert("Failed to process voice input. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    await processAndCreateTask(textInput);
    setTextInput('');
  };

  const getCardClasses = () => {
    if (theme === 'dark') return 'bg-gray-800 border-gray-700';
    if (theme === 'minimalist') return 'bg-white border-gray-200';
    return 'bg-gradient-to-br from-purple-50 via-white to-orange-50 border-purple-200';
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  const displayTasks = [...optimisticTasks, ...tasks.filter(t => t.status === 'active')];

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
                      {isProcessing ? 'Creating your task...' : isRecording ? 'Listening...' : 'Ready to capture your tasks?'}
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
                    disabled={isProcessing}
                    className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : isProcessing
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
                        disabled={isProcessing}
                      />
                      <Button
                        type="submit"
                        disabled={!textInput.trim() || isProcessing}
                        className={`h-14 px-8 ${
                          theme === 'minimalist'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-gradient-to-r from-purple-600 to-orange-600'
                        }`}
                      >
                        {isProcessing ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {displayTasks.length > 0 && (
        <Card className={`mt-8 border-none shadow-2xl overflow-hidden ${getCardClasses()}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              <ListChecks className="w-5 h-5" />
              Your Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayTasks.slice(0, 10).map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all ${
                  task.isProcessing
                    ? 'opacity-60 animate-pulse'
                    : theme === 'minimalist'
                      ? 'bg-white border-gray-200 hover:border-gray-300'
                      : theme === 'dark'
                        ? 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                        : 'bg-gradient-to-r from-purple-50/50 to-orange-50/50 border-purple-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {task.title}
                      </h4>
                      {task.isProcessing && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                    </div>
                    {!task.isProcessing && (
                      <div className="flex flex-wrap gap-2">
                        {task.urgency && (
                          <Badge className={getUrgencyColor(task.urgency)}>
                            {task.urgency}
                          </Badge>
                        )}
                        {task.energy_required && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {task.energy_required} energy
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
