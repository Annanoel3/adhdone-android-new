// Shared multi-reminder scheduling rules.
// Used by the frontend (TaskDetailsModal / TaskCard) and backend
// (syncGoogleCalendar) so appointment / event / payment reminder
// schedules stay consistent across every entry point.

export type ReminderCategory = 'appointment' | 'event' | 'payment' | null;

export interface ReminderTime {
  sendAtISO: string;
  label: string;
}

// Word-boundary keyword sets — order matters: payment is checked first
// (most specific), then appointment, then event.
const PAYMENT_KEYWORDS = [
  'payment', 'pay', 'bill', 'rent', 'lease', 'mortgage', 'loan',
  'tuition', 'subscription', 'membership', 'dues', 'fee', 'fees',
  'premium', 'insurance', 'electric', 'water bill', 'gas bill',
  'internet', 'phone bill', 'credit card', 'debit', 'transfer',
  'deposit', 'venmo', 'paypal', 'zelle', 'invoice', 'statement',
  'balance', 'carmax', 'progressive', 'amex', 'visa', 'mastercard',
  'discover', 'capital one', 'chase', 'wells fargo', 'bank of america',
  'citi', 'barclays', 'sprint', 't-mobile', 't-mobile', 'verizon',
  'xfinity', 'comcast', 'directv', 'spectrum', 'cox', 'centurylink',
  'century link', 'renew', 'renewal', 'due date', 'overdue',
  'installment', 'installment', 'finance', 'financing', 'lender',
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
  'radiology', 'radiologist', 'dermatologist', 'pharmacist', 'pharmacy',
  'optometrist', 'optometry', 'audiologist', 'audiology',
  'speech', 'speech therapy', 'occupational', 'behavioral',
  'cognitive', 'couples', 'marital', 'marriage', 'family therapy',
  'group therapy', 'group session', 'individual session',
  'intake', 'assessment', 'evaluation', 'screening',
  'psychiatrist', 'psychiatrist', 'psychiatrist',
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
  'choir', 'orchestra', 'band', 'choir', 'ensemble', 'troupe', 'crew',
  'team', 'league', 'association', 'organization', 'society', 'committee',
  'board', 'panel', 'forum', 'assembly', 'rally', 'campaign',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAny(title: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
    if (regex.test(title)) return true;
  }
  return false;
}

export function classifyTask(title: string): ReminderCategory {
  if (!title) return null;
  const lower = title.toLowerCase();

  if (matchesAny(lower, PAYMENT_KEYWORDS)) return 'payment';
  if (matchesAny(lower, APPOINTMENT_KEYWORDS)) return 'appointment';
  if (matchesAny(lower, EVENT_KEYWORDS)) return 'event';

  return null;
}

// Returns an array of reminder times for the given category and scheduled date.
// All times are in the same timezone as the scheduledDate object.
// Past reminders (within a 2-minute buffer of "now") are filtered out.
export function getMultiReminderTimes(
  title: string,
  scheduledDateISO: string
): ReminderTime[] {
  const category = classifyTask(title);
  if (!category) return [];

  const scheduled = new Date(scheduledDateISO);
  const buffer = new Date(Date.now() + 2 * 60 * 1000);
  const reminders: ReminderTime[] = [];

  if (category === 'appointment') {
    // 2 days before at 9 AM
    const twoDaysBefore = new Date(scheduled);
    twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
    twoDaysBefore.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: twoDaysBefore.toISOString(), label: '2 days before' });

    // 1 day before at 9 AM
    const oneDayBefore = new Date(scheduled);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: oneDayBefore.toISOString(), label: '1 day before' });

    // Morning of at 9 AM
    const morningOf = new Date(scheduled);
    morningOf.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morningOf.toISOString(), label: 'morning of' });

    // 1 hour before
    const oneHourBefore = new Date(scheduled.getTime() - 60 * 60 * 1000);
    reminders.push({ sendAtISO: oneHourBefore.toISOString(), label: '1 hour before' });
  } else if (category === 'event') {
    // Morning of at 9 AM
    const morningOf = new Date(scheduled);
    morningOf.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morningOf.toISOString(), label: 'morning of' });

    // 1 hour before
    const oneHourBefore = new Date(scheduled.getTime() - 60 * 60 * 1000);
    reminders.push({ sendAtISO: oneHourBefore.toISOString(), label: '1 hour before' });
  } else if (category === 'payment') {
    // Morning at 9 AM
    const morning = new Date(scheduled);
    morning.setHours(9, 0, 0, 0);
    reminders.push({ sendAtISO: morning.toISOString(), label: 'morning' });

    // Afternoon at 1 PM
    const afternoon = new Date(scheduled);
    afternoon.setHours(13, 0, 0, 0);
    reminders.push({ sendAtISO: afternoon.toISOString(), label: 'afternoon' });

    // Evening at 6 PM
    const evening = new Date(scheduled);
    evening.setHours(18, 0, 0, 0);
    reminders.push({ sendAtISO: evening.toISOString(), label: 'evening' });
  }

  return reminders.filter(r => new Date(r.sendAtISO) > buffer);
}