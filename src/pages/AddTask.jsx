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
import PriorityPickerDialog from "../components/tasks/PriorityPickerDialog";

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
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [pendingPriorityTask, setPendingPriorityTask] = useState(null);

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

  CRITICAL RULE: Two UNRELATED actions = SPLIT. Related/dependent parts = KEEP AS ONE.

  Check if the second part DEPENDS on the first:
  - Uses pronouns (them, they, it, her, him) referring to first part? → ONE task
  - Requires context from first part to make sense? → ONE task
  - Completely unrelated actions that can be done independently? → SPLIT

  Examples of MULTIPLE independent tasks (SPLIT THESE):
  - "clean the dishes and take out the trash" → 2 tasks (unrelated chores)
  - "call dentist and pay rent" → 2 tasks (completely different)
  - "buy milk, call mom, and do laundry" → 3 tasks (all independent)
  - "water the plants and schedule dentist appointment" → 2 tasks (unrelated)

  Examples of SINGLE task (KEEP AS ONE):
  - "call the mini place and ask them to send recommendations" → ONE ("them" = mini place)
  - "text Sarah and see if she wants to meet up" → ONE ("she" = Sarah)
  - "open the document and add the notes" → ONE (same document)
  - "call dentist about my tooth pain" → ONE (additional detail)
  - "buy milk and eggs" → ONE (same shopping trip)

  Return JSON:
  {
  "is_multiple": true/false,
  "tasks": ["task 1", "task 2", ...] (if multiple) or ["original input"] (if single)
  }`;

    try {
      const result = (await base44.functions.invoke('detectMultipleTasks', { prompt: multiTaskPrompt }))?.data?.response;

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
      
      // FIRST: Check if user wants a task with subtasks
      const subtaskCheckPrompt = `Analyze this input: "${inputText}"

Does the user want to create ONE main task WITH subtasks/steps?

STRONG signals for ONE TASK WITH SUBTASKS:
- User names a category/goal and then lists specific items under it
- "I need to pay all my bills: electric, rent, insurance" → main: "Pay bills", subtasks: [electric, rent, insurance]
- "I need to pay all my bills and then listed the bills [electric, rent, insurance]" → main: "Pay bills", subtasks: each bill
- "grocery shopping: milk, eggs, bread" → main: "Grocery shopping", subtasks: each item
- "clean the house: kitchen, bathroom, vacuum" → main: "Clean the house", subtasks: each room
- "prepare for meeting with steps: review slides, print handouts" → main: "Prepare for meeting", subtasks: steps
- "call dentist and then schedule appointment and then confirm insurance" → main task with sequential steps
- ANY time items are listed as children of a main goal/action

NOT subtasks (these are separate independent tasks):
- "call dentist and also buy groceries" (two unrelated actions, neither is a parent of the other)
- "clean dishes and take out trash" (two equal, unrelated chores)

KEY RULE: If the items listed are all INSTANCES of the same category named first, they are subtasks.
Example: "pay my bills" + list of bills = subtasks. "Buy groceries" + list of items = subtasks.

Return JSON:
{
  "has_subtasks": true/false,
  "main_task": "concise main task title (e.g. 'Pay bills', not the full sentence)",
  "subtasks": ["subtask 1", "subtask 2", ...] (if has_subtasks, IN ORDER)
}`;

      const subtaskCheck = (await base44.functions.invoke('checkSubtasks', { prompt: subtaskCheckPrompt }))?.data?.response;

      console.log('🔄 [PROCESS] Subtask check:', subtaskCheck);

      // If user wants subtasks, create parent + subtasks
      if (subtaskCheck.has_subtasks && subtaskCheck.subtasks && subtaskCheck.subtasks.length > 0) {
        console.log('🔄 [PROCESS] Creating task with subtasks...');
        
        // Parse the main task for timing/priority
        const now = new Date();
        const today = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const mainTaskPrompt = `Parse this main task: "${subtaskCheck.main_task}"

TODAY IS: ${today}
CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}

Extract urgency, energy, and reminder strategy for the MAIN task (not subtasks).

REMINDER STRATEGY:
- Important obligations (pay bills, submit work, call someone important) → reminder_interval="2hours" (keep reminding until done)
- Hard deadlines or work tasks → reminder_interval="1hour" or "2hours"
- Daily habits/routines → reminder_interval="daily"
- Low-stakes one-time things → reminder_interval="once" (but prefer recurring for important tasks)

Bills, financial tasks, work obligations = ALWAYS recurring at "2hours".

SMART INFERENCE (when user does NOT specify a time, frequency, or date):
- PERISHABLE / TIME-SENSITIVE (food, laundry, meds, cooking, pets) → reminder_interval="2hours", urgency="high"
- HARD DEADLINE / IMPORTANT OBLIGATION (pay rent, submit form, financial/legal) → reminder_interval="1hour" or "2hours", urgency="high"
- ROUTINE / HABIT (stretch, vitamins, wellness, daily chores) → reminder_interval="daily", urgency="low" or "medium"
- General fallback → reminder_interval="2hours", urgency="medium"

JSON:
{
  "urgency": "low|medium|high|urgent",
  "energy_required": "low|medium|high",
  "reminder_interval": "1hour|2hours|daily|every_other_day|once"
}`;

        const mainTaskParsed = (await base44.functions.invoke('parseMainTask', { prompt: mainTaskPrompt }))?.data?.response;

        // Calculate next_reminder for parent task
        let nextReminder = null;
        const intervalMs = {
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        if (mainTaskParsed.reminder_interval && intervalMs[mainTaskParsed.reminder_interval]) {
          nextReminder = new Date(now.getTime());
          switch (mainTaskParsed.reminder_interval) {
            case '30min': nextReminder.setMinutes(nextReminder.getMinutes() + 30); break;
            case '1hour': nextReminder.setHours(nextReminder.getHours() + 1); break;
            case '2hours': nextReminder.setHours(nextReminder.getHours() + 2); break;
            case 'daily': nextReminder.setDate(nextReminder.getDate() + 1); break;
            case 'every_other_day': nextReminder.setDate(nextReminder.getDate() + 2); break;
          }
        }

        // Create parent task
        const parentTask = await base44.entities.Task.create({
          title: subtaskCheck.main_task,
          description: '',
          reminder_interval: mainTaskParsed.reminder_interval || '1hour',
          reminder_count: 0,
          next_reminder: nextReminder ? nextReminder.toISOString() : null,
          urgency: mainTaskParsed.urgency || 'medium',
          energy_required: mainTaskParsed.energy_required || 'medium',
          status: 'active',
          notification_recipient_email: currentUser.email
        });

        console.log('🔄 [PROCESS] ✅ Parent task created:', parentTask.id);

        // Create subtasks IN ORDER — no notifications on subtasks, only parent gets reminded
        for (let si = 0; si < subtaskCheck.subtasks.length; si++) {
          await base44.entities.Task.create({
            title: subtaskCheck.subtasks[si].trim(),
            parent_task_id: parentTask.id,
            urgency: mainTaskParsed.urgency || 'medium',
            energy_required: mainTaskParsed.energy_required || 'medium',
            status: 'active',
            reminder_interval: null,
            reminder_count: 0,
            next_reminder: null,
            notification_recipient_email: null
          });
        }

        console.log('🔄 [PROCESS] ✅ Created', subtaskCheck.subtasks.length, 'subtasks');

        // Schedule reminders if needed
        if (nextReminder && intervalMs[mainTaskParsed.reminder_interval || '1hour']) {
          import('../components/utils/reminderScheduler').then(module => {
            return module.scheduleRecurringReminders({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${parentTask.title}\n\nTap to mark as complete!`,
              startTime: nextReminder.toISOString(),
              intervalMs: intervalMs[mainTaskParsed.reminder_interval || '1hour'],
              count: 10,
              taskId: parentTask.id,
              data: {
                screen: "/TaskNotification",
                taskId: parentTask.id,
                urgency: parentTask.urgency,
                type: 'task_reminder'
              },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            });
          }).then(({ notificationIds, lastScheduledUntil }) => {
            if (notificationIds && notificationIds.length > 0) {
              base44.entities.Task.update(parentTask.id, {
                onesignal_notification_ids: notificationIds,
                ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
              });
            }
          }).catch(error => {
            console.error("Failed to schedule reminders:", error);
          });
        }

        console.log('🔄 [PROCESS] ========== SUCCESS WITH SUBTASKS ==========');
        return true;
      }
      
      const now = new Date();
      const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      const prompt = `Parse task: "${inputText}"

      TODAY IS: ${todayISO} (YYYY-MM-DD)
      TOMORROW IS: ${tomorrowISO} (YYYY-MM-DD)
      CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}

      TITLE EXTRACTION RULES (CRITICAL):
      - ALWAYS strip the outer "remind me to" or "remind me" wrapper from the title.
      - The title should be the actual action the user needs to do, not the meta-instruction.
      - Examples:
        "remind me to call dentist tomorrow" → title: "Call dentist"
        "remind me to remind my dad to check the door tomorrow" → title: "Remind dad to check the door"
        "remind me to take my medicine" → title: "Take medicine"
      - Keep the inner action intact; only strip the outermost "remind me to" phrase.
      - Capitalize the first word. Remove time/date references from the title.

      TIMING RULES:

      "in X" vs "every X":
      - If user says "in 10 minutes" or "in 1 hour" → ONE-TIME ONLY
        Set: reminder_interval="once", target_date=TODAY, target_time=CALCULATED_TIME
      - If user says "every 10 minutes" or "every hour" → RECURRING
        Set: reminder_interval="10min" or "1hour", no target_date/target_time

      "tomorrow" with NO specific time:
      - Set: reminder_interval="once", target_date=TOMORROW, target_time="09:00"
      - This is a one-time reminder at 9am tomorrow, NOT a daily recurring task.

      "tomorrow at X":
      - Set: reminder_interval="once", target_date=TOMORROW, target_time=<specified time>

      SPECIFIC DAY-OF-MONTH (CRITICAL — this is commonly missed):
      - "on the 28th", "by the 28th", "the 28th" → ONE-TIME, reminder_interval="once"
        → target_date = current month + that day number, format YYYY-MM-DD
        → If that day has already passed this month, use next month
        → target_time = "09:00" unless a time is also specified
        → Example: today is ${todayISO}, "pay zx4rr on the 28th" → target_date="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28", reminder_interval="once", target_time="09:00"
      - "on the 1st", "by the 15th" → same logic

      Other rules:
      - "at 2pm" → ONE-TIME, reminder_interval="once", target_time="14:00"
      - "daily"/"every day" → reminder_interval="daily"
      - "every other day" → reminder_interval="every_other_day"

      REMINDER STRATEGY (when user does NOT specify a time):

      STEP 1 — Decide: is this RECURRING or ONE-TIME?

      RECURRING (keep reminding until done):
      - Important obligations that need to get done: paying bills, submitting reports, calling someone important, taking medicine, deadlines
      - Anything where forgetting has real consequences
      - Habits or routines: "walk the dog every day", "take vitamins"
      - Use: reminder_interval = "2hours", "daily", or "every_other_day" (NO target_date/target_time)
      - Examples:
        "pay my electric bill" → reminder_interval="2hours" (important, needs doing today)
        "pay rent" → reminder_interval="2hours" (urgent financial obligation)
        "submit the report" → reminder_interval="1hour" (work deadline, high stakes)
        "call the doctor" → reminder_interval="2hours" (health-related, important)
        "take my medication" → reminder_interval="daily"
        "finish project by Friday" → reminder_interval="2hours"

      ONE-TIME (single notification, then done):
      - User explicitly mentions a time: "at 3pm", "tomorrow morning", "in 2 hours"
      - Low-stakes reminders where one nudge is enough: "pick up cookies", "find the pasta", "check the mail"
      - Things tied to a specific moment: "make lunch tomorrow", "reminder for my dentist at 2pm"
      - Use: reminder_interval="once", target_date=YYYY-MM-DD, target_time=HH:MM
      - Examples:
        "remind me to make lunch tomorrow" → once, target_date=TOMORROW, target_time="11:00"
        "pick up cookies" → once, target_date=TODAY, target_time="18:00" (end of day nudge)
        "remind me at 5pm to call John" → once, target_date=TODAY, target_time="17:00"
        "find the pasta" → once, target_date=TODAY, target_time="17:00" (low stakes, one nudge)

      STEP 2 — Pick the right interval for recurring tasks:
      - "2hours" → important tasks needing to be done today (bills, deadlines, work tasks)
      - "1hour" → very urgent/time-sensitive work tasks with hard deadlines
      - "daily" → habits, routines, or things due in a few days
      - "every_other_day" → lower-importance ongoing things

      NEVER set target_time to the current moment unless user said "now" or "right now".

      SMART PRIORITY SUGGESTIONS:
      - Time-sensitive or deadline-based → "urgent" or "high"
      - Important but flexible → "high" or "medium"
      - Routine maintenance → "medium"
      - Nice-to-have → "low"

      SMART INFERENCE (when user does NOT specify a time, frequency, or date):
      Infer the best reminder_interval and urgency from the NATURE of the task:

      PERISHABLE / TIME-SENSITIVE (degrades or has consequences if delayed):
      - Food/perishables: "move food to freezer", "put leftovers in fridge", "defrost chicken"
      - Laundry: "move laundry to dryer", "take clothes out of washer"
      - Medication: "take meds", "take medicine", "take antibiotics"
      - Cooking: "check on the oven", "stir the pot", "flip the food"
      - Pets/plants: "feed the cat", "water the plants"
      - → reminder_interval="2hours", urgency="high"

      HARD DEADLINE / IMPORTANT OBLIGATION (serious consequences if missed):
      - Financial: "pay rent", "pay electric bill", "transfer money", "pay credit card"
      - Legal/admin: "submit form", "file taxes", "renew license", "submit application"
      - Work: "submit report", "send email to boss", "turn in project"
      - Appointments: "call doctor", "confirm appointment", "reschedule meeting"
      - → reminder_interval="1hour" if deadline is today or tomorrow, otherwise "2hours", urgency="high"

      ROUTINE / HABIT (recurring wellness or maintenance, low urgency):
      - Wellness: "stretch", "take vitamins", "drink water", "meditate", "do pushups"
      - Chores: "make bed", "water plants", "tidy desk"
      - → reminder_interval="daily", urgency="low" or "medium"

      GENERAL FALLBACK (none of the above):
      - → reminder_interval="2hours", urgency="medium"

      PRIORITY UNINFERRABLE & FLEXIBLE TASKS:
      If the task does NOT fit any SMART INFERENCE category above (not perishable, not a hard deadline, not a routine/habit) AND no specific time/date/frequency is mentioned:
      - Set priority_uninferrable=true
      - Set is_flexible=true (task can be done any day)
      - Set urgency=null and reminder_interval=null
      - The app will ask the user to pick a priority

      If the task DOES fit a SMART INFERENCE category, or has a specific time/date:
      - Set priority_uninferrable=false
      - Set is_flexible=false if a specific time/date/deadline is mentioned
      - Set is_flexible=true if no specific time/date is mentioned but the task fits an inference category

      Extract:
      1. Clean title (strip "remind me to/I need to/in X minutes" — keep inner action)
      2. Urgency: ALWAYS suggest (low/medium/high/urgent)
      3. Energy: ALWAYS suggest (low/medium/high)
      4. target_date: for "in X" (TODAY), "tomorrow", or specific dates — format YYYY-MM-DD
      5. target_time: for "in X" (calculate), "at X" (specific), or "tomorrow" with no time → "09:00"
      6. reminder_interval: ALWAYS provide (10min/20min/30min/1hour/2hours/4hours/daily/every_other_day/once)

      JSON:
      {
      "title": "clean title",
      "urgency": "medium",
      "energy_required": "medium",
      "target_date": "YYYY-MM-DD or null",
      "target_time": "HH:MM or null",
      "reminder_interval": "10min|20min|30min|1hour|2hours|4hours|daily|every_other_day|once",
      "priority_uninferrable": false,
      "is_flexible": false
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

      const categoryCheck = (await base44.functions.invoke('checkTaskCategory', { prompt: categoryCheckPrompt }))?.data?.response;

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
      const parsed = (await base44.functions.invoke('parseTask', { prompt }))?.data?.response;
      console.log('🔄 [PROCESS] ✅ LLM parsed:', parsed);

      // If priority can't be inferred and task is flexible, ask the user
      if (parsed.priority_uninferrable && parsed.is_flexible) {
        console.log('🔄 [PROCESS] Priority uninferrable and flexible — showing priority picker');
        setPendingPriorityTask({
          title: parsed.title || inputText.trim(),
          energy_required: parsed.energy_required || 'medium',
          currentUser
        });
        setShowPriorityPicker(true);
        return false;
      }

      console.log('🔄 [PROCESS] Calculating reminder times...');
      let nextReminder = null;
      let actualReminderInterval = parsed.reminder_interval || null;
      
      const recurringIntervals = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];

      if (parsed.target_date && parsed.target_time && actualReminderInterval === 'once') {
        // One-time reminder with specific date/time
        console.log('🔄 [PROCESS] One-time reminder with date/time');
        // Parse date components to avoid timezone issues
        const [year, month, day] = parsed.target_date.split('-').map(n => parseInt(n, 10));
        const [hours, minutes] = parsed.target_time.split(':').map(n => parseInt(n, 10));
        const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

        // Safety: if the calculated time is within 5 minutes of now (LLM hallucinated current time),
        // push it to tonight 9pm or tomorrow 9am instead
        const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        if (targetDate <= fiveMinFromNow) {
          console.log('🔄 [PROCESS] ⚠️ Target time too close to now, pushing to tonight 9pm');
          const fallback = new Date(now);
          fallback.setHours(21, 0, 0, 0);
          if (fallback <= fiveMinFromNow) {
            // Already past 9pm — use tomorrow 9am
            fallback.setDate(fallback.getDate() + 1);
            fallback.setHours(9, 0, 0, 0);
          }
          nextReminder = fallback;
        } else {
          nextReminder = targetDate;
        }
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
          case '4hours':
            nextReminder.setHours(nextReminder.getHours() + 4);
            break;
          case 'daily':
            nextReminder.setDate(nextReminder.getDate() + 1);
            break;
          case 'every_other_day':
            nextReminder.setDate(nextReminder.getDate() + 2);
            break;
        }
      } else if (actualReminderInterval === 'once' && !parsed.target_date && !parsed.target_time) {
        // LLM said "once" but gave no date/time — default to tonight 6pm or +2h if already evening
        console.log('🔄 [PROCESS] once with no date/time, defaulting to tonight 6pm');
        nextReminder = new Date(now);
        nextReminder.setHours(18, 0, 0, 0);
        if (nextReminder <= new Date(now.getTime() + 5 * 60 * 1000)) {
          nextReminder = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        }
      } else if (!parsed.reminder_interval && !parsed.target_time && !parsed.target_date) {
        // No timing specified at all - default to once in 2 hours
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
          '4hours': 4 * 60 * 60 * 1000,
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
            },
            buttons: [
              { id: "snooze_15", text: "Snooze 15 min" },
              { id: "snooze_60", text: "Snooze 1 hour" },
              { id: "complete", text: "✅ Done" }
            ]
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
              },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            });
          }).then(({ notificationIds, lastScheduledUntil }) => {
            if (notificationIds && notificationIds.length > 0) {
              base44.entities.Task.update(createdTask.id, {
                onesignal_notification_ids: notificationIds,
                ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
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
          },
          buttons: [
            { id: "snooze_15", text: "Snooze 15 min" },
            { id: "snooze_60", text: "Snooze 1 hour" },
            { id: "complete", text: "✅ Done" }
          ]
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

  const handlePriorityChoice = async (priority) => {
    if (!pendingPriorityTask) return;

    const { title, energy_required, currentUser } = pendingPriorityTask;
    setShowPriorityPicker(false);
    setIsProcessing(true);

    try {
      const priorityMap = {
        high: { interval: '2hours', urgency: 'high', intervalMs: 2 * 60 * 60 * 1000 },
        medium: { interval: '4hours', urgency: 'medium', intervalMs: 4 * 60 * 60 * 1000 },
        low: { interval: 'daily', urgency: 'low', intervalMs: 24 * 60 * 60 * 1000 },
      };

      const { interval, urgency, intervalMs } = priorityMap[priority];
      const now = new Date();
      const nextReminder = new Date(now.getTime() + intervalMs);

      const createdTask = await base44.entities.Task.create({
        title,
        description: '',
        reminder_interval: interval,
        reminder_count: 0,
        next_reminder: nextReminder.toISOString(),
        urgency,
        energy_required,
        status: 'active',
        notification_recipient_email: currentUser.email
      });

      // Schedule recurring reminders
      import('../components/utils/reminderScheduler').then(module => {
        return module.scheduleRecurringReminders({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${createdTask.title}\n\nTap to mark as complete!`,
          startTime: nextReminder.toISOString(),
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
        });
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

      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("Error creating task with priority:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setPendingPriorityTask(null);
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
    // Convert audio to base64 for transcription
    const audioBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const response = await base44.functions.invoke('transcribeAudio', {
      audio_base64: audioBase64,
      filename: `voice-${Date.now()}.webm`
    });

    if (response?.data?.text) {
        // Detect if multiple tasks
        const taskList = await detectMultipleTasks(response.data.text);
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

      <PriorityPickerDialog
        isOpen={showPriorityPicker}
        onClose={() => {
          setShowPriorityPicker(false);
          setPendingPriorityTask(null);
          setIsProcessing(false);
        }}
        onSelect={handlePriorityChoice}
      />

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