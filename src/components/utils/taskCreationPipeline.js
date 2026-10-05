import { base44 } from "@/api/base44Client";
import { buildTaskParsePrompt } from "../../../base44/shared/taskParsePrompt";
import { scheduleReminder, shouldAskQuietHoursNag, askQuietHoursNag } from "./reminderScheduler";
import { alertStyleFor } from "./widgetBridge";
import { getReminderCopy } from "./reminderCopy";
import dedupeSplitTasks from "./dedupeSplitTasks";
import { createBirthdayFromKind } from "./birthdayScheduler";
import { toast } from "@/components/ui/use-toast";
import { INTERVAL_MS, stripGuessedRecurrence, deriveSchedule, anchorToDaytime, wantsRhythmFromTime } from "./taskSchedule";
import { announceEventConflict } from "./eventConflicts";
import { commitNotificationIds } from "./notificationOwnership";
import { trackFire } from "@/lib/appTrack";

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

// Tasks that involve leaving the house are the only reason we'd need a home zip
// code (grouping nearby errands into one trip), so the zip prompt waits for one.
const ERRAND_WORDS = /\b(errand|store|grocer|groceries|shop|shopping|pick up|pickup|drop off|dropoff|post office|pharmacy|bank|gas station|target|walmart|costco|mall|dry clean|library|appointment|dentist|doctor|haircut|car wash|oil change|return)\b/i;

function maybeAskForHomeZip(text, location) {
  try {
    if (!location && !ERRAND_WORDS.test(text || '')) return;
    window.dispatchEvent(new CustomEvent('errand-task-created'));
  } catch (e) {}
}

// Every path that creates a main task says so. The one-time "how should
// reminders reach you?" ask (AlertStylePrompt) keys off the first of these.
// A rhythm with "keep reminding me until I'm done": asked, right now, whether
// it may run through quiet hours (see reminderScheduler.askQuietHoursNag).
// Returns the two booking options for scheduleRecurringReminders, and marks
// the task exempt when the answer was yes — BEFORE anything is booked, so the
// first batch is right and nothing has to be cancelled and re-booked.
async function rhythmBookingOptions(task, user) {
  const plain = { throughQuietHours: false, alarm: false };
  if (!shouldAskQuietHoursNag(task, user)) return plain;
  const yes = await askQuietHoursNag(task);
  if (!yes) return plain;
  await base44.entities.Task.update(task.id, { quiet_hours_exempt: true }).catch(() => {});
  task.quiet_hours_exempt = true;
  return { throughQuietHours: true, alarm: alertStyleFor(task, user?.alarm_mode) === 'alarm' };
}

function announceTaskCreated(task) {
  try {
    window.dispatchEvent(new CustomEvent('task-created', { detail: { task } }));
  } catch (e) {}
}

// One task or several? The prompt lives in the detectMultipleTasks function,
// the same one the outside-the-app captures (captureText) ask, so the two can
// never split differently. Send raw text and nothing else.
export async function detectMultipleTasks(inputText) {
  try {
    const result = (await base44.functions.invoke('detectMultipleTasks', { text: inputText }))?.data?.response;
    const tasks = dedupeSplitTasks(result.tasks || [inputText]);
    return propagateDateWords(inputText, tasks);
  } catch (error) {
    console.error('🔍 [DETECT] Error detecting tasks, treating as single:', error);
    return [inputText];
  }
}

// What kind of thing is this: a task, an idea for the Parking Lot, a birthday,
// something meant for ADHDone itself, or a mix of those? The prompt lives in the
// checkTaskCategory function, the same one the outside-the-app captures
// (captureText) ask, so the two can never answer differently. It is asked about
// the WHOLE capture before anything is split up or broken into steps (see
// TaskCaptureProcessor): an idea with several parts used to be split into
// several tasks, or turned into a task with steps, before anyone asked whether
// it was an idea at all. It gets the phone's own date, so "her birthday is
// tomorrow" means this person's tomorrow.
const KINDS = ['task', 'parking_lot', 'birthday', 'app_feedback', 'mixed'];
export const TASK_KIND = { category: 'task', is_list: false, main_idea: '', items: [], parts: [] };

export async function classifyCapture(text) {
  try {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = (await base44.functions.invoke('checkTaskCategory', { text, today }))?.data?.response;
    if (r && KINDS.includes(r.category)) return r;
  } catch (e) {
    console.error('[CAPTURE] What-kind-of-thing check failed, treating it as a task:', e);
  }
  // Never lose a capture: when in doubt it is a task.
  return { ...TASK_KIND };
}

// An idea: into the Parking Lot. A real list becomes a parent idea with the
// items the person wrote as checkboxes; anything else is one idea holding
// their own words.
async function saveIdeas(kind, inputText) {
  if (kind.is_list && Array.isArray(kind.items) && kind.items.length > 1) {
    const mainIdea = await base44.entities.ParkingLotIdea.create({
      idea: kind.main_idea || inputText.trim(),
      converted_to_task: false,
      list_format: 'checkbox'
    });
    for (const item of kind.items) {
      await base44.entities.ParkingLotIdea.create({
        idea: item,
        parent_idea_id: mainIdea.id,
        converted_to_task: false,
        list_format: 'checkbox'
      });
    }
    toast({
      title: 'Added to Parking Lot! 📝',
      description: `"${mainIdea.idea}" with ${kind.items.length} items`,
      duration: 3000
    });
  } else {
    await base44.entities.ParkingLotIdea.create({
      idea: inputText.trim(),
      converted_to_task: false,
      list_format: 'plain'
    });
    toast({
      title: 'Added to Parking Lot! 📝',
      description: inputText.trim().substring(0, 50) + (inputText.length > 50 ? '...' : ''),
      duration: 3000
    });
  }
  window.dispatchEvent(new Event('parking-lot-changed'));
}

// Something meant for ADHDone itself: a feature they want, something broken or
// confusing. Their words are kept in the Parking Lot so nothing is lost, and
// the app asks whether to send them to the developer (FeedbackPrompt). Nothing
// is sent unless they say yes there. A question already waiting for an answer
// is left alone rather than replaced.
async function saveAppFeedback(inputText) {
  const text = inputText.trim();
  await base44.entities.ParkingLotIdea.create({
    idea: text,
    converted_to_task: false,
    list_format: 'plain'
  });
  window.dispatchEvent(new Event('parking-lot-changed'));
  toast({
    title: 'Saved to your Parking Lot 📝',
    description: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
    duration: 3000
  });
  try {
    const me = await base44.auth.me();
    const waiting = me?.pending_feedback_prompt;
    if (waiting?.text && !waiting?.answered_at) return;
    const queued = { text: text.slice(0, 2000), queued_at: new Date().toISOString() };
    await base44.auth.updateMe({ pending_feedback_prompt: queued });
    window.dispatchEvent(new CustomEvent('feedback-prompt-queued', { detail: queued }));
  } catch (e) {
    console.error('[CAPTURE] Could not queue the send-to-the-developer question:', e);
  }
}

// Processes ONE piece of a capture. Resolves to a descriptor:
//   { status: 'done', taskId?, kind? }   (kind: 'idea' | 'feedback' | 'birthday' when it wasn't a task)
//   { status: 'needs_priority', data }
//   { status: 'needs_date', data }
//   { status: 'error', message }
export async function processAndCreateTask(inputText, opts = {}) {
  // kind: what the whole capture already turned out to be (see
  // TaskCaptureProcessor), so it isn't asked twice. Without it, this piece is
  // asked on its own (a piece of a capture that mixed several kinds).
  // skipIdeaCheck: the text is already known to be a task (a Parking Lot idea
  // the user chose to turn into one), so it can only become a task — or a
  // birthday, if that's what it is. Filing it as an idea would just put it
  // straight back into the Parking Lot.
  const { presetDate = null, presetDueDateISO = null, skipIdeaCheck = false, kind: knownKind = null } = opts;

  if (!inputText.trim()) return { status: 'error', message: 'Empty input' };

  try {
    const currentUser = await base44.auth.me();

    let kind = knownKind || await classifyCapture(inputText);
    trace('categoryCheck', { result: kind });
    // Already split once: a piece that still reads as a mix is handled as a task.
    if (kind.category === 'mixed') kind = TASK_KIND;
    if (skipIdeaCheck && kind.category !== 'birthday') kind = TASK_KIND;

    // Birthdays are tracked as their own thing (🎂 card), not as tasks. With no
    // usable day (or no name) it carries on as a task instead of being lost.
    if (kind.category === 'birthday') {
      try {
        const birthday = await createBirthdayFromKind(kind, inputText, currentUser.email);
        if (birthday) {
          toast({
            title: birthday.own ? '🎂 Added your birthday!' : `🎂 Added ${birthday.person}'s birthday!`,
            description: birthday.own
              ? "We'll wish you a happy birthday on the day, every year."
              : "We'll remind you 1 week before, the day before, and the day of — every year.",
            duration: 4000,
          });
          return { status: 'done', kind: 'birthday' };
        }
      } catch (e) {
        console.error('🎂 [PROCESS] Saving the birthday failed, continuing as task', e);
      }
    }

    if (kind.category === 'parking_lot') {
      await saveIdeas(kind, inputText);
      toast({ title: '💡 Saved to your Parking Lot', duration: 1500 });
      return { status: 'done', kind: 'idea' };
    }

    if (kind.category === 'app_feedback') {
      await saveAppFeedback(inputText);
      return { status: 'done', kind: 'feedback' };
    }

    // Should it get a checklist of steps? The prompt lives in the checkSubtasks
    // function; send raw text and nothing else. A failed check just means no
    // steps: the task itself must still be made.
    const subtaskCheck = (await base44.functions.invoke('checkSubtasks', { text: inputText })
      .catch((e) => { console.error('[PROCESS] Steps check failed, carrying on without steps:', e); return null; }))?.data?.response || {};
    trace('subtaskCheck', { input: inputText.slice(0, 80), result: subtaskCheck });

    if (subtaskCheck.has_subtasks && subtaskCheck.subtasks && subtaskCheck.subtasks.length > 0) {
      const now = new Date();
      // Parse the FULL input (not just the short title) so the parent keeps the
      // date, time and location the user actually gave.
      const mainTaskPrompt = buildTaskParsePrompt(inputText);
      const mainTaskParsed = (await base44.functions.invoke('parseTask', { prompt: mainTaskPrompt }))?.data?.response;
      trace('parsed', { title: mainTaskParsed?.title, classification: mainTaskParsed?.classification, target_date: mainTaskParsed?.target_date, due_date: mainTaskParsed?.due_date, deadline_style: mainTaskParsed?.deadline_style });
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
        deadline_style: mainTaskParsed.deadline_style === 'by' ? 'by' : 'on',
        follow_up_title: mainTaskParsed.follow_up_title || null,
        follow_up_minutes: mainTaskParsed.follow_up_minutes || null,
        reminder_wish: mainTaskParsed.reminder_wish || null,
        anchor_time: mainTaskParsed.target_time || null,
        next_reminder: nextReminder ? nextReminder.toISOString() : null,
        due_date: sched.dueDateISO || presetDueDateISO,
        end_date: sched.endDateISO,
        event_time: sched.eventTimeISO,
        reminder_count: 0,
        urgency: mainTaskParsed.urgency || 'medium',
        energy_required: mainTaskParsed.energy_required || 'medium',
        takes_time: mainTaskParsed.takes_time === true,
        life_area: mainTaskParsed.life_area === 'work' ? 'work' : 'personal',
        status: 'active',
        notification_recipient_email: currentUser.email,
        // Reminders are booked fire-and-forget below; this tells the refill
        // cron to stay out until the ids land (see commitNotificationIds).
        reminder_scheduling_since: nextReminder ? new Date().toISOString() : null
      });

      maybeAskForHomeZip(`${subtaskCheck.main_task} ${inputText}`, mainTaskParsed.location);
      announceTaskCreated(parentTask);
      const madeTaskId = parentTask.id;

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
          deadlineStyle: mainTaskParsed.deadline_style === 'by' ? 'by' : 'on',
          classification: parentTask.classification,
          reminderWish: mainTaskParsed.reminder_wish || null,
        }).then(multiIds => {
          return commitNotificationIds(parentTask.id, multiIds || []);
        }).catch(error => console.error("Failed to schedule reminders:", error));
      } else if (nextReminder && INTERVAL_MS[sched.interval]) {
        rhythmBookingOptions(parentTask, currentUser).then((opts) => import('./reminderScheduler').then(module => module.scheduleRecurringReminders({
          ...opts,
          email: currentUser.email,
          ...getReminderCopy(parentTask, nextReminder),
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
        }))).then(({ notificationIds, lastScheduledUntil }) => {
          return commitNotificationIds(parentTask.id, notificationIds || [],
            lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {});
        }).catch(error => console.error("Failed to schedule reminders:", error));
      }

      return { status: 'done', taskId: madeTaskId };
    }

    const now = new Date();
    const prompt = buildTaskParsePrompt(inputText);

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
          reminder_wish: parsed.reminder_wish || null,
          energy_required: parsed.energy_required || 'medium',
          takes_time: parsed.takes_time === true,
          classification: parsed.classification || 'task',
          life_area: parsed.life_area === 'work' ? 'work' : 'personal',
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
          reminder_wish: parsed.reminder_wish || null,
          location: parsed.location || null,
          energy_required: parsed.energy_required || 'medium',
          urgency: parsed.urgency || 'medium',
          initialDate: parsed.target_date || null,
          initialTime: parsed.target_time || null,
          classification: parsed.classification || 'task',
          takes_time: parsed.takes_time === true,
          life_area: parsed.life_area === 'work' ? 'work' : 'personal',
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
    // "At 10 am, keep reminding me until I finish": the user asked for a
    // rhythm AND named a time. The time is where the pings start, not the one
    // and only ping (same rule as taskSchedule.deriveSchedule and the server).
    const rhythmFromTime = wantsRhythmFromTime(parsed);
    if (rhythmFromTime) actualReminderInterval = parsed.reminder_interval;

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

    if (rhythmFromTime) {
      const [year, month, day] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = parsed.target_time.split(':').map(n => parseInt(n, 10));
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
      // First ping at the named time; if it has already gone by, one interval from now.
      nextReminder = startAt > new Date(now.getTime() + 2 * 60 * 1000 + 5000)
        ? startAt
        : new Date(now.getTime() + INTERVAL_MS[actualReminderInterval]);
    } else if (parsed.day_only_task && parsed.target_date && actualReminderInterval === 'once') {
      const [y, m, d] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      nextReminder = new Date(y, m - 1, d, 9, 0, 0, 0);
      if (nextReminder <= new Date(now.getTime() + 2 * 60 * 1000)) nextReminder = null;
    } else if (parsed.target_date && parsed.target_time && actualReminderInterval === 'once') {
      const [year, month, day] = parsed.target_date.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = parsed.target_time.split(':').map(n => parseInt(n, 10));
      const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      // "in 1 minute" / "in a couple minutes" lands inside the 2-minute
      // scheduling floor. Nulling it here threw the user's time away entirely —
      // the task saved with no date at all. Nudge it just past the floor
      // instead, and only discard a time that's genuinely well in the past.
      const floor = new Date(now.getTime() + 2 * 60 * 1000 + 5000);
      if (targetDate > floor) {
        nextReminder = targetDate;
      } else if (targetDate.getTime() > now.getTime() - 30 * 60 * 1000) {
        nextReminder = floor;
      } else {
        nextReminder = null;
      }
      actualReminderInterval = 'once';

      // A timed task a day or more out used to stop here and ask "would you
      // like an advance reminder?" (30 min / 1 hour / 1 day), then book only
      // what was tapped — skipping the planned schedule and, for a repeating
      // task, dropping its recurrence on the floor. Now it goes through the
      // same planning as every other timed task, and the planner decides on
      // its own whether this is the kind of thing that deserves a heads-up.
    } else if (parsed.reminder_interval && recurringIntervals.includes(parsed.reminder_interval)) {
      nextReminder = anchorToDaytime(new Date(now.getTime() + INTERVAL_MS[parsed.reminder_interval]), parsed.reminder_interval);
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
      recurrence_days: Array.isArray(parsed.recurrence_days) && parsed.recurrence_days.length ? parsed.recurrence_days : null,
      // The next step this chore leads to, scheduled the moment the task is
      // marked done (server side, on completion).
      follow_up_title: parsed.follow_up_title || null,
      follow_up_minutes: parsed.follow_up_minutes || null,
      // The user's own words about how to remind them, and the clock time they
      // named (each new occurrence of a recurring task starts there).
      reminder_wish: parsed.reminder_wish || null,
      anchor_time: parsed.target_time || null,
      reminder_count: 0,
      next_reminder: nextReminder ? nextReminder.toISOString() : null,
      due_date: dueDateISO,
      end_date: endDateISO,
      event_time: eventTimeISO,
      urgency: parsed.urgency || 'medium',
      energy_required: parsed.energy_required || 'medium',
      takes_time: parsed.takes_time === true,
      life_area: parsed.life_area === 'work' ? 'work' : 'personal',
      status: 'active',
      notification_recipient_email: currentUser.email,
      reminder_scheduling_since: nextReminder ? new Date().toISOString() : null
    });

    maybeAskForHomeZip(`${createdTask.title} ${inputText}`, parsed.location);
    announceEventConflict(createdTask);
    announceTaskCreated(createdTask);

    // Was this task born with anything that will ever nudge the user? A task
    // created with no time, no interval and no due date is silent forever, and
    // that is the single most important thing to be able to count.
    trackFire('task_created', {
      props: {
        classification: createdTask.classification || 'task',
        urgency: createdTask.urgency,
        interval: actualReminderInterval || 'none',
        has_reminder: !!nextReminder,
        has_due_date: !!dueDateISO,
        day_only: !!parsed.day_only_task,
        silent: !nextReminder && !dueDateISO,
        input_words: (inputText || '').trim().split(/\s+/).length,
      },
    });

    // Never schedule a reminder in the past or immediate
    if (nextReminder && nextReminder <= new Date(now.getTime() + 2 * 60 * 1000)) {
      nextReminder = (actualReminderInterval && actualReminderInterval !== 'once' && INTERVAL_MS[actualReminderInterval])
        ? anchorToDaytime(new Date(now.getTime() + INTERVAL_MS[actualReminderInterval]), actualReminderInterval)
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
            reminderWish: parsed.reminder_wish || null,
          }))
          .then(multiIds => {
            if (multiIds) {
              return commitNotificationIds(createdTask.id, multiIds);
            }
            // A "by 5 PM" deadline never gets a lone reminder AT the deadline
            // (too late by then) — smart nudges own it.
            if (parsed.deadline_style === 'by' && !parsed.day_only_task) {
              return commitNotificationIds(createdTask.id, []);
            }
            return scheduleReminder({
              email: currentUser.email,
              ...getReminderCopy(createdTask, nextReminder),
              sendAtISO: nextReminder.toISOString(),
              taskId: createdTask.id,
              data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: createdTask.urgency, type: 'task_reminder' },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            }).then(notificationId => {
              return commitNotificationIds(createdTask.id, notificationId ? [notificationId] : []);
            });
          })
          .catch(error => console.error("Failed to schedule reminder:", error));
      } else if (INTERVAL_MS[actualReminderInterval]) {
        rhythmBookingOptions(createdTask, currentUser).then((opts) => import('./reminderScheduler').then(module => module.scheduleRecurringReminders({
          ...opts,
          email: currentUser.email,
          ...getReminderCopy(createdTask, nextReminder),
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
        }))).then(({ notificationIds, lastScheduledUntil }) => {
          return commitNotificationIds(createdTask.id, notificationIds || [],
            lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {});
        }).catch(error => console.error("Failed to schedule recurring reminders:", error));
      }
    } else {
      // Nothing to book — release the marker so the cron isn't held off.
      base44.entities.Task.update(createdTask.id, { reminder_scheduling_since: null }).catch(() => {});
    }

    return { status: 'done', taskId: createdTask.id };
  } catch (error) {
    console.error('🔄 [PROCESS] Error:', error);
    trace('processError', { message: String(error?.message || error) });
    trackFire('task_create_failed', {
      props: { message: String(error?.message || error).slice(0, 300) },
    });
    return { status: 'error', message: error.message };
  }
}

// Creates one advance-eligible task with the user's chosen lead time.
// The task KEEPS the time the user actually said (next_reminder = the real
// time); the advance lead is an extra push, not a shift of the task itself.
// Shifting next_reminder made "12 pm + 1 hour before" show up as an 11 AM task.
export async function createAdvanceTask(taskData, currentUser, minutesBefore) {
  const eventTime = new Date(taskData.next_reminder);
  const advanceTime = minutesBefore > 0
    ? new Date(eventTime.getTime() - (minutesBefore * 60 * 1000))
    : null;

  const createdTask = await base44.entities.Task.create({ ...taskData, reminder_scheduling_since: new Date().toISOString() });
  announceEventConflict(createdTask);
  announceTaskCreated(createdTask);

  const buttons = [
    { id: "snooze_15", text: "Snooze 15 min" },
    { id: "snooze_60", text: "Snooze 1 hour" },
    { id: "complete", text: "✅ Done" }
  ];
  const pushes = [];

  if (advanceTime && advanceTime.getTime() > Date.now() + 2 * 60 * 1000) {
    const lead = minutesBefore >= 60 ? `${minutesBefore / 60} hour${minutesBefore > 60 ? 's' : ''}` : `${minutesBefore} min`;
    pushes.push({
      title: "📋 Upcoming Task",
      body: `In ${lead}: ${createdTask.title}\n\nTap to view details.`,
      sendAtISO: advanceTime.toISOString(),
      type: 'advance_reminder',
    });
  }
  if (eventTime.getTime() > Date.now()) {
    pushes.push({
      ...getReminderCopy(createdTask, eventTime),
      sendAtISO: eventTime.toISOString(),
      type: 'task_reminder',
    });
  }

  try {
    const ids = [];
    for (const p of pushes) {
      const notificationId = await scheduleReminder({
        email: currentUser.email,
        title: p.title,
        body: p.body,
        sendAtISO: p.sendAtISO,
        taskId: createdTask.id,
        data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: createdTask.urgency, type: p.type },
        buttons,
      });
      if (notificationId) ids.push(notificationId);
    }
    await commitNotificationIds(createdTask.id, ids);
  } catch (error) {
    console.error("Failed to schedule reminder:", error);
  }
  return createdTask;
}

// Priority sets URGENCY ONLY — the smart nudge cron decides when to remind.
export async function createTaskWithPriority(data, priority) {
  const urgency = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
  const createdTask = await base44.entities.Task.create({
    title: data.title,
    original_input: data.original_input || null,
    reminder_wish: data.reminder_wish || null,
    description: '',
    classification: data.classification || 'task',
    reminder_interval: null,
    due_date: data.presetDueDateISO || null,
    reminder_count: 0,
    next_reminder: null,
    urgency,
    energy_required: data.energy_required,
    takes_time: data.takes_time === true,
    life_area: data.life_area || 'personal',
    status: 'active',
    notification_recipient_email: data.currentUser.email
  });
  announceTaskCreated(createdTask);
  return createdTask;
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
    reminder_wish: data.reminder_wish || null,
    anchor_time: time || null,
    location: data.location || null,
    description: '',
    classification: data.classification || 'task',
    reminder_interval: 'once',
    reminder_count: 0,
    next_reminder: nextReminder.toISOString(),
    end_date: endDateISO,
    urgency: data.urgency,
    energy_required: data.energy_required,
    takes_time: data.takes_time === true,
    life_area: data.life_area || 'personal',
    status: 'active',
    notification_recipient_email: data.currentUser.email,
    reminder_scheduling_since: new Date().toISOString()
  });

  announceEventConflict(createdTask);
  announceTaskCreated(createdTask);

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
    await commitNotificationIds(createdTask.id, multiIds);
  } else {
    scheduleReminder({
      email: data.currentUser.email,
      ...getReminderCopy(createdTask, nextReminder),
      sendAtISO: nextReminder.toISOString(),
      taskId: createdTask.id,
      data: { screen: "/TaskNotification", taskId: createdTask.id, urgency: data.urgency, type: 'task_reminder' },
      buttons: [
        { id: "snooze_15", text: "Snooze 15 min" },
        { id: "snooze_60", text: "Snooze 1 hour" },
        { id: "complete", text: "✅ Done" }
      ]
    }).then(notificationId => {
      return commitNotificationIds(createdTask.id, notificationId ? [notificationId] : []);
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
    reminder_wish: data.reminder_wish || null,
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
    takes_time: data.takes_time === true,
    life_area: data.life_area || 'personal',
    status: 'active',
    notification_recipient_email: data.currentUser.email
  });
}