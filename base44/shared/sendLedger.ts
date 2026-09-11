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
//  - DON'T STACK: proactive pushes (nudge / digest / motivation / general) hold
//    off when ANY other push to that user lands within STACK_GAP_MS. They aren't
//    time-critical, so they yield to reminders the user explicitly set.
//
// A conflicting entry is verified against OneSignal before it blocks anything:
// if that booking was cancelled (many cancel paths don't touch the ledger), the
// stale entry is dropped and the send goes through.

const SAME_TASK_GAP_MS = 9 * 60 * 1000;
const STACK_GAP_MS = 20 * 60 * 1000;
const PROACTIVE_KINDS = new Set(['smart_nudge', 'daily_digest', 'motivation', 'general']);

function ledger(base44: any) {
  return base44.asServiceRole.entities.NotificationLedger;
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

export async function ledgerCheck(
  base44: any,
  opts: { email: string; taskId?: string | null; kind?: string; sendAt?: string | Date }
): Promise<{ allowed: boolean; reason?: string }> {
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
  for (const entry of entries) {
    const diff = Math.abs(new Date(entry.send_at).getTime() - sendAtMs);
    const sameTask = !!taskId && entry.task_id === taskId;
    const duplicate = sameTask && diff < SAME_TASK_GAP_MS;
    const stacked = proactive && diff < STACK_GAP_MS;
    if (!duplicate && !stacked) continue;

    if (!(await stillLive(entry.notification_id))) {
      try { await ledger(base44).delete(entry.id); } catch {}
      continue;
    }
    const reason = duplicate ? 'same_task_duplicate' : 'stacked_on_other_push';
    console.log(`[sendLedger] BLOCKED ${kind} for ${email} (${reason}) — conflicts with ${entry.kind} "${entry.title || ''}" at ${entry.send_at}`);
    return { allowed: false, reason };
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
    await ledger(base44).deleteMany({ notification_id: { $in: ids } });
  } catch (e) {
    console.error('[sendLedger] cancel failed:', e);
  }
}

// Entries older than a few days can't conflict with anything — clear them out.
export async function ledgerPrune(base44: any): Promise<void> {
  try {
    await ledger(base44).deleteMany({ send_at: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() } });
  } catch (e) {
    console.error('[sendLedger] prune failed:', e);
  }
}