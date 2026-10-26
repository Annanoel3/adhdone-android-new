import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';

// Duplicate a task or event (Anna, Oct 25 2026: "Can we make a way to
// duplicate a task or event?").
//
// A copy keeps what the task IS — its words, place, kind, urgency, repeat
// pattern, alert style, attachments, steps — and nothing about WHEN it was or
// what was booked for it: no date, no time, no reminders, no plan, no link to
// the calendar row or capture the original came from. The copy opens on its
// own details card, where picking a date or time goes through the card's
// usual path and books the reminders exactly as it would for any task. Until
// then a copied task is a dateless Smart Reminders task like any other; a
// copied event waits for its date.
const KEEP = [
  'title', 'description', 'notes', 'location', 'business_name', 'business_hours',
  'classification', 'urgency', 'energy_required', 'takes_time', 'life_area', 'tag',
  'day_only_task', 'deadline_style', 'reminder_interval', 'recurrence_pattern',
  'recurrence_days', 'reminder_wish', 'anchor_time', 'alert_style', 'quiet_hours_exempt',
  'follow_up_title', 'follow_up_minutes', 'pictures', 'prep_questions', 'typical_minutes',
  'task_family', 'original_input',
];

export async function duplicateTask(task) {
  if (!task?.id) throw new Error('no task');
  const me = await base44.auth.me();
  const data = {};
  for (const k of KEEP) {
    if (task[k] !== undefined && task[k] !== null) data[k] = task[k];
  }
  const copy = await base44.entities.Task.create({
    ...data,
    status: 'active',
    notification_recipient_email: me.email,
    reminder_count: 0,
    next_reminder: null,
    due_date: null,
    start_date: null,
    end_date: null,
    event_time: null,
    end_time: null,
    time_stated: false,
    onesignal_notification_ids: [],
    reminder_schedule: [],
    silenced: false,
  });

  // Its steps come along, unchecked, in the same order.
  let steps = [];
  try {
    steps = await base44.entities.Task.filter({ parent_task_id: task.id }, 'subtask_order', 200);
  } catch (e) {
    steps = [];
  }
  for (const s of steps) {
    await base44.entities.Task.create({
      title: s.title,
      parent_task_id: copy.id,
      subtask_order: s.subtask_order ?? null,
      status: 'active',
      classification: 'task',
      urgency: s.urgency || task.urgency || 'medium',
      life_area: s.life_area || task.life_area || 'personal',
      notification_recipient_email: me.email,
    }).catch(() => {});
  }

  trackFire('task_duplicated', {
    props: { classification: task.classification || 'task', steps: steps.length, from_completed: task.status === 'completed' },
  });
  return copy;
}
