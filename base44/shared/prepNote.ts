// What to get ready BEFORE an appointment, carried in every reminder of it.
//
// Anna, Nov 4 2026: her cat's vet visit needed him fasting, the event carried
// no note, and she fed him breakfast ("a notification is not enough"). So an
// appointment-type event (Task.prep_worthy — the parser judges it from what
// the appointment IS: a vet, doctor or dental visit, a procedure, a flight,
// the DMV, an interview — never from a word in its name) with no prep note
// yet gets its night-before reminder turned into the ask; once a note is typed
// (Task.prep_note), every reminder of the event — night before, morning of,
// hour before, leave now, at the time, and the phone's alarm, which reads the
// same words — ends with "Prep: <note>".
//
// No popup anywhere: four of the five ways a task is added have no screen at
// all (shared text, a shared photo, the widget, the pinned notification), so
// the ask lives where every path already meets the person — in the reminders,
// on the reminder page they open from them (TaskNotification), and as one line
// on the event's row in the app (PrepOffer). An event added from outside the
// app too late for a night-before gets ONE push a few minutes later asking
// (sendPrepAsk below), through the ledger, outside quiet hours, once.
//
// Prep never changes how loud a reminder is: every reminder of a timed event
// rings (RULES.md §9 Q6), with or without a note.

import { resolveQuietHours, placeAppReminder, userTimeZone } from './quietHours.ts';

export const PREP_MAX = 140;
// The night-before ask when nothing else is asked there.
export const PREP_ASK_LABEL = 'night before · prep';
// The night-before that also asks for questions keeps the label every
// matcher in the app knows ('night before · questions') and only merges
// the words, so Record notes / Jot down questions keep working as they do.
export const QUESTIONS_LABEL = 'night before · questions';
const SEP = '\nPrep: ';

export function shortTitle(title: unknown): string {
  const t = String(title || '').trim() || 'your event';
  return t.length > 40 ? `${t.slice(0, 37)}...` : t;
}

// The note as it goes into a reminder: one line, trimmed, capped.
export function prepNoteOf(task: any): string {
  const raw = String(task?.prep_note || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > PREP_MAX ? `${raw.slice(0, PREP_MAX - 1).trim()}…` : raw;
}

// A reminder body without the prep line this module added to it.
export function stripPrep(body: unknown): string {
  const s = String(body || '');
  const i = s.indexOf(SEP);
  return (i < 0 ? s : s.slice(0, i)).trimEnd();
}

// The body with the current note on it (none → the body as it was).
export function withPrep(body: unknown, note: unknown): string {
  const base = stripPrep(body);
  const n = prepNoteOf({ prep_note: note });
  return n ? `${base}${SEP}${n}` : base;
}

// An appointment-type event with no prep note yet: its reminders ask, its
// row offers, its night-before alarm's second button says "Add prep notes".
export function wantsPrepAsk(task: any): boolean {
  if (!task || task.classification !== 'event' || task.prep_worthy !== true) return false;
  if (task.parent_task_id || task.birthday_person) return false;
  if (task.status && task.status !== 'active') return false;
  if (task.silenced) return false;
  return !prepNoteOf(task);
}

// Does this reminder (by label) ask for prep? The plain ask has its own
// label; the questions one is told apart by its words.
export function isPrepAsk(label: unknown, body?: unknown): boolean {
  const l = String(label || '').trim().toLowerCase();
  if (l === PREP_ASK_LABEL) return true;
  return l === QUESTIONS_LABEL && /prep note/i.test(String(body || ''));
}

// The three night-before wordings, in one place: the plain heads-up (the
// words every event has had), the questions one (events worth recording,
// generateReminderSchedule NOTES_LABELS), and the prep ask, alone or merged
// with the questions one. `when` is the event's clock time as the owner
// reads it ("1:45 PM"), when the caller has it.
export function nightBeforeWords(title: unknown, opts: { questions?: boolean; prepAsk?: boolean; when?: string } = {}): { title: string; body: string } {
  const t = shortTitle(title);
  const at = opts.when ? ` at ${opts.when}` : '';
  if (opts.prepAsk && opts.questions) {
    return { title: `📝 ${t} is tomorrow`, body: `"${t}" is tomorrow${at}. Anything to get ready first, or ask about? Tap to add a prep note and write your questions down.` };
  }
  if (opts.prepAsk) {
    return { title: `📝 ${t} is tomorrow`, body: `"${t}" is tomorrow${at}. Anything to get ready first — fasting, papers, something to bring? Tap to add a prep note and every reminder will repeat it.` };
  }
  if (opts.questions) {
    return { title: `📝 ${t} is tomorrow`, body: `Anything you want to ask or bring up? Tap to write your questions down so they're ready.` };
  }
  return { title: `🎉 ${t}`, body: `Heads up! Your "${t}" is tomorrow. Don't forget to prep! ✨` };
}

// generateReminderSchedule's finished event plan, with prep applied: a note
// goes on every body; no note on an appointment-type event turns the night
// before into the ask. Anything else comes back untouched.
export function applyPrepToPlan(reminders: any[], task: { title?: unknown; prep_worthy?: unknown; prep_note?: unknown; classification?: unknown }, opts: { when?: string } = {}): any[] {
  const list = Array.isArray(reminders) ? reminders : [];
  const note = prepNoteOf(task);
  if (note) {
    return list.map((r) => ({ ...r, notification_body: withPrep(r?.notification_body, note) }));
  }
  if (task?.classification !== 'event' || task?.prep_worthy !== true) return list;
  let asked = false;
  return list.map((r) => {
    const label = String(r?.label || '').trim().toLowerCase();
    if (asked || !label.startsWith('night before')) return r;
    asked = true;
    const questions = label === QUESTIONS_LABEL;
    const words = nightBeforeWords(task.title, { prepAsk: true, questions, when: opts.when });
    return { ...r, label: questions ? QUESTIONS_LABEL : PREP_ASK_LABEL, notification_title: words.title, notification_body: words.body };
  });
}

// One saved reminder entry after the note changed: the new label and words,
// or null when nothing about it changes. A note typed turns the ask back
// into the heads-up it replaced (plain, or the questions one), with the note
// on it; a note cleared takes the line off and does not ask again.
export function rewordEntryForPrep(entry: any, task: any): { label: string; notification_title: string; notification_body: string } | null {
  if (!entry) return null;
  const note = prepNoteOf(task);
  const label = String(entry.label || '').trim();
  const title = String(entry.notification_title || '');
  const body = String(entry.notification_body || '');
  let next = { label, notification_title: title, notification_body: body };
  if (isPrepAsk(label, body)) {
    const questions = label.toLowerCase() === QUESTIONS_LABEL;
    const words = nightBeforeWords(task?.title, { questions });
    next = { label: questions ? QUESTIONS_LABEL : 'night before', notification_title: words.title, notification_body: words.body };
    // No note yet (the ask is still the right words): leave it.
    if (!note) return null;
  }
  next.notification_body = withPrep(next.notification_body, note);
  if (next.label === label && next.notification_title === title && next.notification_body === body) return null;
  return next;
}

// The one push for an event added from outside the app whose night-before
// has already gone by (it's today, or tomorrow and it's past 8 PM): a few
// minutes after it's added. `when` is the start as the owner reads it
// ("today at 1:45 PM", "tomorrow at 9:00 AM").
export function prepAskPushWords(title: unknown, when: string): { title: string; body: string } {
  const t = shortTitle(title);
  return { title: `📝 ${t}`, body: `Added: "${t}" ${when}. Anything to get ready first — fasting, papers, something to bring? Tap to add a prep note and every reminder will repeat it.` };
}

export const PREP_ASK_DELAY_MS = 3 * 60 * 1000;
// Nothing asked when the start is this close: the hour-before (or leave
// now) is about to ring, and the page it opens has the prep box.
export const PREP_ASK_MIN_LEAD_MS = 2 * 60 * 60 * 1000;

// "today at 1:45 PM" / "tomorrow at 9:00 AM" / "Fri at 2:00 PM" on the owner's clock.
export function startWords(startISO: string, timeZone: string, nowMs: number = Date.now()): string {
  const d = new Date(startISO);
  const tz = timeZone || 'America/Chicago';
  const dayKey = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
  const today = dayKey(new Date(nowMs));
  const tomorrow = dayKey(new Date(nowMs + 24 * 60 * 60 * 1000));
  const day = dayKey(d);
  if (day === today) return `today at ${clock}`;
  if (day === tomorrow) return `tomorrow at ${clock}`;
  return `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)} at ${clock}`;
}

// Whether the creation-time ask is needed: an appointment-type event with no
// note, added from outside the app, whose plan has no night-before left to
// carry the ask, starting more than PREP_ASK_MIN_LEAD_MS away, not asked yet.
export function needsPrepAskPush(task: any, entries: any[], nowMs: number = Date.now()): boolean {
  if (!wantsPrepAsk(task)) return false;
  if (task.prep_asked_at) return false;
  // Only a timed event: an all-day one has no clock time to say.
  if (!task.event_time || task.day_only_task) return false;
  const startMs = new Date(task.event_time).getTime();
  if (!Number.isFinite(startMs) || startMs - nowMs < PREP_ASK_MIN_LEAD_MS) return false;
  const hasNightBefore = (Array.isArray(entries) ? entries : []).some((e) => {
    if (!e || !/^night before/i.test(String(e.label || ''))) return false;
    const at = new Date(e.send_at).getTime();
    return Number.isFinite(at) && at > nowMs;
  });
  return !hasNightBefore;
}

// Books that one ask (needsPrepAskPush decided it's wanted) and stamps the
// task so it is never asked twice. A soft push ('task_checkin': no buttons,
// yields to anything time-critical in the ledger), moved out of quiet hours
// or dropped when that would be too late. Never throws.
export async function sendPrepAsk(base44: any, task: any, owner: any, email: string, source: string): Promise<boolean> {
  try {
    const tz = userTimeZone(owner);
    const startMs = new Date(task.event_time).getTime();
    const quiet = resolveQuietHours(owner);
    const placed = placeAppReminder(Date.now() + PREP_ASK_DELAY_MS, startMs - PREP_ASK_MIN_LEAD_MS, quiet, tz);
    if (placed == null) {
      console.log(`[prepNote] ${task.id}: the prep ask would land inside quiet hours with no room before the event; left to the reminder page`);
      return false;
    }
    const words = prepAskPushWords(task.title, startWords(task.event_time, tz));
    const res = await base44.asServiceRole.functions.invoke('schedulePush', {
      internalKey: Deno.env.get('CRON_SECRET'),
      toUserExternalId: email,
      title: words.title,
      body: words.body,
      sendAtISO: new Date(placed).toISOString(),
      data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency || 'medium', type: 'task_checkin' },
    });
    const result = res?.data || res;
    const id = result?.notificationId ? String(result.notificationId) : '';
    // Stamped either way: refused (not subscribed, stacked on another push)
    // means the row and the reminder page carry the ask, not a second try.
    await base44.asServiceRole.entities.Task.update(task.id, { prep_asked_at: new Date().toISOString() });
    console.log(`[prepNote] ${task.id}: prep ask ${id ? `booked for ${result.sendAt || new Date(placed).toISOString()}` : `not booked (${result?.reason || result?.error || 'no id'})`} (${source})`);
    return !!id;
  } catch (e) {
    console.error('[prepNote] could not send the prep ask:', (e as any)?.message || e);
    return false;
  }
}
