// One ledger every outgoing push is checked against and recorded in.
//
// Several independent systems send pushes (pre-booked task reminders, the refill
// cron, smart nudges, the morning digest, motivation, birthday/text follow-ups).
// None of them can see what the others booked, so two can land minutes apart.
// This module is the shared bookkeeping: check before sending, record after.
//
// Rules:
//  - SAME TASK, SAME TIME: another live push about the same task within
//    SAME_TASK_GAP_MS is a duplicate → block. The gap is under 10 minutes so an
//    explicit "every 10 minutes" reminder still passes.
//  - DON'T STACK: proactive pushes (nudge / digest / motivation / general, and
//    'task_checkin' = a clock-time check-in like "morning of 9 AM" / "night
//    before") hold off when ANY other push to that user lands within
//    STACK_GAP_MS. They aren't time-critical, so they yield to reminders tied
//    to a real moment ("1 hour before", "at the time", recurring cadence).
//  - EVICT: when a time-critical push is booked and a *pending* proactive push
//    already sits in its window, the proactive one is cancelled instead — so
//    the order the two were booked in never decides which one the user gets.
//    Two pushes were landing in the same minute because the check-in happened
//    to be booked first; staggering was ruled out, so the softer one goes.
//
// A conflicting entry is verified against OneSignal before it blocks anything:
// if that booking was cancelled (many cancel paths don't touch the ledger), the
// stale entry is dropped and the send goes through.

import { isWithinWorkHours } from './workHours.ts';
import { pushPhoneAlarms } from './reminderTitle.ts';

const SAME_TASK_GAP_MS = 9 * 60 * 1000;
const STACK_GAP_MS = 20 * 60 * 1000;
// An urgent task's nudge (priority "urgent") keeps only 5 minutes from other
// pushes instead of 20 (Anna, Oct 10 2026: an urgent call to a vet that closed
// at noon waited behind a 10 AM medicine alarm and went out at 10:39).
const URGENT_STACK_GAP_MS = 5 * 60 * 1000;
// Also soft (Nov 4 2026 audit): the one "two events overlap / look the same"
// push (event_conflict) and the day-2 "add one thing" nudge (first_task_nudge).
// Neither is tied to a moment, so each yields to a reminder that is.
// 'event_heads_up' (an event's night-before booked by the app itself) is the
// same kind of push as the server's 'task_checkin' and is treated the same:
// soft, and moved to a free minute rather than dropped (schedulePush).
const PROACTIVE_KINDS = new Set(['smart_nudge', 'daily_digest', 'motivation', 'general', 'task_checkin', 'event_heads_up', 'event_conflict', 'first_task_nudge']);
// Which pending soft pushes a time-critical one may cancel to take the slot.
// NOT an event's heads-up (task_checkin / event_heads_up: the night before,
// the morning of, the prep ask): on Oct 13 2026 Anna lost a Bike Night's
// night-before that way and "the first she heard of it that day was 'in about
// an hour'", and on Nov 4 2026 every reminder of an event was made to count
// (RULES.md §9 Q6). Those two may land in the same minute as a task's reminder
// booked after them; the softer nudges still make way.
const EVICTABLE_KINDS = new Set(['smart_nudge', 'daily_digest', 'motivation', 'general', 'event_conflict', 'first_task_nudge']);

function ledger(base44: any) {
  return base44.asServiceRole.entities.NotificationLedger;
}

// Cancel a pending proactive booking so a time-critical one can take its slot.
// The owning task's saved schedule is trimmed too — otherwise the refill cron
// would see an entry with no live id and book the check-in right back.
async function evict(base44: any, entry: any): Promise<void> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (entry.notification_id && appId && key) {
    try {
      await fetch(`https://onesignal.com/api/v1/notifications/${entry.notification_id}?app_id=${appId}`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${key}` },
      });
    } catch {}
  }
  try { await ledger(base44).delete(entry.id); } catch {}
  if (entry.task_id && entry.notification_id) {
    try {
      const task = await base44.asServiceRole.entities.Task.get(entry.task_id);
      if (task) {
        const fields = {
          onesignal_notification_ids: (task.onesignal_notification_ids || []).filter((id: string) => id !== entry.notification_id),
          reminder_schedule: (task.reminder_schedule || []).filter((r: any) => r.notification_id !== entry.notification_id),
        };
        await base44.asServiceRole.entities.Task.update(task.id, fields);
        // The phone holds its own copy of this task's alarms and rings them
        // on its own clock; a server-side cancel it never hears about still
        // rings (Anna, Oct 10 2026: a cancelled "one hour left" push rang at
        // 11 anyway). Hand it the new list.
        try {
          const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by }, '-created_date', 1);
          if (owners?.[0]) await pushPhoneAlarms({ ...task, ...fields }, owners[0], { before: task, changedAt: Date.now(), source: 'sendLedger' });
        } catch (e) {
          console.error('[sendLedger] evict: could not update the phone:', e);
        }
      }
    } catch (e) {
      console.error('[sendLedger] evict: could not trim task schedule:', e);
    }
  }
  console.log(`[sendLedger] EVICTED ${entry.kind} "${entry.title || ''}" at ${entry.send_at} to make room for a time-critical push`);
}

async function stillLive(notificationId: string | undefined): Promise<boolean> {
  if (!notificationId) return true;
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !key) return true;
  try {
    const res = await fetch(`https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${appId}`, {
      headers: { Authorization: `Basic ${key}` },
    });
    if (res.status === 404) return false;
    const json = await res.json().catch(() => ({}));
    if (json?.canceled === true) return false;
    return true;
  } catch {
    return true;
  }
}

// Never lets a lookup failure silence a push — on error we assume "not at work".
async function atWork(base44: any, email: string, at: Date): Promise<boolean> {
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const user = users?.[0];
    if (!user?.work_quiet_enabled) return false;
    let shifts: any[] = [];
    if (user.work_schedule_mode === 'varies') {
      shifts = await base44.asServiceRole.entities.WorkShift.filter({ created_by: email }, '-shift_date', 30);
    }
    return isWithinWorkHours(user, shifts, at);
  } catch (e) {
    console.error('[sendLedger] work-hours check failed, allowing send:', e);
    return false;
  }
}

export async function ledgerCheck(
  base44: any,
  opts: { email: string; taskId?: string | null; kind?: string; sendAt?: string | Date; urgent?: boolean; firstClaim?: boolean }
): Promise<{ allowed: boolean; reason?: string; conflict?: { notificationId: string; sendAt: string; kind: string; title: string } }> {
  const email = opts.email;
  if (!email) return { allowed: true };
  const kind = opts.kind || 'task_reminder';
  const taskId = opts.taskId || null;
  const sendAtMs = opts.sendAt ? new Date(opts.sendAt).getTime() : Date.now();
  const window = Math.max(SAME_TASK_GAP_MS, STACK_GAP_MS);

  let entries: any[] = [];
  try {
    entries = await ledger(base44).filter({
      user_email: email,
      send_at: {
        $gte: new Date(sendAtMs - window).toISOString(),
        $lte: new Date(sendAtMs + window).toISOString(),
      },
    });
  } catch (e) {
    console.error('[sendLedger] check failed, allowing send:', e);
    return { allowed: true };
  }

  const proactive = PROACTIVE_KINDS.has(kind);

  // "Don't send me notifications at work": the soft pushes stay quiet during a
  // saved shift. Time-critical reminders are never touched — silencing those is
  // how people miss things.
  if (proactive && (await atWork(base44, email, new Date(sendAtMs)))) {
    console.log(`[sendLedger] BLOCKED ${kind} for ${email} (at work)`);
    return { allowed: false, reason: 'at_work' };
  }

  for (const entry of entries) {
    const diff = Math.abs(new Date(entry.send_at).getTime() - sendAtMs);
    const sameTask = !!taskId && entry.task_id === taskId;
    const duplicate = sameTask && diff < SAME_TASK_GAP_MS;
    // The morning summary's first claim on the hour after they wake up (Anna,
    // Oct 12 2026): it doesn't wait behind softer pushes or the owner's own
    // health notes (those wait for it), and keeps only 5 minutes from a
    // reminder tied to a real moment.
    const ownerNote = String(entry.kind || '').startsWith('owner_');
    const softer = PROACTIVE_KINDS.has(entry.kind) || ownerNote;
    // The owner's own health notes (owner_daily, owner_alert) are developer
    // mail to Anna's phone, not reminders: a nudge doesn't wait behind them.
    // On Oct 27 2026 her 9:21 AM "yesterday: something was off" note held her
    // 9:15 nudge through 9:39, which then ran into the 10:00 reminder's window.
    const stacked = proactive && !ownerNote && !(opts.firstClaim && softer)
      && diff < (opts.urgent || opts.firstClaim ? URGENT_STACK_GAP_MS : STACK_GAP_MS);
    // A time-critical push wins its slot: a pending proactive push already
    // booked there is cancelled rather than letting the two land together.
    const entryPending = new Date(entry.send_at).getTime() > Date.now() && !!entry.notification_id;
    const evicts = !proactive && EVICTABLE_KINDS.has(entry.kind) && entryPending && diff < STACK_GAP_MS;
    if (!duplicate && !stacked && !evicts) continue;

    if (!(await stillLive(entry.notification_id))) {
      try { await ledger(base44).delete(entry.id); } catch {}
      continue;
    }
    if (evicts) {
      await evict(base44, entry);
      continue;
    }
    const reason = duplicate ? 'same_task_duplicate' : 'stacked_on_other_push';
    console.log(`[sendLedger] BLOCKED ${kind} for ${email} (${reason}) — conflicts with ${entry.kind} "${entry.title || ''}" at ${entry.send_at}`);
    // The booking that blocked it, verified live just above. A caller that
    // finds its task has no id on file can adopt this one instead of trying
    // again (cronRefillReminders' abandoned-booking rescue, Nov 4 2026).
    return { allowed: false, reason, conflict: { notificationId: String(entry.notification_id || ''), sendAt: String(entry.send_at || ''), kind: String(entry.kind || ''), title: String(entry.title || '') } };
  }
  return { allowed: true };
}

export async function ledgerRecord(
  base44: any,
  opts: { email: string; taskId?: string | null; kind?: string; source: string; sendAt?: string | Date; notificationId?: string | null; title?: string }
): Promise<void> {
  if (!opts.email) return;
  try {
    await ledger(base44).create({
      user_email: opts.email,
      task_id: opts.taskId || '',
      kind: opts.kind || 'task_reminder',
      source: opts.source,
      send_at: new Date(opts.sendAt || Date.now()).toISOString(),
      notification_id: opts.notificationId || '',
      title: (opts.title || '').slice(0, 120),
    });
  } catch (e) {
    console.error('[sendLedger] record failed:', e);
  }
}

// Drop ledger entries for bookings that were just cancelled so they can't block
// the replacement booking (snooze / edit / refill all cancel-then-rebook).
export async function ledgerCancel(base44: any, notificationIds: (string | null | undefined)[]): Promise<void> {
  const ids = (notificationIds || []).filter(Boolean) as string[];
  if (ids.length === 0) return;
  try {
    // Only bookings still ahead: one that already went out stays on the
    // record, because it reached them. Deleting those made the day look
    // lighter than it was to Smart Reminders, which budgets their attention
    // from this ledger (Oct 12 2026: Bike Night's 1 PM push vanished from it
    // when the event's reminders were re-booked that afternoon).
    await ledger(base44).deleteMany({ notification_id: { $in: ids }, send_at: { $gt: new Date().toISOString() } });
  } catch (e) {
    console.error('[sendLedger] cancel failed:', e);
  }
}

// Entries older than a few days can't conflict with anything — clear them out.
// Before they go, each is kept as an AppEvent (Anna, Nov 1 2026: "Keep 30 days
// of reminder history"), named for what OneSignal says became of it, asked
// right here (pushOutcome):
//   'reminder_sent'      it went out to at least one phone, or OneSignal
//                        couldn't say (props.outcome 'sent' | 'unknown');
//   'reminder_unreached' OneSignal tried and reached no phone (uninstalled or
//                        dead push sign-up): the person never saw it;
//   not kept at all      it was cancelled before it went.
// Until Nov 11 2026 every row still here was filed as 'reminder_sent' on the
// assumption that cancelled bookings had already left the ledger. Not every
// cancel path took them off (Focus Mode's didn't), and a push to a phone that
// had already uninstalled was "sent" too. A report read that history as: a new
// user got five Focus Mode check-ins after finishing her task, then a morning
// question, and uninstalled 20 minutes later. OneSignal: all six were
// cancelled the minute she finished, and the "push before she left" was the
// first one that failed because she was already gone. Anna, Nov 11 2026: "why
// ... am I just finding out about this". The history now says what happened,
// not what was booked.
// The ledger itself stays short (its readers expect only recent rows; Commute
// Watch's late alert checks it per task). No titles in the event, by AppEvent's
// own rule; props.send_at is when it went out (created_date is the archive
// time); props.id is the OneSignal id, so any row can be checked again later.
const LEDGER_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const ARCHIVE_BATCH = 150; // one OneSignal lookup each; the rest wait for the next hourly run
const ARCHIVE_CHUNK = 100;
const OUTCOME_AT_ONCE = 6;

// What OneSignal says became of one push. null = it can't say (no id of its
// kind, no answer, not found): filed as sent with outcome 'unknown'.
export async function pushOutcome(notificationId: any): Promise<'sent' | 'cancelled' | 'nobody' | null> {
  const id = String(notificationId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !key) return null;
  try {
    const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
      headers: { Authorization: `Basic ${key}` },
    });
    if (!res.ok) return null;
    const j: any = await res.json().catch(() => null);
    if (!j) return null;
    if (j.canceled === true) return 'cancelled';
    if (j.completed_at && !(Number(j.successful) > 0) && (Number(j.failed) > 0 || Number(j.errored) > 0)) return 'nobody';
    return 'sent';
  } catch (_) {
    return null;
  }
}

export async function ledgerPrune(base44: any): Promise<void> {
  const cutoff = new Date(Date.now() - LEDGER_KEEP_MS).toISOString();
  try {
    const old: any[] = (await ledger(base44).filter({ send_at: { $lt: cutoff } }, 'send_at', ARCHIVE_BATCH)) || [];
    if (!old.length) return;
    const outcomes: ('sent' | 'cancelled' | 'nobody' | null)[] = [];
    for (let i = 0; i < old.length; i += OUTCOME_AT_ONCE) {
      outcomes.push(...await Promise.all(old.slice(i, i + OUTCOME_AT_ONCE).map((row: any) => pushOutcome(row.notification_id))));
    }
    const never = old.filter((_: any, i: number) => outcomes[i] === 'cancelled');
    const went = old.map((row: any, i: number) => ({ row, outcome: outcomes[i] })).filter((x: any) => x.outcome !== 'cancelled');
    const kept: string[] = [];
    for (let i = 0; i < went.length; i += ARCHIVE_CHUNK) {
      const part = went.slice(i, i + ARCHIVE_CHUNK);
      try {
        await base44.asServiceRole.entities.AppEvent.bulkCreate(part.map(({ row, outcome }: any) => ({
          event: outcome === 'nobody' ? 'reminder_unreached' : 'reminder_sent',
          user_email: row.user_email || '',
          session_id: '',
          page: '',
          props: {
            task_id: row.task_id || null,
            kind: row.kind || null,
            source: row.source || null,
            send_at: row.send_at || null,
            outcome: outcome || 'unknown',
            id: row.notification_id || null,
          },
        })));
        for (const { row } of part) kept.push(row.id);
      } catch (e) {
        // Not kept: left in the ledger for the next run to try again.
        console.error('[sendLedger] reminder history not kept:', e);
        break;
      }
    }
    // Cancelled before they went: off the ledger, never in the history.
    if (never.length) {
      await ledger(base44).deleteMany({ id: { $in: never.map((r: any) => r.id) } })
        .catch((e: any) => console.error('[sendLedger] could not clear cancelled rows:', e));
      console.log(`[sendLedger] ${never.length} cancelled booking(s) left the ledger without being filed as sent`);
    }
    if (!kept.length) return;
    await ledger(base44).deleteMany({ id: { $in: kept } });
    // Never archive the same rows twice: if they're somehow still here, clear
    // the stretch by time instead (rows come oldest first), but only when every
    // row in it was dealt with this run.
    const left = (await ledger(base44).filter({ id: { $in: kept.slice(0, 50) } }, 'send_at', 1).catch(() => [])) || [];
    const lastAt = old[old.length - 1]?.send_at || '';
    if (left.length && lastAt && kept.length === went.length) await ledger(base44).deleteMany({ send_at: { $lte: lastAt, $lt: cutoff } });
  } catch (e) {
    console.error('[sendLedger] prune failed:', e);
  }
}
