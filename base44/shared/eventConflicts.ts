// Double bookings and duplicates: ONE checker for events from anywhere.
//
// The Sep 14 2026 popup (EventConflictWarning) only ran for an event added in
// the app, and only looked for overlaps. Anna, Oct 23 2026: Julianna's phone
// calendar brought in her dentist at noon and her cat's vaccines at 12:30 the
// same day, two March 5 appointments that look like one, and two September 28
// birthdays for the same person, and nothing said a word. Her rules:
//  - An overlap gets a popup right after it's found; a likely duplicate gets a
//    popup asking whether to combine them, with a choice of which details to
//    keep.
//  - If they didn't see the popup, the same thing goes out as one normal
//    notification.
//  - One feature, however the event got here: added in the app, edited to a
//    new time, or imported from a calendar.
//
// What is checked (findOverlaps / duplicateCandidates):
//  - Overlap: two timed events starting within an hour of each other. Events
//    carry a start but no length, so an hour is the honest "you can't be in
//    both places" (the Sep 14 rule, unchanged). Day-only events have no clock
//    time and can't overlap anything.
//  - Duplicate: two items on the same day (events, or an event and a task;
//    never birthdays, steps or anything done) that start within two hours of
//    each other, or are both all-day, and that the model judges to be the same
//    thing ("Dermatologist appointment" and "appointment with Jill Hude, PA-C",
//    both at 11:30). Judged, never matched on words.
//
// Each finding is a flag on the owner's User record (event_flags), so the app
// shows it on the next open even when the sync ran with the app closed, and so
// a pair is asked about once. The flags are the app's to resolve
// (checkEventConflicts, mode resolve).

import OpenAI from 'npm:openai';
import { placeAppReminder, resolveQuietHours, userTimeZone } from './quietHours.ts';
import { ledgerCancel } from './sendLedger.ts';

export const OVERLAP_WINDOW_MS = 60 * 60 * 1000;
export const DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;
// The popup not seen this long after a flag is made: the notification goes.
export const NOTIFY_AFTER_MS = 15 * 60 * 1000;
// A pair asked about is not asked again for this long, whatever they chose.
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FLAGS = 40;

export type Flag = {
  id: string;
  kind: 'overlap' | 'duplicate';
  task_ids: [string, string];
  why?: string;
  made_at: string;
  source: string;
  seen_at?: string | null;
  resolved?: string | null;
  resolved_at?: string | null;
  notification_id?: string | null;
  notify_at?: string | null;
};

const startMs = (t: any): number => {
  const raw = t?.event_time || t?.next_reminder || t?.due_date;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

export function isTimedEvent(t: any): boolean {
  return !!t && t.classification === 'event' && t.status === 'active' && !t.silenced
    && !t.day_only_task && !t.parent_task_id && !!t.event_time && Number.isFinite(startMs(t));
}

// Anything that can be a duplicate of something: a dated event or task that is
// still open. A birthday can only be a duplicate of another birthday (two
// "Anna" birthdays on Sep 28 from two calendars: six reminders for one day).
function datedItem(t: any): boolean {
  return !!t && t.status === 'active' && !t.silenced && !t.parent_task_id && Number.isFinite(startMs(t));
}
const isBirthday = (t: any) => t?.classification === 'birthday' || !!t?.birthday_person || !!t?.is_own_birthday;

function isAllDay(t: any): boolean {
  return !t?.event_time && (!!t?.day_only_task || t?.classification === 'event' || !!t?.due_date);
}

function localDay(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export const pairKey = (a: string, b: string) => [String(a), String(b)].sort().join('|');

/** Other timed events starting within an hour of this one. */
export function findOverlaps(task: any, others: any[]): any[] {
  if (!isTimedEvent(task)) return [];
  const s = startMs(task);
  return others.filter((o) => o && o.id !== task.id && isTimedEvent(o) && Math.abs(startMs(o) - s) < OVERLAP_WINDOW_MS);
}

/** Other open dated items on the same day, close enough in time to be the same thing. */
export function duplicateCandidates(task: any, others: any[], timeZone: string): any[] {
  if (!datedItem(task)) return [];
  const s = startMs(task);
  const day = localDay(s, timeZone);
  return others.filter((o) => {
    if (!o || o.id === task.id || !datedItem(o)) return false;
    if (isBirthday(task) !== isBirthday(o)) return false;
    const os = startMs(o);
    if (localDay(os, timeZone) !== day) return false;
    if (isBirthday(task)) return true;
    if (isAllDay(task) && isAllDay(o)) return true;
    return Math.abs(os - s) <= DUPLICATE_WINDOW_MS;
  });
}

const describe = (t: any, timeZone: string) => {
  const s = startMs(t);
  const when = Number.isFinite(s)
    ? (isAllDay(t)
      ? new Date(s).toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
      : new Date(s).toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
    : 'no date';
  const notes = [t?.notes, t?.description].map((x: any) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ').slice(0, 200);
  const kind = isBirthday(t) ? `birthday${t?.birthday_person ? ` of ${t.birthday_person}` : ''}` : (t?.classification || 'task');
  return `"${t?.title || ''}" (${kind}, ${when}${t?.location ? `, at ${t.location}` : ''}${notes ? `; notes: ${notes}` : ''})`;
};

export const DUPLICATE_PROMPT = `You help ADHDone, a reminder app for people with ADHD, spot the same appointment or plan saved twice. Each pair below is two items on someone's list for the same day, close in time. Decide for each pair whether they are the SAME thing (one appointment written down twice, from two calendars or typed again) or two different things that happen to be near each other.

Judge the way a friend reading their calendar would. The same place or provider at the same time is the same thing even when the words differ ("Dermatologist appointment" and "appointment with Jill Hude, PA-C"). Two people's names or two different purposes at the same time are different things, even at the same clinic (a child's dental check and a parent's cleaning). Two birthdays on the same day are the same person when the names plainly match ("Anna" and "Anna B"), and different people when they don't. When it is a real toss-up, say they are different: a wrong "same" would merge two real plans.

Answer with JSON only: {"pairs": [{"n": <pair number>, "same": true|false, "why": "one short plain sentence"}]}`;

/** Which candidate pairs are really the same thing. [[task, other, why], ...] */
export async function judgeDuplicates(pairs: Array<[any, any]>, timeZone: string, timeoutMs = 30000): Promise<Array<[any, any, string]>> {
  if (!pairs.length) return [];
  try {
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const list = pairs.map(([a, b], i) => `${i + 1}. A: ${describe(a, timeZone)}\n   B: ${describe(b, timeZone)}`).join('\n');
    const ask = openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: DUPLICATE_PROMPT },
        { role: 'user', content: list },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 3000,
    });
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res: any = await Promise.race([ask, late]);
    if (!res) return [];
    const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const out: Array<[any, any, string]> = [];
    for (const p of Array.isArray(parsed?.pairs) ? parsed.pairs : []) {
      const i = Number(p?.n) - 1;
      if (p?.same === true && pairs[i]) out.push([pairs[i][0], pairs[i][1], String(p?.why || '').slice(0, 160)]);
    }
    return out;
  } catch (e) {
    console.log('[eventConflicts] duplicate judge failed:', (e as any)?.message || e);
    return [];
  }
}

function currentFlags(user: any, nowMs: number): Flag[] {
  const list: Flag[] = Array.isArray(user?.event_flags) ? user.event_flags.filter((f: any) => f && f.id && Array.isArray(f.task_ids)) : [];
  // Settled ones are kept a month (so the pair isn't asked about again), then dropped.
  return list.filter((f) => !f.resolved || nowMs - Date.parse(f.resolved_at || f.made_at || '') < REMEMBER_MS).slice(-MAX_FLAGS);
}

const fmtDay = (ms: number, tz: string) => new Date(ms).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

/**
 * Check these tasks against the owner's other items, flag what's found, and
 * book the fallback notification. Returns the NEW flags (with the two items
 * each refers to) so a caller with the app open can show the popup now.
 */
export async function flagConflicts(base44: any, owner: any, tasks: any[], opts: { source: string; notify?: boolean; nowMs?: number }): Promise<{ flags: Flag[]; items: Record<string, any>; notified: boolean }> {
  const nowMs = opts.nowMs ?? Date.now();
  const tz = userTimeZone(owner);
  const email = owner?.email;
  const checked = (tasks || []).filter((t) => t && t.id && t.status === 'active' && !t.parent_task_id && Number.isFinite(startMs(t)));
  // (Birthdays are checked too, against other birthdays only.)
  if (!email || !checked.length) return { flags: [], items: {}, notified: false };

  // Their open dated items, fetched once. filter() returns 50 by default.
  const others: any[] = await base44.asServiceRole.entities.Task.filter(
    { notification_recipient_email: email, status: 'active' }, '-next_reminder', 500,
  ).catch(() => []);
  const byId: Record<string, any> = {};
  for (const o of others) byId[o.id] = o;
  for (const t of checked) byId[t.id] = t;
  const pool = Object.values(byId);

  // Fresh copy of the owner's flags: a sync and an app edit can run together.
  const fresh = (await base44.asServiceRole.entities.User.filter({ email }).catch(() => []))?.[0] || owner;
  const flags = currentFlags(fresh, nowMs);
  const known = new Set(flags.map((f) => pairKey(f.task_ids[0], f.task_ids[1])));

  const made: Flag[] = [];
  const items: Record<string, any> = {};
  const dupPairs: Array<[any, any]> = [];
  const seenPair = new Set<string>();
  for (const t of checked) {
    for (const o of findOverlaps(t, pool)) {
      const k = pairKey(t.id, o.id);
      if (known.has(k) || seenPair.has(k)) continue;
      seenPair.add(k);
      made.push({ id: `${t.id}-${o.id}-o`.slice(-48), kind: 'overlap', task_ids: [t.id, o.id], made_at: new Date(nowMs).toISOString(), source: opts.source, seen_at: null, resolved: null });
      items[t.id] = t; items[o.id] = o;
    }
    for (const o of duplicateCandidates(t, pool, tz)) {
      const k = pairKey(t.id, o.id);
      if (known.has(k) || seenPair.has(`d:${k}`)) continue;
      seenPair.add(`d:${k}`);
      dupPairs.push([t, o]);
    }
  }
  for (const [t, o, why] of await judgeDuplicates(dupPairs, tz)) {
    const k = pairKey(t.id, o.id);
    // Judged the same thing: that beats an overlap flag for the same pair.
    const idx = made.findIndex((f) => pairKey(f.task_ids[0], f.task_ids[1]) === k);
    if (idx >= 0) made.splice(idx, 1);
    made.push({ id: `${t.id}-${o.id}-d`.slice(-48), kind: 'duplicate', task_ids: [t.id, o.id], why, made_at: new Date(nowMs).toISOString(), source: opts.source, seen_at: null, resolved: null });
    items[t.id] = t; items[o.id] = o;
  }
  if (!made.length) return { flags: [], items: {}, notified: false };

  // The fallback: one normal notification in 15 minutes, unless the popup is
  // seen first (resolve 'seen' cancels it). Outside their quiet hours like any
  // reminder the app picks, and not after the earlier of the two has started.
  let notified = false;
  if (opts.notify !== false) {
    const earliest = Math.min(...made.map((f) => Math.min(startMs(items[f.task_ids[0]]), startMs(items[f.task_ids[1]]))));
    const at = placeAppReminder(nowMs + NOTIFY_AFTER_MS, Number.isFinite(earliest) ? earliest : null, resolveQuietHours(fresh), tz);
    if (at != null) {
      const overlaps = made.filter((f) => f.kind === 'overlap');
      const dups = made.filter((f) => f.kind === 'duplicate');
      let title: string, body: string;
      if (made.length === 1) {
        const f = made[0];
        const a = items[f.task_ids[0]], b = items[f.task_ids[1]];
        const s = Math.min(startMs(a), startMs(b));
        if (f.kind === 'overlap') {
          title = 'Two things close together';
          body = `"${a.title}" and "${b.title}" are both on ${fmtDay(s, tz)} around ${fmtTime(s, tz)}. Open ADHDone to move one if you need to.`;
        } else {
          title = 'Same thing twice?';
          body = `"${a.title}" and "${b.title}" look like the same thing on ${fmtDay(s, tz)}. Open ADHDone to combine them or keep both.`;
        }
      } else {
        title = 'A couple of things on your calendar';
        const parts = [];
        if (overlaps.length) parts.push(`${overlaps.length} that overlap`);
        if (dups.length) parts.push(`${dups.length} that might be the same thing twice`);
        body = `${parts.join(' and ')}. Open ADHDone to sort them out.`;
      }
      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: Deno.env.get('CRON_SECRET'),
          toUserExternalId: email,
          title,
          body,
          sendAtISO: new Date(at).toISOString(),
          data: { screen: '/Tasks', type: 'event_conflict' },
        });
        const id = (res?.data || res)?.notificationId;
        if (id) {
          notified = true;
          for (const f of made) { f.notification_id = id; f.notify_at = new Date(at).toISOString(); }
        }
      } catch (e) {
        console.log('[eventConflicts] fallback notification not booked:', (e as any)?.message || e);
      }
    }
  }

  await base44.asServiceRole.entities.User.update(fresh.id, { event_flags: [...flags, ...made].slice(-MAX_FLAGS) }).catch((e: any) => {
    console.log('[eventConflicts] could not save flags:', e?.message || e);
  });
  return { flags: made, items, notified };
}

async function cancelPush(base44: any, id: string | null | undefined) {
  if (!id) return;
  await base44.asServiceRole.functions.invoke('cancelScheduled', { notificationId: id }).catch(() => {});
  await ledgerCancel(base44, [id]).catch(() => {});
}

/** The flags the app should still show: unresolved, with their two items (where both still exist and are open). */
export async function pendingFlags(base44: any, owner: any): Promise<{ flags: Flag[]; items: Record<string, any> }> {
  const nowMs = Date.now();
  const flags = currentFlags(owner, nowMs).filter((f) => !f.resolved);
  if (!flags.length) return { flags: [], items: {} };
  const ids = Array.from(new Set(flags.flatMap((f) => f.task_ids)));
  const rows: any[] = await base44.asServiceRole.entities.Task.filter({ id: { $in: ids } }, '-created_date', ids.length).catch(() => []);
  const items: Record<string, any> = {};
  for (const r of rows) items[r.id] = r;
  const live = flags.filter((f) => {
    const a = items[f.task_ids[0]], b = items[f.task_ids[1]];
    return a && b && a.status === 'active' && b.status === 'active';
  });
  // One of the two is gone or done: nothing left to ask. Settle it quietly.
  const gone = flags.filter((f) => !live.includes(f));
  if (gone.length) {
    const all = currentFlags(owner, nowMs).map((f) => gone.includes(f) ? { ...f, resolved: 'gone', resolved_at: new Date(nowMs).toISOString() } : f);
    await base44.asServiceRole.entities.User.update(owner.id, { event_flags: all }).catch(() => {});
    for (const f of gone) if (f.notification_id && !f.seen_at) await cancelPush(base44, f.notification_id);
  }
  return { flags: live, items };
}

/**
 * The owner answered a flag (or saw it). 'seen' only cancels the fallback
 * notification; 'keep' / 'different' / 'moved' settle it; 'combine' folds the
 * other item into the one they kept, with the details they chose.
 */
export async function resolveFlag(base44: any, owner: any, req: { flagId: string; action: string; keepTaskId?: string; fields?: Record<string, string> }): Promise<{ ok: boolean; error?: string; kept?: any }> {
  const nowMs = Date.now();
  const all = currentFlags(owner, nowMs);
  const flag = all.find((f) => f.id === req.flagId);
  if (!flag) return { ok: false, error: 'no such flag' };
  const stamp = new Date(nowMs).toISOString();
  const save = (patch: Partial<Flag>) => base44.asServiceRole.entities.User.update(owner.id, {
    event_flags: all.map((f) => f.id === flag.id ? { ...f, ...patch } : f),
  });

  if (req.action === 'seen') {
    if (!flag.seen_at) {
      await save({ seen_at: stamp });
      // Every flag made in that run shares the notification; the popup shows
      // them one after another, so the first one seen cancels it.
      await cancelPush(base44, flag.notification_id);
    }
    return { ok: true };
  }
  if (req.action === 'keep' || req.action === 'different' || req.action === 'moved') {
    await save({ resolved: req.action, resolved_at: stamp, seen_at: flag.seen_at || stamp });
    if (!flag.seen_at) await cancelPush(base44, flag.notification_id);
    return { ok: true };
  }
  if (req.action !== 'combine') return { ok: false, error: 'unknown action' };

  const keepId = String(req.keepTaskId || flag.task_ids[0]);
  const dropId = flag.task_ids.find((id) => id !== keepId);
  if (!dropId || !flag.task_ids.includes(keepId)) return { ok: false, error: 'keep one of the two' };
  const svc = base44.asServiceRole.entities;
  const keep = await svc.Task.get(keepId).catch(() => null);
  const drop = await svc.Task.get(dropId).catch(() => null);
  if (!keep || !drop) return { ok: false, error: 'one of them is gone' };
  if (keep.created_by !== owner.email || drop.created_by !== owner.email) return { ok: false, error: 'not yours' };

  // What they chose to keep from the other one. Default: everything from the kept one.
  const pick = req.fields || {};
  const patch: any = {};
  if (pick.title === 'other' && drop.title) patch.title = drop.title;
  if (pick.notes === 'other') { patch.notes = drop.notes || ''; patch.description = drop.description || keep.description || ''; }
  if (pick.notes === 'both') {
    const merged = [keep.notes, drop.notes].map((x: any) => String(x || '').trim()).filter(Boolean);
    patch.notes = Array.from(new Set(merged)).join('\n\n');
  }
  if (pick.location === 'other' && drop.location) patch.location = drop.location;
  if (pick.time === 'other') {
    const from = startMs(keep), to = startMs(drop);
    if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
      const delta = to - from;
      for (const f of ['event_time', 'next_reminder', 'due_date', 'end_time', 'start_date', 'end_date']) {
        const ms = keep[f] ? Date.parse(keep[f]) : NaN;
        if (Number.isFinite(ms)) patch[f] = new Date(ms + delta).toISOString();
      }
      patch.day_only_task = !!drop.day_only_task;
      patch.time_stated = !!drop.event_time || !!drop.time_stated;
      // Its reminders move by the same amount: the old bookings come down and
      // the moved entries are left planned for the hourly job to book.
      const old: any[] = Array.isArray(keep.reminder_schedule) ? keep.reminder_schedule : [];
      for (const e of old) if (e?.notification_id && !String(e.notification_id).startsWith('planned_')) await cancelPush(base44, e.notification_id);
      for (const id of keep.onesignal_notification_ids || []) await cancelPush(base44, id);
      patch.reminder_schedule = old.map((e: any, i: number) => {
        const at = e?.send_at ? Date.parse(e.send_at) + delta : NaN;
        if (!Number.isFinite(at) || at <= nowMs) return null;
        const { book_error, scheduled, ...rest } = e;
        return { ...rest, send_at: new Date(at).toISOString(), notification_id: `planned_${keep.id}_c${i}_${at}` };
      }).filter(Boolean);
      patch.onesignal_notification_ids = [];
    }
  }

  // The other copy goes: its pushes first, then its calendar rows point at the
  // kept one (so the next sync sees one task for both calendar entries, the
  // way two calendars' copies of one event already do), then the task itself.
  for (const e of (Array.isArray(drop.reminder_schedule) ? drop.reminder_schedule : [])) {
    if (e?.notification_id && !String(e.notification_id).startsWith('planned_')) await cancelPush(base44, e.notification_id);
  }
  for (const id of drop.onesignal_notification_ids || []) await cancelPush(base44, id);
  const rows: any[] = await svc.CalendarSyncedEvent.filter({ user_email: owner.email, adhd_task_id: dropId }).catch(() => []);
  for (const r of rows) await svc.CalendarSyncedEvent.update(r.id, { adhd_task_id: keepId }).catch(() => {});
  if (Object.keys(patch).length) await svc.Task.update(keepId, patch);
  await svc.Task.delete(dropId).catch(() => {});

  await save({
    resolved: 'combined', resolved_at: stamp, seen_at: flag.seen_at || stamp,
    // What was folded in, in case it's ever asked about.
    ...( { dropped: { id: drop.id, title: drop.title, at: drop.event_time || drop.next_reminder || drop.due_date || null } } as any),
  });
  if (!flag.seen_at) await cancelPush(base44, flag.notification_id);
  const kept = await svc.Task.get(keepId).catch(() => ({ ...keep, ...patch }));
  return { ok: true, kept };
}
