// Frontend utility for scheduling multi-reminders based on task type.
// Uses the shared classification rules and the existing reminderScheduler
// for actual OneSignal scheduling (with quiet-hours support).

import { scheduleReminder } from './reminderScheduler';

// ── Inline copy of base44/shared/multiReminderRules.ts ─────────────────────
// Kept here because the frontend can't reliably import from base44/shared/.
// If the rules change, update both copies.

const PAYMENT_KEYWORDS = [
  'payment', 'pay', 'bill', 'rent', 'lease', 'mortgage', 'loan',
  'tuition', 'subscription', 'membership', 'dues', 'fee', 'fees',
  'premium', 'insurance', 'electric', 'water bill', 'gas bill',
  'internet', 'phone bill', 'credit card', 'debit', 'transfer',
  'deposit', 'venmo', 'paypal', 'zelle', 'invoice', 'statement',
  'balance', 'carmax', 'progressive', 'amex', 'visa', 'mastercard',
  'discover', 'capital one', 'chase', 'wells fargo', 'bank of america',
  'citi', 'barclays', 'sprint', 't-mobile', 'verizon',
  'xfinity', 'comcast', 'directv', 'spectrum', 'cox', 'centurylink',
  'renew', 'renewal', 'due date', 'overdue',
  'installment', 'finance', 'financing', 'lender',
  'lending', 'borrow', 'repay', 'repayment',
];

const APPOINTMENT_KEYWORDS = [
  'gastroenterologist', 'dentist', 'doctor', 'physician', 'surgeon',
  'specialist', 'therapist', 'psychiatrist', 'psychologist', 'counselor',
  'counsellor', 'orthodontist', 'cardiologist', 'dermatologist',
  'pediatrician', 'chiropractor', 'clinic', 'appointment', 'consultation',
  'checkup', 'check-up', 'follow-up', 'follow up', 'reschedule',
  'booking', 'instructor', 'advisor', 'tutor', 'lecture', 'seminar',
  'interview', 'therapy', 'treatment', 'nurse', 'anesthesiologist',
  'pediatric', 'psychiatry', 'dermatology', 'cardiology', 'orthodontics',
  'endodontics', 'periodontics', 'hygienist', 'endodontist', 'periodontist',
  'geneticist', 'genetics', 'biopsy', 'autopsy', 'necropsy',
  'x-ray', 'xray', 'scan', 'ultrasound', 'cat scan', 'colonoscopy',
  'radiology', 'radiologist', 'pharmacist', 'pharmacy',
  'optometrist', 'optometry', 'audiologist', 'audiology',
  'speech', 'occupational', 'cognitive', 'couples',
  'marital', 'marriage', 'family therapy',
  'group therapy', 'group session', 'individual session',
  'intake', 'assessment', 'evaluation', 'screening',
];

const EVENT_KEYWORDS = [
  'meet', 'meetup', 'meet up', 'meeting', 'event', 'concert', 'party',
  'gathering', 'club', 'tournament', 'competition', 'race', 'sport',
  'football', 'tennis', 'golf', 'soccer', 'basketball', 'volleyball',
  'hockey', 'track', 'sprint', 'marathon', 'relay', 'stadium', 'arena',
  'festival', 'parade', 'rally', 'ceremony', 'graduation', 'contest',
  'convention', 'expo', 'fair', 'ride', 'moto', 'motorcycle', 'bicycle',
  'biking', 'cycling', 'running', 'jogging', 'hiking', 'camping',
  'boating', 'sailing', 'diving', 'snorkeling', 'swimming', 'rafting',
  'show', 'perform', 'performance', 'dance', 'dancing', 'sing', 'singing',
  'choir', 'orchestra', 'band', 'ensemble', 'troupe', 'crew',
  'team', 'league', 'association', 'organization', 'society', 'committee',
  'board', 'panel', 'forum', 'assembly', 'campaign',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAny(title, keywords) {
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
    if (regex.test(title)) return true;
  }
  return false;
}

export function classifyTask(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  if (matchesAny(lower, PAYMENT_KEYWORDS)) return 'payment';
  if (matchesAny(lower, APPOINTMENT_KEYWORDS)) return 'appointment';
  if (matchesAny(lower, EVENT_KEYWORDS)) return 'event';
  return null;
}

export function getMultiReminderTimes(title, scheduledDateISO) {
  const category = classifyTask(title);
  if (!category) return [];

  const scheduled = new Date(scheduledDateISO);
  const buffer = new Date(Date.now() + 2 * 60 * 1000);
  const reminders = [];

  if (category === 'appointment') {
    const twoDaysBefore = new Date(scheduled);
    twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
    twoDaysBefore.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: twoDaysBefore.toISOString(), label: '2 days before' });

    const oneDayBefore = new Date(scheduled);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: oneDayBefore.toISOString(), label: '1 day before' });

    const morningOf = new Date(scheduled);
    morningOf.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morningOf.toISOString(), label: 'morning of' });

    const oneHourBefore = new Date(scheduled.getTime() - 60 * 60 * 1000);
    reminders.push({ sendAtISO: oneHourBefore.toISOString(), label: '1 hour before' });
  } else if (category === 'event') {
    const morningOf = new Date(scheduled);
    morningOf.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morningOf.toISOString(), label: 'morning of' });

    const oneHourBefore = new Date(scheduled.getTime() - 60 * 60 * 1000);
    reminders.push({ sendAtISO: oneHourBefore.toISOString(), label: '1 hour before' });
  } else if (category === 'payment') {
    const morning = new Date(scheduled);
    morning.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morning.toISOString(), label: 'morning' });

    const afternoon = new Date(scheduled);
    afternoon.setHours(13, 0, 0, 0);
    reminders.push({ sendAtISO: afternoon.toISOString(), label: 'afternoon' });

    const evening = new Date(scheduled);
    evening.setHours(18, 0, 0, 0);
    reminders.push({ sendAtISO: evening.toISOString(), label: 'evening' });
  }

  return reminders.filter(r => new Date(r.sendAtISO) > buffer);
}

/**
 * Schedules multiple reminders for a one-time task based on its category.
 * Returns an array of OneSignal notification IDs (may be empty).
 * Returns null if the task doesn't match any multi-reminder category,
 * so the caller can fall back to a single reminder.
 */
export async function scheduleMultiReminders({
  email,
  title,
  scheduledDateISO,
  taskId,
  urgency,
}) {
  const reminders = getMultiReminderTimes(title, scheduledDateISO);
  if (reminders.length === 0) return null;

  console.log(`[multiReminderScheduler] Scheduling ${reminders.length} reminders for "${title}"`);

  const notificationIds = [];
  for (const reminder of reminders) {
    try {
      const id = await scheduleReminder({
        email,
        title: '📅 Upcoming',
        body: `${title}\n\n${reminder.label}\n\nTap to view details.`,
        sendAtISO: reminder.sendAtISO,
        taskId,
        data: {
          screen: '/TaskNotification',
          taskId,
          urgency: urgency || 'medium',
          type: 'task_reminder',
        },
        buttons: [
          { id: 'snooze_15', text: 'Snooze 15 min' },
          { id: 'snooze_60', text: 'Snooze 1 hour' },
          { id: 'complete', text: '✅ Done' },
        ],
      });
      if (id) notificationIds.push(id);
    } catch (e) {
      console.error(`[multiReminderScheduler] Failed to schedule "${reminder.label}":`, e);
    }
  }

  console.log(`[multiReminderScheduler] Scheduled ${notificationIds.length}/${reminders.length} reminders`);
  return notificationIds;
}