import { base44 } from "@/api/base44Client";
import { buildTaskParsePrompt } from "../../../base44/shared/taskParsePrompt";
import { scheduleReminder } from "./reminderScheduler";
import dedupeSplitTasks from "./dedupeSplitTasks";
import { createBirthdayFromInput } from "./birthdayScheduler";
import { toast } from "sonner";
import { INTERVAL_MS, stripGuessedRecurrence, deriveSchedule } from "./taskSchedule";

// Every step of turning raw user input (typed, spoken, or shared) into task
// records. Pure async functions with no React state, so the pipeline can keep
// running after the user navigates away from the Add Task screen.

// Fire-and-forget diagnostic trace. Phone console logs aren't reachable, so
// each decision point is mirrored into the captureTrace function log.
export function trace(step, detail) {
  try {
    base44.functions.invoke('captureTrace', { step, detail }).catch(() => {});
  } catch (e) {}
}

// When the LLM splits a multi-task input, it sometimes drops shared date words
// like "today" from some split tasks. Propagate the original input's date word
// to any split task missing one.
function propagateDateWords(originalInput, splitTasks) {
  if (!splitTasks || splitTasks.length <= 1) return splitTasks;
  const dateWords = [
    'today', 'tomorrow', 'tonight', 'this morning', 'this afternoon',
    'this evening', 'this week', 'next week', 'this weekend', 'next weekend',
  ];
  const buildRegex = (w) => w.includes(' ')
    ? new RegExp(w.replace(/ /g, '\\s+'))
    : new RegExp(`\\b${w}\\b`);
  const lower = originalInput.toLowerCase();
  const foundWords = dateWords.filter(w => buildRegex(w).test(lower));
  if (foundWords.length !== 1) return splitTasks;
  const dateWord = foundWords[0];
  return splitTasks.map(task => {
    const hasDate = dateWords.some(w => buildRegex(w).test(task.toLowerCase()));
    return hasDate ? task : `${task} ${dateWord}`;
  });
}

export async function detectMultipleTasks(inputText) {
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

  ITINERARY / SCHEDULED EVENTS (SPLIT THESE):
  If the input is an itinerary, schedule, or plan with MULTIPLE DISTINCT TIMED EVENTS
  (travel segments, appointments, or activities at different times/locations), SPLIT
  each distinct event into its own task — even though the events are part of the same
  trip or day. Each event = a separate activity or destination with its own start time.
  - "On Sunday October 4 leave the Airbnb at 12:30 PM for Cañon City. Arrive at the Royal Gorge train depot at 2:30 PM to check in. Train runs 3:30 PM to 5:30 PM." → 2 tasks:
    1. "On Sunday October 4 leave the Airbnb at 12:30 PM for Cañon City"
    2. "On Sunday October 4 arrive at the Royal Gorge train depot at 2:30 PM to check in. Train runs 3:30 PM to 5:30 PM"
    (The 2:30 arrival/check-in and the 3:30-5:30 train ride are ONE event — same outing — so keep them together; only split distinct outings/activities. Do NOT split "check in" from "train runs" — they are the same activity.)
  - "Monday: dentist at 9am, lunch with mom at 12pm, pick up kids at 3pm" → 3 tasks (one per timed event)
  GROUPING RULE: Sub-actions that belong to the SAME outing (arriving early, check-in, the activity itself, the ride home) stay together in ONE task. Only split when there are separate activities/destinations at different times.

  NEVER OUTPUT THE SAME TASK TWICE. Each action from the input appears in the
  output EXACTLY ONCE. Do not restate an action with different wording as a
  second task, and do not add a summary/umbrella task alongside the split tasks.
  - "do the dishes" → ["do the dishes"] — NEVER ["do dishes", "do the dishes"]
  - "clean the kitchen and do the dishes" → 2 tasks ONLY if they are genuinely
    different actions; if one restates the other, return just one.
  Before returning, re-read your "tasks" array and delete any entry that means
  the same thing as another entry.

  CRITICAL: When splitting, PRESERVE any time/date words (e.g., "today", "tomorrow",
  "tonight") on EACH split task so the user's timing intent is not lost.
  - "clean the dishes and the floor today" → ["clean the dishes today", "clean the floor today"]

  PASTED CONVERSATIONS / SHARED TEXT (KEEP AS ONE):
  If the input looks like a copied text-message thread, chat, or email (multiple
  lines, back-and-forth messages, questions like "are you still down to go?", a
  bare address on its own line, timestamps, app chrome), it is describing ONE plan
  spread across several messages — return is_multiple=false with the whole text as
  the single task. Do NOT create a task per message or per line. Only split if the
  conversation genuinely covers two unrelated plans.

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
    const tasks = dedupeSplitTasks(result.tasks || [inputText]);
    return propagateDateWords(inputText, tasks);
  } catch (error) {
    console.error('🔍 [DETECT] Error detecting tasks, treating as single:', error);
    return [inputText];
  }
}

// Processes ONE task string. Resolves to a descriptor:
//   { status: 'done' }
//   { status: 'needs_priority', data }
//   { status: 'needs_date', data }
//   { status: 'needs_advance', taskData, currentUser }
//   { status: 'error', message }
export async function processAndCreateTask(inputText, opts = {}) {
  const { presetDate = null, presetDueDateISO = null } = opts;

  if (!inputText.trim()) return { status: 'error', message: 'Empty input' };

  try {
    const currentUser = await base44.auth.me();

    // Birthdays are tracked as their own thing (🎂 card), not as tasks.
    if (/birthday|bday|b-day/i.test(inputText)) {
      try {
        const birthday = await createBirthdayFromInput(inputText, currentUser.email);
        if (birthday) {
          toast.success(`🎂 Added ${birthday.person}'s birthday!`, {
            description: "We'll remind you 1 week before, the day before, and the day of — every year.",
            duration: 4000,
          });
          return { status: 'done' };
        }
      } catch (e) {
        console.error('🎂 [PROCESS] Birthday detection failed, continuing as task', e);
      }
    }

    // Does the user want ONE task WITH subtasks?
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

NOT subtasks (these are separate independent tasks OR a single event):
- "call dentist and also buy groceries" (two unrelated actions, neither is a parent of the other)
- "clean dishes and take out trash" (two equal, unrelated chores)
- A TIMED SEQUENCE of actions that form ONE event/outing is NOT subtasks — it is ONE task.
  Example: "arrive at the depot at 2:30 PM to check in. Train runs 3:30 PM to 5:30 PM" → ONE task
  (a single event with a time span), NOT a parent with subtasks. The "check in" and "train ride"
  are sequential parts of the same outing, not independent to-do items.
- Any input where the parts are connected by specific TIMES (arrive at 2:30, activity at 3:30)
  is a scheduled EVENT, not a parent-with-subtasks. Return has_subtasks=false for these.

KEY RULE: If the items listed are all INSTANCES of the same category named first, they are subtasks.
Example: "pay my bills" + list of bills = subtasks. "Buy groceries" + list of items = subtasks.
BUT: a timed itinerary (arrive → check in → activity) is ONE event, NOT subtasks.

Return JSON:
{
  "has_subtasks": true/false,
  "main_task": "concise main task title (e.g. 'Pay bills', not the full sentence)",
  "subtasks": ["subtask 1", "subtask 2", ...] (if has_subtasks, IN ORDER)
}`;

    const subtaskCheck = (await base44.functions.invoke('checkSubtasks', { prompt: subtaskCheckPrompt }))?.data?.response;
    trace('subtaskCheck', { input: inputText.slice(0, 80), result: subtaskCheck });

    if (subtaskCheck.has_subtasks && subtaskCheck.subtasks && subtaskCheck.subtasks.length > 0) {
      const now = new Date();
      // Parse the FULL input (not just the short title) so the parent keeps the
      // date, time and location the user actually gave.
      const mainTaskPrompt = buildTaskParsePrompt(inputText);
      const mainTaskParsed = (await base44.functions.invoke('parseTask', { prompt: mainTaskPrompt }))?.data?.response;
      stripGuessedRecurrence(mainTaskParsed, inputText);

      const sched = deriveSchedule(mainTaskParsed, now);
      const nextReminder = sched.nextReminder;

      const parentTask = await base44.entities.Task.create({
        title: subtaskCheck.main_task,
        original_input: inputText,
        location: mainTaskParsed.location || null,
        description: '',
        classification: mainTaskParsed.classification || 'task',
        reminder_interval: sched.interval,
        day_only_task: !!mainTaskParsed.day_only_task,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        due_date: sched.dueDateISO || presetDueDateISO,
        end_date: sched.endDateISO,
        event_time: sched.eventTimeISO,
        reminder_count: 0,
        urgency: mainTaskParsed.urgency || 'medium',
        energy_required: mainTaskParsed.energy_required || 'medium',
        status: 'active',
        notification_recipient_email: currentUser.email
      });

      // Subtasks IN ORDER — no notifications on subtasks, only the parent
      for (let si = 0; si < subtaskCheck.subtasks.length; si++) {
        await base44.entities.Task.create({
          title: subtaskCheck.subtasks[si].trim(),
          parent_task_id: parentTask.id,
          subtask_order: si + 1,
          urgency: mainTaskParsed.urgency || 'medium',
          energy_required: mainTaskParsed.energy_required || 'medium',
          status: 'active',
          reminder_interval: null,
          reminder_count: 0,
          next_reminder: null,
          notification_recipient_email: null
        });
      }

      if (nextReminder && sched.interval === 'once') {
        const { scheduleMultiReminders } = await import('./multiReminderScheduler');
        scheduleMultiReminders({
          email: currentUser.email,
          title: parentTask.title,
          scheduledDateISO: nextReminder.toISOString(),
          taskId: parentTask.id,
          urgency: parentTask.urgency,
          dayOnly: !!mainTaskParsed.day_only_task,
          classification: parentTask.classification,
        }).then(multiIds => {
          if (multiIds) base44.entities.Task.update(parentTask.id, { onesignal_notification_ids: multiIds });
        }).catch(error => console.error("Failed to schedule reminders:", error));
      } else if (nextReminder && INTERVAL_MS[sched.interval]) {
        import('./reminderScheduler').then(module => module.scheduleRecurringReminders({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${parentTask.title}\n\nTap to mark as complete!`,
          startTime: nextReminder.toISOString(),
          intervalMs: INTERVAL_MS[sched.interval],
          count: 10,
          taskId: parentTask.id,
          data: { screen: "/TaskNotification", taskId: parentTask.id, urgency: parentTask.urgency, type: 'task_reminder' },
          buttons: [
            { id: "snooze_15", text: "Snooze 15 min" },
            { id: "snooze_60", text: "Snooze 1 hour" },
            { id: "complete", text: "✅ Done" }
          ]
        })).then(({ notificationIds, lastScheduledUntil }) => {
          if (notificationIds && notificationIds.length > 0) {
            base44.entities.Task.update(parentTask.id, {
              onesignal_notification_ids: notificationIds,
              ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
            });
          }
        }).catch(error => console.error("Failed to schedule reminders:", error));
      }

      return { status: 'done' };
    }

    const now = new Date();
    const prompt = buildTaskParsePrompt(inputText);

    // Parking lot vs task
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
    trace('categoryCheck', { result: categoryCheck });

    if (categoryCheck.category === 'parking_lot') {
      if (categoryCheck.is_list && categoryCheck.items && categoryCheck.items.length > 1) {
        const mainIdea = await base44.entities.ParkingLotIdea.create({
          idea: categoryCheck.main_idea,
          converted_to_task: false,
          list_format: 'checkbox'
        });
        for (const item of categoryCheck.items) {
          await base44.entities.ParkingLotIdea.create({
            idea: item,
            parent_idea_id: mainIdea.id,
            converted_to_task: false,
            list_format: 'checkbox'
          });
        }
        toast.success('Added to Parking Lot! 📝', {
          description: `"${categoryCheck.main_idea}" with ${categoryCheck.items.length} items`,
          duration: 3000
        });
      } else {
        await base44.entities.ParkingLotIdea.create({
          idea: inputText.trim(),
          converted_to_task: false,
          list_format: 'plain'
        });
        toast.success('Added to Parking Lot! 📝', {
          description: inputText.trim().substring(0, 50) + (inputText.length > 50 ? '...' : ''),
          duration: 3000
        });
      }
      return { status: 'done' };
    }

    const parsed = (await base44.functions.invoke('parseTask', { prompt }))?.data?.response;
    trace('parsed', { title: parsed?.title, classification: parsed?.classification, target_date: parsed?.target_date });

    stripGuessedRecurrence(parsed, inputText);

    // "Add task" under a specific calendar day pins the task to that date
    if (presetDate) {
      parsed.target_date = presetDate;
      parsed.due_date = presetDate;
      if (!parsed.target_time) parsed.target_time = '09:00';
      parsed.needs_date_pick = false;
    }

    if (parsed.priority_uninferrable && parsed.is_flexible) {
      return {
        status: 'needs_priority',
        data: {
          title: parsed.title || inputText.trim(),
          original_input: inputText,
          energy_required: parsed.energy_required || 'medium',
          classification: parsed.classification || 'task',
          presetDueDateISO,
          currentUser
        }
      };
    }

    if (parsed.needs_date_pick) {
      return {
        status: 'needs_date',
        data: {
          title: parsed.title || inputText.trim(),
          original_input: inputText,
          location: parsed.location || null,
          energy_required: parsed.energy_required || 'medium',
          urgency: parsed.urgency || 'medium',
          initialDate: parsed.target_date || null,
          initialTime: parsed.target_time || null,
          classification: parsed.classification || 'task',
          end_date: parsed.end_date || null,
          presetDueDateISO,
          currentUser
        }
      };
    }

    let nextReminder = null;
    let actualReminderInterval = parsed.reminder_interval || null;

    // A specific date = a one-time thing, not a recurring task — whether or not
    // a clock time came with it (an all-day date is still just one day).
    if (parsed.target_date && (parsed.target_time || parsed.day_only_task)) {
      actualReminderInterval = 'once';
    }

    const recurringIntervals = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];

    // Multi-day events: record the last day of the span
    let endDateISO = null;
    if (actualReminderInterval === 'once' && parsed.end_date && parsed.end_date !== parsed.target_date) {
      const [ey, em, ed] = parsed.end_date.split('-').map(n => parseInt(n, 10));
      if (!isNaN(ey) && !isNaN(em) && !isNaN(ed)) {
        endDateISO = new Date(ey, em - 1, ed, 9, 0, 0, 0).toISOString();
      }
    }

    // Event time is stored separately from next_reminder so it stays visible
    // on the card even if the user later edits the reminder time.
    let eventTimeISO = null;
    if (parsed.classification === 'event' && parsed.target_date && parsed.target_time && actualReminderInterval === 'once') {
      const [vyy, vmm, vdd] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      const [vhh, vmin] = parsed.target_time.split(':').map(n => parseInt(n, 10));
      if (!isNaN(vyy) && !isNaN(vmm) && !isNaN(vdd) && !isNaN(vhh) && !isNaN(vmin)) {
        eventTimeISO = new Date(vyy, vmm - 1, vdd, vhh, vmin, 0, 0).toISOString();
      }
    }

    if (parsed.day_only_task && parsed.target_date && actualReminderInterval === 'once') {
      const [y, m, d] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      nextReminder = new Date(y, m - 1, d, 9, 0, 0, 0);
      if (nextReminder <= new Date(now.getTime() + 2 * 60 * 1000)) nextReminder = null;
    } else if (parsed.target_date && parsed.target_time && actualReminderInterval === 'once') {
      const [year, month, day] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = parsed.target_time.split(':').map(n => parseInt(n, 10));
      const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      nextReminder = targetDate <= new Date(now.getTime() + 2 * 60 * 1000) ? null : targetDate;
      actualReminderInterval = 'once';

      const oneDayFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      if (nextReminder && nextReminder >= oneDayFromNow) {
        // 1+ day out — the caller asks the user about an advance reminder.
        return {
          status: 'needs_advance',
          currentUser,
          taskData: {
            title: parsed.title || inputText.trim(),
            original_input: inputText,
            location: parsed.location || null,
            description: '',
            classification: parsed.classification || 'task',
            reminder_interval: actualReminderInterval,
            reminder_count: 0,
            next_reminder: nextReminder.toISOString(),
            end_date: endDateISO,
            event_time: eventTimeISO,
            urgency: parsed.urgency || 'medium',
            energy_required: parsed.energy_required || 'medium',
            status: 'active',
            notification_recipient_email: currentUser.email
          }
        };
      }
    } else if (parsed.reminder_interval && recurringIntervals.includes(parsed.reminder_interval)) {
      nextReminder = new Date(now.getTime() + INTERVAL_MS[parsed.reminder_interval]);
    } else {
      nextReminder = null;
    }

    let dueDateISO = null;
    if (parsed.due_date && actualReminderInterval !== 'once') {
      // Honors deadlines for recurring-interval AND smart-nudge tasks
      const [dy, dm, dd] = parsed.due_date.split('-').map(n => parseInt(n, 10));
      if (!isNaN(dy) && !isNaN(dm) && !isNaN(dd)) {
        dueDateISO = new Date(dy, dm - 1, dd, 23, 59, 0, 0).toISOString();
      }
    } else if (parsed.day_only_task && parsed.target_date && actualReminderInterval === 'once') {
      const [dy, dm, dd] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      if (!isNaN(dy) && !isNaN(dm) && !isNaN(dd)) {
        dueDateISO = new Date(dy, dm - 1, dd, 23, 59, 0, 0).toISOString();
      }
    }

    trace('mainCreate', { title: parsed.title || inputText.trim(), interval: actualReminderInterval });
    const createdTask = await base44.entities.Task.create({
      title: parsed.title || inputText.trim(),
      original_input: inputText,
      location: parsed.location || null,
      description: '',
      classification: parsed.classification || 'task',
      reminder_interval: actualReminderInterval,
      day_only_task: !!parsed.day_only_task,
      deadline_style: parsed.deadline_style === 'by' ? 'by' : 'on',
      recurrence_pattern: parsed.recurrence_pattern || 'none',
      reminder_count: 0,
      next_reminder: nextReminder ? nextReminder.toISOString() : null,
      due_date: dueDateISO,
      end_date: endDateISO,
      event_time: eventTimeISO,
      urgency: parsed.urgency || 'medium',
      energy_required: parsed.energy_required || 'medium',
      status: 'active',
      notification_recipient_email: currentUser.email
    });

    // Never schedule a reminder in the past or immediate
    if (nextReminder && nextReminder <= new Date(now.getTime() + 2 * 60 * 1000)) {
      nextReminder = (actualReminderInterval && actualReminderInterval !== 'once' && INTERVAL_MS[actualReminderInterval])
        ? new Date(now.getTime() + INTERVAL_MS[actualReminderInterval])
        : null;
    }

    if (nextReminder) {
      if (actualReminderInterval === 'once') {
        import('./multiReminderScheduler')
          .then(module => module.scheduleMultiReminders({
            email: currentUser.email,
            title: createdTask.title,
            scheduledDateISO: nextReminder.toISOString(),
            taskId: createdTask.id,
            urgency: createdTask.urgency,
            dayOnly: !!parsed.day_only_task,
            deadlineStyle: parsed.deadline_style === 'by' ? 'by' : 'on',
            classification: createdTask.classification,
          }))
          .then(multiIds => {
            if (multiIds) {
              base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: multiIds });
              return;
            }
            return scheduleReminder({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: `${createdTask.title}\n\nTap to mark as complete!`,
              sendAtISO: nextReminder.toISOString(),
              taskId: createdTask.id,
              data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: createdTask.urgency, type: 'task_reminder' },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            }).then(notificationId => {
              if (notificationId) {
                base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: [notificationId] });
              }
            });
          })
          .catch(error => console.error("Failed to schedule reminder:", error));
      } else if (INTERVAL_MS[actualReminderInterval]) {
        import('./reminderScheduler').then(module => module.scheduleRecurringReminders({
          email: currentUser.email,
          title: "Task Reminder 📋",
          body: `${createdTask.title}\n\nTap to mark as complete!`,
          startTime: nextReminder.toISOString(),
          intervalMs: INTERVAL_MS[actualReminderInterval],
          count: 10,
          taskId: createdTask.id,
          data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: createdTask.urgency, type: 'task_reminder' },
          buttons: [
            { id: "snooze_15", text: "Snooze 15 min" },
            { id: "snooze_60", text: "Snooze 1 hour" },
            { id: "complete", text: "✅ Done" }
          ]
        })).then(({ notificationIds, lastScheduledUntil }) => {
          if (notificationIds && notificationIds.length > 0) {
            base44.entities.Task.update(createdTask.id, {
              onesignal_notification_ids: notificationIds,
              ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
            });
          }
        }).catch(error => console.error("Failed to schedule recurring reminders:", error));
      }
    }

    return { status: 'done' };
  } catch (error) {
    console.error('🔄 [PROCESS] Error:', error);
    trace('processError', { message: String(error?.message || error) });
    return { status: 'error', message: error.message };
  }
}

// Creates one advance-eligible task with the user's chosen lead time.
export async function createAdvanceTask(taskData, currentUser, minutesBefore) {
  const eventTime = new Date(taskData.next_reminder);
  const reminderTime = minutesBefore > 0
    ? new Date(eventTime.getTime() - (minutesBefore * 60 * 1000))
    : eventTime;

  const effectiveReminderTime = reminderTime.getTime() <= Date.now() + 2 * 60 * 1000
    ? eventTime
    : reminderTime;

  const createdTask = await base44.entities.Task.create({
    ...taskData,
    next_reminder: effectiveReminderTime.toISOString(),
  });

  if (effectiveReminderTime.getTime() > Date.now()) {
    try {
      const notificationId = await scheduleReminder({
        email: currentUser.email,
        title: minutesBefore > 0 ? "📋 Upcoming Task" : "Task Reminder 📋",
        body: minutesBefore > 0
          ? `In ${minutesBefore >= 60 ? `${minutesBefore / 60} hour${minutesBefore > 60 ? 's' : ''}` : `${minutesBefore} min`}: ${createdTask.title}\n\nTap to view details.`
          : `${createdTask.title}\n\nTap to mark as complete!`,
        sendAtISO: effectiveReminderTime.toISOString(),
        taskId: createdTask.id,
        data: {
          screen: "/TaskNotification",
          taskId: createdTask.id,
          urgency: createdTask.urgency,
          type: minutesBefore > 0 ? 'advance_reminder' : 'task_reminder'
        },
        buttons: [
          { id: "snooze_15", text: "Snooze 15 min" },
          { id: "snooze_60", text: "Snooze 1 hour" },
          { id: "complete", text: "✅ Done" }
        ]
      });
      if (notificationId) {
        base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: [notificationId] });
      }
    } catch (error) {
      console.error("Failed to schedule reminder:", error);
    }
  }
  return createdTask;
}

// Priority sets URGENCY ONLY — the smart nudge cron decides when to remind.
export async function createTaskWithPriority(data, priority) {
  const urgency = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
  return base44.entities.Task.create({
    title: data.title,
    original_input: data.original_input || null,
    description: '',
    classification: data.classification || 'task',
    reminder_interval: null,
    due_date: data.presetDueDateISO || null,
    reminder_count: 0,
    next_reminder: null,
    urgency,
    energy_required: data.energy_required,
    status: 'active',
    notification_recipient_email: data.currentUser.email
  });
}

export async function createTaskWithDate(data, date, time) {
  const [year, month, day] = date.split('-').map(n => parseInt(n, 10));
  const [hours, minutes] = time.split(':').map(n => parseInt(n, 10));
  const nextReminder = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (nextReminder <= new Date(Date.now() + 2 * 60 * 1000)) {
    throw new Error('The selected time is in the past or too soon.');
  }

  let endDateISO = null;
  if (data.end_date && data.end_date !== date && data.end_date >= date) {
    const [ey, em, ed] = data.end_date.split('-').map(n => parseInt(n, 10));
    if (!isNaN(ey) && !isNaN(em) && !isNaN(ed)) {
      endDateISO = new Date(ey, em - 1, ed, 9, 0, 0, 0).toISOString();
    }
  }

  const createdTask = await base44.entities.Task.create({
    title: data.title,
    original_input: data.original_input || null,
    location: data.location || null,
    description: '',
    classification: data.classification || 'task',
    reminder_interval: 'once',
    reminder_count: 0,
    next_reminder: nextReminder.toISOString(),
    end_date: endDateISO,
    urgency: data.urgency,
    energy_required: data.energy_required,
    status: 'active',
    notification_recipient_email: data.currentUser.email
  });

  const { scheduleMultiReminders } = await import('./multiReminderScheduler');
  const multiIds = await scheduleMultiReminders({
    email: data.currentUser.email,
    title: createdTask.title,
    scheduledDateISO: nextReminder.toISOString(),
    taskId: createdTask.id,
    urgency: data.urgency,
    classification: data.classification || 'task',
  });

  if (multiIds) {
    base44.entities.Task.update(createdTask.id, { onesignal_notification_ids: multiIds });
  } else {
    scheduleReminder({
      email: data.currentUser.email,
      title: "Task Reminder 📋",
      body: `${createdTask.title}\n\nTap to mark as complete!`,
      sendAtISO: nextReminder.toISOString(),
      taskId: createdTask.id,
      data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: data.urgency, type: 'task_reminder' },
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

  return createdTask;
}

// "Any day" = no fixed clock time. If a day was already known, keep it as a
// day-only due date so the date the user actually said isn't thrown away.
export async function createTaskAnyDay(data) {
  let anyDayDueISO = data.presetDueDateISO || null;
  let dayOnly = false;
  if (data.initialDate) {
    const [ay, am, ad] = data.initialDate.split('-').map(n => parseInt(n, 10));
    if (!isNaN(ay) && !isNaN(am) && !isNaN(ad)) {
      anyDayDueISO = new Date(ay, am - 1, ad, 23, 59, 0, 0).toISOString();
      dayOnly = true;
    }
  }

  return base44.entities.Task.create({
    title: data.title,
    original_input: data.original_input || null,
    location: data.location || null,
    description: '',
    classification: data.classification || 'task',
    reminder_interval: null,
    due_date: anyDayDueISO,
    day_only_task: dayOnly,
    reminder_count: 0,
    next_reminder: null,
    urgency: data.urgency,
    energy_required: data.energy_required,
    status: 'active',
    notification_recipient_email: data.currentUser.email
  });
}