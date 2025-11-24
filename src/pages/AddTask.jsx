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
import { toast } from "sonner";
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

  const detectMultipleTasks = async (inputText) => {
    console.log('🔍 [DETECT] Checking if input contains multiple tasks...');

    const multiTaskPrompt = `Analyze this input and determine if it contains multiple separate tasks:

  INPUT: "${inputText}"

  CRITICAL: Check if the second part DEPENDS on the first part (uses pronouns like "them", "they", "it", or requires context from first part).
  If it's dependent, keep as ONE task. If independent, split into multiple.

  Examples of MULTIPLE independent tasks:
  - "clean the dishes and take out the trash" → ["clean the dishes", "take out the trash"]
  - "call dentist, schedule car appointment, pay rent" → 3 separate tasks
  - "buy milk and eggs, then call mom" → ["buy milk and eggs", "call mom"]

  Examples of SINGLE task (dependent parts):
  - "call the mini place and ask them to send recommendations by email" → ONE task ("them" refers to mini place)
  - "text Sarah and see if she wants to meet up" → ONE task ("she" refers to Sarah)
  - "open the document and add the notes" → ONE task ("the document" carries over)
  - "clean the kitchen thoroughly including dishes and counters" → ONE task (details of same task)
  - "call dentist about tooth pain" → ONE task (additional context)

  Return JSON:
  {
  "is_multiple": true/false,
  "tasks": ["task 1", "task 2", ...] (if multiple) or ["original input"] (if single)
  }`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: multiTaskPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            is_multiple: { type: "boolean" },
            tasks: { type: "array", items: { type: "string" } }
          }
        }
      });

      console.log('🔍 [DETECT] Result:', result);
      return result.tasks || [inputText];
    } catch (error) {
      console.error('🔍 [DETECT] Error detecting tasks, treating as single:', error);
      return [inputText];
    }
  };

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
      const today = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const prompt = `Parse task: "${inputText}"

      TODAY IS: ${today}
      TOMORROW IS: ${tomorrowStr}
      CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}

      CRITICAL DISTINCTION - READ CAREFULLY:

      "in X" vs "every X":
      - If user says "in 10 minutes" or "in 1 hour" → This is ONE-TIME ONLY
      Set: reminder_interval="once", target_date=TODAY, target_time=CALCULATED_TIME

      - If user says "every 10 minutes" or "every hour" → This is RECURRING
      Set: reminder_interval="10min" or "1hour", no target_date/target_time

      Examples:
      ❌ WRONG: "in 10 minutes" → reminder_interval="10min" 
      ✅ CORRECT: "in 10 minutes" → reminder_interval="once", target_time="14:35" (if now is 14:25)

      ❌ WRONG: "every hour" → reminder_interval="once", target_time="15:25"
      ✅ CORRECT: "every hour" → reminder_interval="1hour"

      Other rules:
      - "at 2pm" → ONE-TIME, reminder_interval="once", target_time="14:00"
      - "tomorrow at 2pm" → ONE-TIME, reminder_interval="once", target_date=TOMORROW, target_time="14:00"
      - "daily"/"every day" → reminder_interval="daily"
      - "every other day" → reminder_interval="every_other_day"

      SMART SUGGESTIONS (if NO time interval specified by user):
      You MUST suggest an appropriate reminder_interval based on task type:
      - Quick household tasks (clean Legos, dishes, laundry) → "1hour" or "2hours"
      - Important appointments/calls (dentist, doctor, important calls) → "1hour" 
      - Daily routines (take medicine, walk dog, water plants) → "daily"
      - Self-care tasks (shower, exercise) → "daily"
      - Less urgent errands (schedule appointment, pay bill) → "2hours" or "daily"
      - One-time events with no urgency → "daily"

      SMART PRIORITY SUGGESTIONS:
      Analyze the task and suggest urgency:
      - Time-sensitive or deadline-based → "urgent" or "high"
      - Important but flexible (appointments, health) → "high" or "medium"
      - Routine maintenance → "medium"
      - Nice-to-have or can wait → "low"

      Extract:
      1. Clean title (remove "remind me", "I need to", "in X minutes/hours", etc)
      2. Urgency: ALWAYS suggest based on task (low/medium/high/urgent)
      3. Energy: ALWAYS suggest based on task (low/medium/high)
      4. target_date: ONLY for "in X" (TODAY) or "tomorrow" or specific dates
      5. target_time: ONLY for "in X" (calculate) or "at 2pm" (specific time) - format HH:MM 24-hour
      6. reminder_interval: ALWAYS suggest if not specified by user (10min/20min/30min/1hour/2hours/daily/every_other_day/once)

      JSON:
      {
      "title": "clean title",
      "urgency": "medium",
      "energy_required": "medium",
      "target_date": "YYYY-MM-DD or null",
      "target_time": "HH:MM or null",
      "reminder_interval": "10min|20min|30min|1hour|2hours|daily|every_other_day|once"
      }`;

      // First, check if this belongs in parking lot vs task
      console.log('🔄 [PROCESS] Checking if this is a parking lot idea or task...');
      const categoryCheckPrompt = `Analyze this input: "${inputText}"

      CRITICAL RULES:
      1. If user explicitly says "parking lot" → ALWAYS parking_lot
      2. If it's an ACTIONABLE TODO that needs to be done → task
      Examples: "clean the toilet", "call dentist", "do laundry", "Amazon returns", "pay bills"
      3. If it's IDEAS, THOUGHTS, INFORMATION, or vague LISTS → parking_lot

      TASKS (concrete actions that need to be done):
      - Clear actionable todos: "clean the toilet", "call dentist", "Amazon returns", "submit report", "pay rent"
      - With timing: "Remind me tomorrow", "Call at 2pm", "Do laundry every day"
      - Deadlines: "Turn in homework Tuesday", "Pay rent by the 1st"
      - Appointments: "Therapist at 12 p.m.", "Meeting at 9am"
      - Events: "Martin's wedding on the 30th", "Birthday party Saturday"
      - Errands: "Pick up dry cleaning", "Drop off package", "Go to post office"

      PARKING LOT (ideas, thoughts, non-actionable information):
      - Explicit: "add to parking lot", "parking lot idea"
      - Ideas/thoughts: "Steel guitar strings might be better", "Maybe try meditation"
      - Planning: "Think about what to tell my professor"
      - Shopping/reading lists WITHOUT urgency: "I need milk, eggs, paper", "read twilight and cirque du freak"
      - Information: "Brazilian blowouts cost $200"
      - Brainstorming: "My project needs hypothesis, summary, references"
      - Questions: "Not sure if car leak is from transmission or seal"
      - Research: "Look into meditation apps", "Research vacation spots"

      KEY DISTINCTION: If someone needs to DO it (action verb), it's a TASK. If they're just capturing info/ideas, it's PARKING LOT.

      Return JSON:
      {
      "category": "parking_lot" | "task",
      "is_list": true/false,
      "main_idea": "short title",
      "items": ["item 1", "item 2", ...] or []
      }`;

      const categoryCheck = await base44.integrations.Core.InvokeLLM({
        prompt: categoryCheckPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            category: { type: "string" },
            is_list: { type: "boolean" },
            main_idea: { type: "string" },
            items: { type: "array", items: { type: "string" } }
          }
        }
      });

      console.log('🔄 [PROCESS] Category check result:', categoryCheck);

      // If it belongs in parking lot, create idea(s)
      if (categoryCheck.category === 'parking_lot') {
        console.log('📝 [PROCESS] Creating parking lot entry...');
        
        if (categoryCheck.is_list && categoryCheck.items && categoryCheck.items.length > 1) {
          // Create main parking lot idea with sub-items
          const mainIdea = await base44.entities.ParkingLotIdea.create({
            idea: categoryCheck.main_idea,
            converted_to_task: false,
            list_format: 'checkbox'
          });

          // Create sub-ideas as checkboxes
          for (const item of categoryCheck.items) {
            await base44.entities.ParkingLotIdea.create({
              idea: item,
              parent_idea_id: mainIdea.id,
              converted_to_task: false,
              list_format: 'checkbox'
            });
          }

          console.log('✅ [PROCESS] Parking lot list created with', categoryCheck.items.length, 'items');
          toast.success('Added to Parking Lot! 📝', {
            description: `"${categoryCheck.main_idea}" with ${categoryCheck.items.length} items`,
            duration: 3000
          });
        } else {
          // Create single parking lot idea
          await base44.entities.ParkingLotIdea.create({
            idea: inputText.trim(),
            converted_to_task: false,
            list_format: 'plain'
          });

          console.log('✅ [PROCESS] Parking lot idea created');
          toast.success('Added to Parking Lot! 📝', {
            description: inputText.trim().substring(0, 50) + (inputText.length > 50 ? '...' : ''),
            duration: 3000
          });
        }
        
        return true;
      }

      // Otherwise, continue with normal task creation
      console.log('🔄 [PROCESS] Calling LLM for task parsing...');
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

      if (parsed.target_date && parsed.target_time && actualReminderInterval === 'once') {
        // One-time reminder with specific date/time
        console.log('🔄 [PROCESS] One-time reminder with date/time');
        // Parse date components to avoid timezone issues
        const [year, month, day] = parsed.target_date.split('-').map(n => parseInt(n, 10));
        const [hours, minutes] = parsed.target_time.split(':').map(n => parseInt(n, 10));
        const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        nextReminder = targetDate;
        actualReminderInterval = 'once';

        // Check if at least 1 day away
        const oneDayFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        const isAtLeastOneDayAway = nextReminder >= oneDayFromNow;

        if (isAtLeastOneDayAway) {
          // Show advance reminder dialog for tasks 1+ day away
          const taskData = {
            title: parsed.title || inputText.trim(),
            description: '',
            reminder_interval: actualReminderInterval,
            reminder_count: 0,
            next_reminder: nextReminder.toISOString(),
            urgency: parsed.urgency || 'medium',
            energy_required: parsed.energy_required || 'medium',
            status: 'active',
            notification_recipient_email: currentUser.email
          };

          console.log('🔄 [PROCESS] Task 1+ day away - showing advance reminder dialog');
          setPendingTask({ taskData, currentUser });
          setShowAdvanceReminderDialog(true);
          return false; // Don't navigate - let dialog handle it
        }
        // Otherwise, continue with normal creation (no advance reminder dialog)
      } else if (parsed.reminder_interval && recurringIntervals.includes(parsed.reminder_interval)) {
        // Recurring reminder
        console.log('🔄 [PROCESS] Recurring reminder:', parsed.reminder_interval);
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
        }
      } else if (!parsed.reminder_interval && !parsed.target_time && !parsed.target_date) {
        // No timing specified - default to once in 2 hours
        console.log('🔄 [PROCESS] No timing, defaulting to 2 hours');
        actualReminderInterval = 'once';
        nextReminder = new Date();
        nextReminder.setHours(nextReminder.getHours() + 2);
      }

      console.log('🔄 [PROCESS] Creating task with data:', {
        title: parsed.title || inputText.trim(),
        reminder_interval: actualReminderInterval,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        urgency: parsed.urgency || 'medium',
        energy_required: parsed.energy_required || 'medium'
      });
      
      const createdTask = await base44.entities.Task.create({
        title: parsed.title || inputText.trim(),
        description: '',
        reminder_interval: actualReminderInterval,
        reminder_count: 0,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        urgency: parsed.urgency || 'medium',
        energy_required: parsed.energy_required || 'medium',
        status: 'active',
        notification_recipient_email: currentUser.email
      });

      console.log('🔄 [PROCESS] ✅ Task created:', createdTask.id);

      // Schedule reminders
      if (nextReminder) {
        const intervalMs = {
          '10min': 10 * 60 * 1000,
          '20min': 20 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        if (actualReminderInterval === 'once') {
          // One-time reminder
          console.log('📅 [SCHEDULE] One-time reminder at', nextReminder.toISOString());
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
                onesignal_notification_ids: [notificationId]
              });
            }
          }).catch(error => {
            console.error("Failed to schedule reminder:", error);
          });
        } else if (intervalMs[actualReminderInterval]) {
          // Recurring reminder - schedule next 10 occurrences
          console.log('🔄 [SCHEDULE] Recurring reminder:', actualReminderInterval);
          import('../components/utils/reminderScheduler').then(module => {
            return module.scheduleRecurringReminders({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${createdTask.title}\n\nTap to mark as complete!`,
              startTime: nextReminder.toISOString(),
              intervalMs: intervalMs[actualReminderInterval],
              count: 10,
              taskId: createdTask.id,
              data: {
                screen: "/TaskNotification",
                taskId: createdTask.id,
                urgency: createdTask.urgency,
                type: 'task_reminder'
              }
            });
          }).then(notificationIds => {
            if (notificationIds && notificationIds.length > 0) {
              base44.entities.Task.update(createdTask.id, {
                onesignal_notification_ids: notificationIds
              });
            }
          }).catch(error => {
            console.error("Failed to schedule recurring reminders:", error);
          });
        }
      }
      
      console.log('🔄 [PROCESS] ========== SUCCESS - RETURNING TRUE ==========');
      return true;
    } catch (error) {
      console.error('🔄 [PROCESS] ========== ERROR ==========');
      console.error('🔄 [PROCESS] Error:', error);
      console.error('🔄 [PROCESS] Error message:', error.message);
      console.error('🔄 [PROCESS] Error stack:', error.stack);
      alert("Failed to create task: " + error.message);
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
      
      // Schedule one-time notification and advance reminder
      // (Recurring reminders are handled by cron job)
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
        // Detect if multiple tasks
        const taskList = await detectMultipleTasks(response.data.transcription);
        console.log('🎤 [VOICE] Detected', taskList.length, 'task(s)');

        // Process each task
        let allSuccess = true;
        for (const taskText of taskList) {
          const success = await processAndCreateTask(taskText);
          if (!success) allSuccess = false;
        }

        if (allSuccess && !showAdvanceReminderDialog) {
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
      // Detect if multiple tasks
      const taskList = await detectMultipleTasks(input);
      console.log('📝 [TEXT INPUT] Detected', taskList.length, 'task(s)');

      // Process each task
      let allSuccess = true;
      for (const taskText of taskList) {
        console.log('📝 [TEXT INPUT] Processing:', taskText);
        const success = await processAndCreateTask(taskText);
        if (!success) allSuccess = false;
      }

      setIsProcessing(false);

      if (allSuccess && !showAdvanceReminderDialog) {
        console.log('📝 [TEXT INPUT] ✅ All successful, navigating to Home');
        navigate(createPageUrl("Home"), { state: { reload: true } });
      } else {
        console.log('📝 [TEXT INPUT] ⚠️ Not navigating:', { allSuccess, showAdvanceReminderDialog });
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