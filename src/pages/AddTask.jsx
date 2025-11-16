import React, { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [showAdvanceReminderDialog, setShowAdvanceReminderDialog] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const processAndCreateTask = async (inputText) => {
    console.log('🔄 [PROCESS] ========== START ==========');
    console.log('🔄 [PROCESS] Input:', inputText);
    
    if (!inputText.trim()) {
      console.log('🔄 [PROCESS] ❌ Empty input');
      return false;
    }

    try {
      console.log('🔄 [PROCESS] Getting user...');
      const currentUser = await base44.auth.me();
      console.log('🔄 [PROCESS] ✅ User:', currentUser?.email);
      
      const now = new Date();
      const today = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

      const prompt = `Parse task: "${inputText}"

Today: ${today} | Tomorrow: ${tomorrowStr} | Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

Extract:
1. Clean title (remove "remind me", "I need to")
2. Urgency: low/medium/high/urgent
3. Energy: low/medium/high
4. Specific date mentioned? (e.g., "Nov 17", "tomorrow", "next Friday")
5. Time mentioned? (e.g., "2pm", "9:30am")
6. Recurring? (e.g., "daily", "every hour", "every 2 hours")

JSON:
{
  "title": "clean title with all details",
  "urgency": "medium",
  "energy_required": "medium",
  "target_date": "YYYY-MM-DD or null",
  "target_time": "HH:MM or null",
  "reminder_interval": "10min|20min|30min|1hour|2hours|daily|every_other_day|once|null"
}`;

      console.log('🔄 [PROCESS] Calling LLM...');
      const parsed = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            urgency: { type: "string" },
            energy_required: { type: "string" },
            target_date: { type: "string" },
            target_time: { type: "string" },
            reminder_interval: { type: "string" }
          }
        }
      });
      console.log('🔄 [PROCESS] ✅ LLM parsed:', parsed);

      console.log('🔄 [PROCESS] Calculating reminder times...');
      let nextReminder = null;
      let actualReminderInterval = parsed.reminder_interval || null;
      
      const recurringIntervals = ['10min', '20min', '30min', '1hour', '2hours', 'daily', 'every_other_day'];

      if (parsed.target_date) {
        console.log('🔄 [PROCESS] Has target_date:', parsed.target_date);
        const targetDate = new Date(parsed.target_date);
        
        if (parsed.target_time) {
          const [hours, minutes] = parsed.target_time.split(':');
          targetDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        } else {
          targetDate.setHours(9, 0, 0, 0);
        }
        
        nextReminder = targetDate;
        // Only force 'once' if no recurring interval was specified
        if (!actualReminderInterval || !recurringIntervals.includes(actualReminderInterval)) {
          actualReminderInterval = 'once';
        }

        const taskData = {
          title: parsed.title || inputText.trim(),
          description: '',
          reminder_interval: actualReminderInterval,
          reminder_count: 0,
          next_reminder: nextReminder.toISOString(),
          urgency: parsed.urgency || 'medium',
          energy_required: parsed.energy_required || 'medium',
          status: 'active'
        };

        setPendingTask({ taskData, currentUser });
        setShowAdvanceReminderDialog(true);
        return true;
      } else if (parsed.target_time) {
        const [hours, minutes] = parsed.target_time.split(':');
        nextReminder = new Date();
        nextReminder.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        if (nextReminder <= now) {
          nextReminder.setDate(nextReminder.getDate() + 1);
        }
        // Only force 'once' if no recurring interval was specified
        if (!actualReminderInterval || !recurringIntervals.includes(actualReminderInterval)) {
          actualReminderInterval = 'once';
        }
      } else if (parsed.reminder_interval && parsed.reminder_interval !== 'once') {
        nextReminder = new Date(now.getTime());
        switch (parsed.reminder_interval) {
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
          case 'daily':
            nextReminder.setDate(nextReminder.getDate() + 1);
            break;
          case 'every_other_day':
            nextReminder.setDate(nextReminder.getDate() + 2);
            break;
          default:
            nextReminder.setHours(nextReminder.getHours() + 2);
            break;
        }
      } else if (!parsed.reminder_interval && !parsed.target_time && !parsed.target_date) {
        actualReminderInterval = '2hours';
        nextReminder = new Date();
        nextReminder.setHours(nextReminder.getHours() + 2);
      }

      // CRITICAL FIX: Create task BEFORE navigating
      console.log('Creating task...');
      const createdTask = await base44.entities.Task.create({
        title: parsed.title || inputText.trim(),
        description: '',
        reminder_interval: actualReminderInterval,
        reminder_count: 0,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        urgency: parsed.urgency || 'medium',
        energy_required: parsed.energy_required || 'medium',
        status: 'active'
      });

      console.log('Task created:', createdTask);

      // Schedule reminder in background (non-blocking)
      if (nextReminder) {
        scheduleReminder({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${createdTask.title}\n\nTap to mark as complete!`,
          sendAtISO: nextReminder.toISOString(),
          taskId: createdTask.id,
          data: {
            screen: "/TaskNotification",
            taskId: createdTask.id,
            urgency: createdTask.urgency,
            type: 'task_reminder'
          }
        }).then(notificationId => {
          if (notificationId) {
            base44.entities.Task.update(createdTask.id, {
              onesignal_notification_id: notificationId
            });
          }
        }).catch(error => {
          console.error("Failed to schedule reminder:", error);
        });
      }
      
      return true;
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create task. Please try again.");
      return false;
    }
  };

  const handleAdvanceReminderChoice = async (minutesBefore) => {
    if (!pendingTask) return;

    const { taskData, currentUser } = pendingTask;

    setShowAdvanceReminderDialog(false);
    setIsProcessing(true);

    try {
      // Create task first
      const createdTask = await base44.entities.Task.create(taskData);

      const mainReminderTime = new Date(taskData.next_reminder);
      
      // Schedule reminders in background (non-blocking)
      Promise.all([
        scheduleReminder({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${createdTask.title}\n\nTap to mark as complete!`,
          sendAtISO: mainReminderTime.toISOString(),
          taskId: createdTask.id,
          data: {
            screen: "/TaskNotification",
            taskId: createdTask.id,
            urgency: createdTask.urgency,
            type: 'task_reminder'
          }
        }),
        minutesBefore > 0 ? (async () => {
          const advanceTime = new Date(mainReminderTime.getTime() - (minutesBefore * 60 * 1000));
          if (advanceTime.getTime() > new Date().getTime()) {
            return scheduleReminder({
              email: currentUser.email,
              title: "📋 Upcoming Task",
              body: `In ${minutesBefore >= 60 ? `${minutesBefore / 60} hour${minutesBefore > 60 ? 's' : ''}` : `${minutesBefore} min`}: ${createdTask.title}\n\nTap to view details.`,
              sendAtISO: advanceTime.toISOString(),
              taskId: createdTask.id,
              data: {
                screen: "/TaskNotification",
                taskId: createdTask.id,
                urgency: createdTask.urgency,
                type: 'advance_reminder'
              }
            });
          }
        })() : null
      ]).then(([notificationId]) => {
        if (notificationId) {
          base44.entities.Task.update(createdTask.id, {
            onesignal_notification_id: notificationId
          });
        }
      }).catch(error => {
        console.error("Failed to schedule reminders:", error);
      });

      // Navigate after task is created
      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("Error creating task with advance reminder:", error);
      alert("Failed to create task with advance reminder. Please try again.");
    } finally {
      setPendingTask(null);
      setIsProcessing(false);
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
          setIsRecording(false);
          return;
        }

        setIsProcessing(true);
        await handleVoiceTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Could not access microphone");
      setIsProcessing(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceTranscription = async (audioBlob) => {
    try {
      const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, {
        type: audioBlob.type
      });

      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioFile
      });

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio file');
      }

      const response = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      if (response?.data?.success && response?.data?.transcription) {
        // CRITICAL FIX: Wait for task creation before navigating
        const success = await processAndCreateTask(response.data.transcription);
        if (success && !showAdvanceReminderDialog) {
          // Only navigate if not showing advance reminder dialog
          navigate(createPageUrl("Home"), { state: { reload: true } });
        }
      } else {
        throw new Error('Failed to transcribe audio');
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      alert("Failed to process voice input. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = async (e) => {
    console.log('📝 [TEXT INPUT] ========== SUBMIT START ==========');
    e.preventDefault();
    if (!textInput.trim()) {
      console.log('📝 [TEXT INPUT] ❌ Empty input, returning');
      return;
    }

    console.log('📝 [TEXT INPUT] Input text:', textInput);
    setIsProcessing(true);
    const input = textInput;
    setTextInput('');
    
    try {
      console.log('📝 [TEXT INPUT] Calling processAndCreateTask...');
      const success = await processAndCreateTask(input);
      console.log('📝 [TEXT INPUT] processAndCreateTask result:', success);
      
      setIsProcessing(false);
      
      if (success && !showAdvanceReminderDialog) {
        console.log('📝 [TEXT INPUT] ✅ Success, navigating to Home');
        navigate(createPageUrl("Home"), { state: { reload: true } });
      } else {
        console.log('📝 [TEXT INPUT] ⚠️ Not navigating:', { success, showAdvanceReminderDialog });
      }
    } catch (error) {
      console.error('📝 [TEXT INPUT] ❌ ERROR:', error);
      setIsProcessing(false);
      alert('Failed to create task: ' + error.message);
    }
  };

  const getCardClasses = () => {
    if (theme === 'dark') return 'bg-gray-800 border-gray-700';
    if (theme === 'minimalist') return 'bg-white border-gray-200';
    if (theme === 'spicybrains') return 'bg-gradient-to-br from-red-100 via-orange-100 to-yellow-100 border-red-200';
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
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-red-300 via-orange-300 to-yellow-400' 
        : ''
    }`} style={{
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))'
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
              : theme === 'spicybrains'
                ? 'bg-gradient-to-br from-red-100 via-orange-100 to-yellow-100'
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
                    : inputMode === 'voice' && theme === 'spicybrains'
                      ? 'bg-gradient-to-r from-red-600 to-yellow-600'
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
                    : inputMode === 'text' && theme === 'spicybrains'
                      ? 'bg-gradient-to-r from-red-600 to-yellow-600'
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
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-br from-red-200 to-yellow-200'
                        : 'bg-gradient-to-br from-purple-100 to-pink-100'
                  }`}>
                    <Sparkles className={`w-16 h-16 ${
                      theme === 'minimalist' ? 'text-purple-600' : theme === 'spicybrains' ? 'text-orange-700' : 'text-purple-700'
                    }`} />
                  </div>
                  <div className="text-center space-y-3 max-w-md">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {isProcessing ? 'Creating your task...' : isRecording ? 'Listening...' : 'Ready to capture your tasks?'}
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      {isRecording
                        ? 'Tap to stop listening'
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
                          ? 'bg-gray-400 cursor-not-allowed'
                          : theme === 'minimalist'
                            ? 'bg-purple-600 hover:bg-purple-700 hover:scale-110'
                            : theme === 'spicybrains'
                              ? 'bg-gradient-to-br from-red-600 to-yellow-600 hover:scale-110'
                              : 'bg-gradient-to-br from-purple-600 to-pink-600 hover:scale-110'
                    } shadow-2xl`}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-16 h-16 text-white animate-spin" />
                    ) : (
                      <Mic className="w-16 h-16 text-white" />
                    )}
                  </button>
                  <p className="text-sm text-gray-500 text-center">
                    {isProcessing ? 'Processing...' : isRecording ? 'Tap to Stop' : 'Tap to Speak'}
                  </p>
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
                            : theme === 'spicybrains'
                              ? 'bg-gradient-to-r from-red-600 to-yellow-600'
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
                        : theme === 'spicybrains'
                          ? 'bg-gradient-to-r from-red-50/50 to-yellow-50/50 border-red-200 hover:border-red-300'
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

      <Dialog open={showAdvanceReminderDialog} onOpenChange={setShowAdvanceReminderDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Would you like an advance reminder?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-600">Get notified before the task is due:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleAdvanceReminderChoice(30)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">30 minutes</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => handleAdvanceReminderChoice(60)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">1 hour</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => handleAdvanceReminderChoice(1440)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">1 day</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => handleAdvanceReminderChoice(0)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">No thanks</span>
                <span className="text-xs text-gray-500">just on time</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}