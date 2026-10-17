// Server-side "capture raw text → real tasks" brain.
//
// This exists so the NATIVE share/quick-capture path never has to assemble a
// task itself. Native POSTs raw text and nothing else; every decision (is this
// one task or several, what kind of thing is it, when is it, what reminders
// does it get) happens here, in one place, fixable without a Play release.
//
// It deliberately REUSES the existing functions rather than reimplementing
// them: runTaskParse for parsing, generateReminderSchedule for the reminder
// plan, schedulePush for the actual OneSignal scheduling. Copies of that logic
// are exactly how this app ended up with two parsers that disagreed.

import OpenAI from "npm:openai";
import { runTaskParse } from "./runTaskParse.ts";
import { decideReminderInterval, isRecurringInterval } from "./reminderIntervalDecision.ts";
import { getHomeOrigin } from "./homeOrigin.ts";
import { resolveQuietHours, isInQuietHours, isTimeTheySet, placeAppReminder } from "./quietHours.ts";

// ── Calling sibling functions ──────────────────────────────────────────────
// generateReminderSchedule and schedulePush are HTTP entrypoints, not
// importable modules, so they're invoked through the SDK. (Building the URL by
// hand from req.url does NOT work — inside a function that origin isn't the
// public app host, so every call silently came back empty.)
export async function callFunction(base44: any, name: string, body: unknown) {
  // asServiceRole is required for function-to-function calls; the plain client
  // is not permitted to invoke siblings from inside a function.
  // schedulePush only accepts backend callers that present the app's internal
  // key. It travels with every sibling call; functions that don't need it ignore it.
  const res = await base44.asServiceRole.functions.invoke(name, {
    ...(body as Record<string, unknown>),
    internalKey: Deno.env.get('CRON_SECRET'),
  });
  return res?.data ?? res;
}

// ── Splitting ──────────────────────────────────────────────────────────────
// One shared text can hold several unrelated errands ("grab milk and also I
// need to call the vet"). Steps of ONE outing are not separate tasks — that
// over-splitting is what produced piles of near-duplicate rows before.
//
// The question is asked by the detectMultipleTasks function, the same one the
// app itself asks, so a capture splits the same way wherever it came from. It
// used to have its own shorter prompt here, on a different model.
export async function splitCapture(base44: any, text: string): Promise<string[]> {
  let parsed: any = {};
  try {
    const out = await callFunction(base44, "detectMultipleTasks", { text });
    parsed = out?.response ?? out ?? {};
  } catch (e) {
    // Never lose a capture over a failed split: keep it whole.
    console.error("[captureToTasks] split check failed, keeping it whole:", e?.message || e);
    return [text];
  }
  const items = (Array.isArray(parsed?.tasks) ? parsed.tasks : [])
    .map((s: string) => String(s || "").trim())
    .filter(Boolean);

  // Collapse accidental duplicates, and never return nothing — falling back to
  // the original text guarantees a capture can't silently vanish. "Duplicate"
  // includes near-copies: a paraphrasing splitter can hand back the same
  // sentence twice with one word changed ("… is Saturday" / "… on Saturday"),
  // which an exact match would miss and save as two tasks.
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) || []);
  const sameThing = (a: Set<string>, b: Set<string>) => {
    let shared = 0;
    a.forEach((w) => { if (b.has(w)) shared++; });
    const union = a.size + b.size - shared;
    return union > 0 && shared / union >= 0.75;
  };
  const kept: { text: string; words: Set<string> }[] = [];
  for (const s of items) {
    const w = words(s);
    if (!w.size || kept.some((k) => sameThing(k.words, w))) continue;
    kept.push({ text: s, words: w });
  }
  // Two pieces that turned out to be the same thing were never a real split:
  // fall back to the user's own words, exactly as a single capture would.
  if (kept.length <= 1) return [text];
  return kept.map((k) => k.text);
}

// ── Local time → UTC ───────────────────────────────────────────────────────
// The parser answers in the user's local wall-clock ("2026-09-05", "14:00").
// Stored values must be real instants, so the date/time is interpreted in the
// user's zone — not the server's, which would shift every reminder.
export function localToUTC(date: string, time: string | null, tz: string): string | null {
  if (!date) return null;
  const [h, m] = (time || "09:00").split(":").map(Number);
  const naive = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

  // Offset of that zone at that moment, found by formatting the instant in the
  // target zone and measuring the drift.
  const inTz = new Date(naive.toLocaleString("en-US", { timeZone: tz }));
  const inUTC = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inTz.getTime() - inUTC.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

// ── Parsed fields → Task record ────────────────────────────────────────────
export function buildTaskRecord(
  parsed: any,
  opts: { rawText: string; email: string; tz: string },
) {
  const { rawText, email, tz } = opts;
  const dayOnly = !!parsed.day_only_task && !parsed.target_time;

  const eventISO = parsed.target_date
    ? localToUTC(parsed.target_date, parsed.target_time, tz)
    : null;

  // A day with no clock time is an all-day thing; 9am local is only the anchor
  // the app hangs its night-before + smart nudges off, not an invented time.
  const nextReminder = eventISO;

  const dueISO = parsed.due_date
    ? localToUTC(parsed.due_date, "23:59", tz)
    : dayOnly && parsed.target_date
      ? localToUTC(parsed.target_date, "23:59", tz)
      : null;

  const record: Record<string, unknown> = {
    title: parsed.title,
    original_input: rawText,
    classification: parsed.classification || "task",
    urgency: parsed.urgency || "medium",
    energy_required: parsed.energy_required || "medium",
    takes_time: parsed.takes_time === true,
    recurrence_pattern: parsed.recurrence_pattern || "none",
    recurrence_days: Array.isArray(parsed.recurrence_days) && parsed.recurrence_days.length ? parsed.recurrence_days : null,
    // The next step this chore leads to, scheduled the moment the task is
    // marked done (see logTaskCompletion).
    follow_up_title: parsed.follow_up_title || null,
    follow_up_minutes: parsed.follow_up_minutes || null,
    // The user's own words about how to remind them ("keep reminding me until
    // I finish"), read by the reminder planners; and the clock time they named,
    // so each new occurrence of a recurring task starts at the same time.
    reminder_wish: parsed.reminder_wish || null,
    anchor_time: parsed.target_time || null,
    // They said this clock time themselves ("5 AM", "in 20 minutes"), rather
    // than the parser picking it from "before bed": the one kind of time that
    // rings through quiet hours (RULES.md §9 Q4).
    time_stated: !!parsed.target_time && parsed.time_stated === true,
    // Shared with calendar sync + the in-app pipeline — see
    // reminderIntervalDecision.ts for why this must not be re-implemented.
    reminder_interval: decideReminderInterval(parsed),
    status: "active",
    day_only_task: dayOnly,
    deadline_style: parsed.deadline_style === "by" ? "by" : "on",
    notification_recipient_email: email,
    // Booked right after create by scheduleTaskReminders; keeps the refill
    // cron off this task until the ids are written.
    reminder_scheduling_since: new Date().toISOString(),
  };

  if (parsed.location) record.location = parsed.location;
  if (nextReminder) record.next_reminder = nextReminder;
  if (dueISO) record.due_date = dueISO;
  if (eventISO && parsed.target_time) record.event_time = eventISO;
  if (parsed.end_date) record.end_date = localToUTC(parsed.end_date, "23:59", tz);

  // "Sometime this week", "by Friday": a DEADLINE, not the day it happens.
  // The task is on Today from now until that day, the way a task with a
  // start date already works app-wide (Anna, Oct 14 2026: "by a certain date
  // ... on my task list for today and every day of this week"). Same rule as
  // deadlineWindowStart in taskSchedule.js; nothing tied to its day (an
  // event, a birthday, a repeat) and no window for a deadline that is today.
  const deadlineDay = parsed.due_date || (dayOnly ? parsed.target_date : null);
  const tiedToDay = record.classification === "event" || record.classification === "birthday"
    || (record.recurrence_pattern && record.recurrence_pattern !== "none");
  if (record.deadline_style === "by" && deadlineDay && !tiedToDay && String(deadlineDay) > localToday(tz)) {
    record.start_date = new Date().toISOString();
  }

  return record;
}

// ── Trackers ───────────────────────────────────────────────────────────────
// The one look the Parking Lot page gives each new idea (ParkingLot.jsx
// judgeIdea): a reading for something they already keep track of? Done HERE,
// the moment a capture lands, so a reading shared from the phone is already on
// its tracker when they open the Parking Lot — not a plain idea card that sits
// there for a few seconds until the page's own look folds it in (Anna, Oct 14
// 2026: "it should just do that immediately"). The same question, word for
// word, and the same name matching as the page; keep the two together.
//
// Only readings for trackers they already have are folded here. Something NEW
// to keep track of is handed to the page, which starts the tracker and asks
// its "remind you to log?" question (that part lives on the page). The row
// arrives marked tracker_checked (createParkingLotIdeas lookFirst) so the
// page's look stays out of the way; handing back clears that mark. A folded
// reading is HIDDEN (converted_to_task: true, which the page never loads), not
// deleted: the row keeps its capture_id, so a second delivery of the same
// capture is still caught as a duplicate instead of logging twice.
export const trackerCanon = (name: unknown): string => {
  const k = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ({ hr: "heartrate", pulse: "heartrate", heartbeat: "heartrate", bpm: "heartrate", bp: "bloodpressure", pressure: "bloodpressure", temp: "temperature", wt: "weight" } as Record<string, string>)[k] || k;
};

export function trackerJudgePrompt(text: string, trackers: { id: string; name: string }[]): string {
  return `Someone typed this into the Parking Lot of an app for people with ADHD (a place to dump thoughts so they don't lose them):
"${String(text || '').slice(0, 500)}"

Things they already keep track of here (they log entries to these over time): ${trackers.length ? JSON.stringify(trackers) : 'none yet'}

What is it? It can be more than one thing at once ("blood pressure 91 over 57 and heart rate 89" is a reading for blood pressure AND a reading for heart rate) — give one item per part, in order:
1. An entry for one of those they already keep track of (a reading, a number, a note for it), like "weight 181" when they track their weight: {"log_to": "<that one's id>", "entry": "<just this part, as they said it, without its name>", "note": "<see below, else null>"}. Match by meaning, not spelling: "heartrate", "heart rate", "hr", "pulse" and "bpm" are all the same thing, "bp" is blood pressure. Something they already keep track of is ALWAYS 1 — never start a second one for it under a different spelling.
2. They want to keep track of something over time, logging it again and again. It can be anything they choose: a measurement, money spent, a mood, how their day went. A reading for something they don't track yet counts, with that reading as its first entry. {"track": "<a short name for it, in their words>", "entry": "<an entry if they already gave one, else null>", "note": "<see below, else null>", "remind": "<daily, weekly or monthly if they said how often, else null>", "time": "<HH:MM, 24-hour, if they said a time, else null>"}
3. Anything else: an idea, a to-do, a list, a note, a one-time thing. {"none": true}

note: anything else they said that goes with a reading — when it was taken, what they had just done, eaten or taken, how they felt — in their words, without the reading itself. Context that applies to the whole sentence goes on every part. "blood pressure is 98/70 and heart is 89 bpm. this is an hour after taking mestinon for the first time and eating a small snack." → entry "98/70" and entry "89 bpm", each with the note "an hour after taking mestinon for the first time and eating a small snack".

Judge by what they mean. Only 1 or 2 when they clearly mean logging something over time; a to-do that mentions a number is 3. An entry for one they already track has to actually be about that thing (its value, or a note on it); words about anything else ("this is an idea", "buy milk") are never an entry for it, even when it's the only thing they track. A list of things to get or do ("supplies to buy") is 3, not something to keep track of. When there is no entry or note, give null, never the word "null". Answer with JSON only, in this shape: {"actions": [ ... ]} — one object per part, or a single {"none": true}.`;
}

export async function foldIdeaIntoTrackers(base44: any, idea: { id: string; title: string }) {
  // The page's look takes it from here.
  const handBack = async (why: string) => {
    await base44.entities.ParkingLotIdea.update(idea.id, { tracker_checked: false }).catch(() => {});
    return { folded: false, why };
  };
  try {
    const rows = await base44.entities.ParkingLotIdea.filter({ tracker: true, converted_to_task: false }).catch(() => []);
    const trackers = (rows || []).filter((i: any) => i && i.tracker && !i.parent_idea_id && i.id !== idea.id);
    if (trackers.length === 0) return await handBack("no trackers yet");
    const prompt = trackerJudgePrompt(idea.title, trackers.map((i: any) => ({ id: i.id, name: i.idea })));
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    // gpt-6-astra, like the page's look (categorizeIdea): gpt-4o-mini logged
    // "this is an idea" as a heart rate reading (Oct 16 2026). Anna, Oct 17 2026: "Move them to astra like I already asked weeks ago" (she asked for the newest model everywhere on Sept 17 2026).
    const completion = await openai.chat.completions.create({ model: "gpt-6-astra", reasoning_effort: "low", messages: [{ role: "user", content: prompt }] });
    const raw = String(completion.choices?.[0]?.message?.content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let out: any = null;
    try { out = JSON.parse(raw); } catch (_) { out = null; }
    if (!out || typeof out !== "object") {
      // An answer that isn't what was asked for counts as "not a tracker"
      // (same as the page: it stays marked, so it isn't asked again); no
      // answer at all goes to the page's look.
      if (raw) return { folded: false, why: "no usable answer" };
      return await handBack("no answer");
    }
    const actions = (Array.isArray(out.actions) ? out.actions : [out]).filter((a: any) => a && typeof a === "object");
    const sameName = (x: unknown, y: unknown) => trackerCanon(x) !== "" && trackerCanon(x) === trackerCanon(y);
    const logs: { target: any; entry: string; note: string }[] = [];
    let wantsNew = false;
    // The word "null" (or "undefined") is an empty answer, not an entry: a
    // tracker got an entry reading "null" on Oct 16 2026.
    const said = (v: unknown) => {
      const s = typeof v === "string" ? v.trim() : "";
      return /^(null|undefined)$/i.test(s) ? "" : s;
    };
    for (const a of actions) {
      const entry = said(a.entry);
      const note = said(a.note).slice(0, 300);
      const trackName = said(a.track).slice(0, 120);
      // A "new" one with the name of one they already have is an entry for it.
      const target = (a.log_to ? trackers.find((i: any) => i.id === a.log_to) : null)
        || (trackName ? trackers.find((i: any) => sameName(i.idea, trackName)) : null);
      if (target && entry) logs.push({ target, entry, note });
      else if (trackName && !target) wantsNew = true;
    }
    if (wantsNew) return await handBack("starts a new tracker (the page does that)");
    if (logs.length === 0) {
      // Not a reading: stays marked, so the page doesn't ask again either.
      await base44.entities.ParkingLotIdea.update(idea.id, { tracker_checked: true }).catch(() => {});
      return { folded: false, why: "not a reading" };
    }
    const at = new Date().toISOString();
    for (const { target, entry, note } of logs) {
      const fresh = await base44.entities.ParkingLotIdea.get(target.id).catch(() => null);
      const entries = [...((fresh || target).tracker_entries || []), { at, text: entry, ...(note ? { note } : {}) }];
      await base44.entities.ParkingLotIdea.update(target.id, { tracker_entries: entries });
    }
    await base44.entities.ParkingLotIdea.update(idea.id, { converted_to_task: true, tracker_checked: true });
    // Readings that arrived in one sentence belong together: their trackers
    // are linked both ways, so History shows them on one chart (same as the
    // page's linkTrackers).
    const together = Array.from(new Set(logs.map((l) => l.target.id)));
    if (together.length >= 2) {
      for (const id of together) {
        const row = await base44.entities.ParkingLotIdea.get(id).catch(() => null);
        if (!row) continue;
        const have: string[] = Array.isArray(row.tracker_companions) ? row.tracker_companions : [];
        const want = Array.from(new Set([...have, ...together.filter((x) => x !== id)]));
        if (want.length !== have.length) await base44.entities.ParkingLotIdea.update(id, { tracker_companions: want }).catch(() => {});
      }
    }
    console.log(`[captureToTasks] reading(s) logged straight to ${logs.map((l) => l.target.idea).join(", ")}`);
    return { folded: true, logged: logs.map((l) => ({ tracker: l.target.idea, entry: l.entry })) };
  } catch (e: any) {
    console.error("[captureToTasks] tracker look failed (the page will look instead):", e?.message || e);
    return await handBack("error");
  }
}

// ── Reminders ──────────────────────────────────────────────────────────────
// Turns the reminder PLAN (relative offsets) into real scheduled pushes, then
// records the OneSignal ids on the task so they can be cancelled later.
export async function scheduleTaskReminders(
  base44: any,
  task: any,
  parsed: any,
  email: string,
  tz: string,
) {
  if (!task.next_reminder) {
    await base44.asServiceRole.entities.Task.update(task.id, { reminder_scheduling_since: null });
    return { scheduled: 0 };
  }

  // A task the user asked to be nagged about at a rhythm, starting at a clock
  // time ("at 10, keep reminding me until I finish"): book only that first
  // ping here. The refill cron owns the rhythm from there — it continues from
  // last_scheduled_until at the task's interval until the task is done.
  // The owner, for their quiet hours (and below, home and the recorder).
  let owner: any = null;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    owner = users?.[0] || null;
  } catch (e) {
    console.error("[captureToTasks] owner lookup failed:", e);
  }
  const quiet = resolveQuietHours(owner);

  if (isRecurringInterval(task.reminder_interval)) {
    let firstAt = new Date(task.next_reminder);
    // Inside quiet hours only a time they said themselves goes out as is
    // (RULES.md §9 Q4); a time the app picked waits for quiet hours to end.
    if (quiet.enabled && task.quiet_hours_exempt !== true && !isTimeTheySet(task, firstAt.getTime(), tz)) {
      firstAt = new Date(placeAppReminder(firstAt.getTime(), null, quiet, tz) as number);
    }
    const ids: string[] = [];
    if (firstAt.getTime() > Date.now()) {
      const t = String(task.title || "").length > 40 ? `${String(task.title).slice(0, 37)}...` : String(task.title || "");
      const res = await callFunction(base44, "schedulePush", {
        toUserExternalId: email,
        title: `🔔 ${t}`,
        body: `It's time — "${t}". You've got this! 💪`,
        sendAtISO: firstAt.toISOString(),
        data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency || "medium", type: "task_reminder" },
      });
      if (res?.notificationId) ids.push(res.notificationId);
    }
    await base44.asServiceRole.entities.Task.update(task.id, {
      reminder_scheduling_since: null,
      ...(ids.length ? { onesignal_notification_ids: ids, last_scheduled_until: firstAt.toISOString() } : {}),
    });
    return { planned: 1, scheduled: ids.length };
  }

  // Only an event gets a plan of reminders. Any other task gets ONE reminder,
  // at its own time, or nothing booked when it has none (all day, a "by"
  // deadline): Smart Reminders has it (Anna, Oct 12 2026: "It's literally just
  // supposed to be smart reminders and events and birthdays ... and tasks that
  // the user gave a specific time to"). Same rule as the in-app path
  // (multiReminderScheduler.scheduleMultiReminders).
  if (task.classification !== "event") {
    const ownTime = task.reminder_interval === "once" && !task.day_only_task && task.deadline_style !== "by";
    const at = new Date(task.next_reminder);
    const entries: any[] = [];
    const ids: string[] = [];
    // A time the app picked never rings inside quiet hours.
    const pickedInQuiet = quiet.enabled && task.quiet_hours_exempt !== true
      && isInQuietHours(at, quiet.startMin, quiet.endMin, tz) && !isTimeTheySet(task, at.getTime(), tz);
    if (ownTime && at.getTime() > Date.now() + 2 * 60 * 1000 && !pickedInQuiet) {
      const full = String(task.title || "").trim() || "your task";
      const t = full.length > 40 ? `${full.slice(0, 37)}...` : full;
      const words = { title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` };
      const res = await callFunction(base44, "schedulePush", {
        toUserExternalId: email,
        ...words,
        sendAtISO: at.toISOString(),
        data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency || "medium", type: "task_reminder" },
        buttons: [
          { id: "snooze_15", text: "Snooze 15 min" },
          { id: "snooze_60", text: "Snooze 1 hour" },
          { id: "complete", text: "✅ Done" },
        ],
      });
      if (res?.notificationId) ids.push(res.notificationId);
      // schedulePush rewrites the plain words in the brief's voice
      // (shared/reminderTitle.ts, atTimeWords); the ones that went out are the ones saved.
      if (res?.notificationId && res?.words?.title && res?.words?.body) {
        words.title = res.words.title;
        words.body = res.words.body;
      }
      // Kept as a PLANNED entry when it couldn't be booked: the refill books it.
      entries.push({
        notification_id: res?.notificationId || `planned_${task.id}_at_${at.getTime()}`,
        send_at: at.toISOString(),
        label: "at the time",
        notification_title: words.title,
        notification_body: words.body,
      });
    }
    await base44.asServiceRole.entities.Task.update(task.id, {
      reminder_scheduling_since: null,
      ...(entries.length ? { reminder_schedule: entries, onesignal_notification_ids: ids } : {}),
    });
    return { planned: entries.length, scheduled: ids.length };
  }

  // Service-role calls have no end-user session, so the home origin the
  // travel-aware "leave now" reminder needs has to be looked up and passed.
  // An event also needs to know whether the owner's phone can record notes.
  let homeOrigin = "";
  let avoidTolls = false;
  let canRecord = false;
  if (owner && (task.location || task.classification === "event")) {
    homeOrigin = getHomeOrigin(owner);
    avoidTolls = owner.commute_avoid_tolls === true;
    canRecord = owner.notes_can_record === true;
  }

  const plan = await callFunction(base44, "generateReminderSchedule", {
    title: task.title,
    scheduledDateISO: task.next_reminder,
    urgency: task.urgency,
    dayOnly: task.day_only_task,
    // No clock time (only the 9 AM anchor): an event gets the day before and
    // the morning of, never "It's time" at 9 AM (Oct 12 2026).
    noClockTime: !task.event_time,
    classification: task.classification,
    deadlineStyle: task.deadline_style,
    location: task.location || '',
    homeOrigin,
    avoidTolls,
    reminderWish: task.reminder_wish || parsed?.reminder_wish || null,
    timezone: tz,
    canRecord,
  });

  const scheduled = new Date(task.next_reminder).getTime();
  const entries: any[] = [];
  const ids: string[] = [];

  // The plan's hour/minute are the user's LOCAL clock ("night before at 20:00"
  // means 8pm where they live). Setting those as UTC hours is why a night-before
  // reminder landed mid-afternoon — so the local calendar day is taken in the
  // user's zone and the wall-clock time is converted back through it.
  const localDayOffset = (daysBefore: number) => {
    const d = new Date(scheduled - daysBefore * 86400000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    return parts; // YYYY-MM-DD
  };

  // With no clock time, "before the time" means nothing: the 9 AM anchor is not
  // when it happens.
  const noClock = !task.event_time;
  for (const r of plan?.reminders || []) {
    if (noClock && r.relative_minutes_before != null) continue;
    const sendAtISO = r.relative_minutes_before != null
      ? new Date(scheduled - r.relative_minutes_before * 60000).toISOString()
      : localToUTC(
          localDayOffset(r.days_before || 0),
          `${String(r.hour ?? 9).padStart(2, "0")}:${String(r.minute ?? 0).padStart(2, "0")}`,
          tz,
        );

    if (!sendAtISO) continue;
    let sendAt = new Date(sendAtISO);
    let moved = false;
    // Quiet hours (RULES.md §9 Q4): the time they said themselves goes out at
    // that time, alarm and all (a 5 AM flight). Anything the app picked that
    // lands inside them (the hour-before heads-up for that flight) moves to
    // when they end, or is dropped when that's too late to be any use. This
    // path used to book the plan as it came, quiet hours or not.
    if (quiet.enabled && task.quiet_hours_exempt !== true
        && isInQuietHours(sendAt, quiet.startMin, quiet.endMin, tz)
        && !isTimeTheySet(task, sendAt.getTime(), tz)) {
      const placed = placeAppReminder(sendAt.getTime(), task.day_only_task || noClock ? null : scheduled, quiet, tz);
      if (placed == null) continue;
      sendAt = new Date(placed);
      moved = true;
    }
    if (sendAt.getTime() <= Date.now()) continue;
    // A reminder moved onto another one's minute is the same reminder.
    if (moved && entries.some((x) => Math.abs(new Date(x.send_at).getTime() - sendAt.getTime()) < 5 * 60 * 1000)) continue;

    // Same payload shape as every other booking path: schedulePush reads
    // data.taskId / data.type for the collision ledger, and the tap-through
    // handler reads screen + taskId. A clock-time reminder ("morning of",
    // "night before") is a check-in — it yields to time-critical pushes.
    // The type also decides the buttons the phone puts on the push
    // (TaskActions): a task's reminder gets Done and Snooze, an EVENT's gets
    // Snooze only (an event isn't something you finish early), a check-in
    // none. Captured events used to go out as task reminders, with Done on
    // them (Oct 13 2026) — the same rule as multiReminderScheduler now.
    const pushType = r.relative_minutes_before == null
      ? "task_checkin"
      : (task.classification === "event" ? "event_reminder" : "task_reminder");
    const res = await callFunction(base44, "schedulePush", {
      toUserExternalId: email,
      title: r.notification_title || task.title,
      body: r.notification_body || task.title,
      sendAtISO: sendAt.toISOString(),
      data: {
        screen: "/TaskNotification",
        taskId: task.id,
        urgency: task.urgency || "medium",
        type: pushType,
      },
    });

    if (res?.notificationId) {
      ids.push(res.notificationId);
      entries.push({
        notification_id: res.notificationId,
        // The minute it really went at: schedulePush moves a heads-up that
        // would land on another push (Bike Night, Oct 13 2026).
        send_at: (typeof res.sendAt === 'string' && res.sendAt) || sendAt.toISOString(),
        label: r.label,
        notification_title: r.notification_title,
        notification_body: r.notification_body,
      });
    }
  }

  // One write: the ids (if any) land together with clearing the in-progress
  // marker, so the cron can never see "scheduling" without the ids, or vice versa.
  await base44.asServiceRole.entities.Task.update(task.id, {
    reminder_scheduling_since: null,
    ...(ids.length
      ? {
          onesignal_notification_ids: ids,
          reminder_schedule: entries,
          last_scheduled_until: entries[entries.length - 1].send_at,
        }
      : {}),
  });

  // planned vs scheduled differ when OneSignal rejects a send (e.g. the device
  // isn't subscribed) — worth reporting rather than silently claiming success.
  return { planned: (plan?.reminders || []).length, scheduled: ids.length };
}

// ── What kind of thing is it ───────────────────────────────────────────────
// The SAME question the in-app Add button asks, asked in the SAME place, so a
// capture from the share sheet / pinned notification / widget lands where it
// would have landed had it been typed into the app: a task, an idea for the
// Parking Lot, a birthday, something meant for ADHDone itself, or a mix.
// Before this existed, everything captured from outside the app became a Task,
// even a pure idea.
//
// The prompt itself lives inside the checkTaskCategory function, not here and
// not in the web pipeline, so the two entry points cannot drift apart. Send it
// raw text, the person's own date and their about-me line, nothing else.
const KINDS = ["task", "parking_lot", "birthday", "app_feedback", "mixed"];
export const TASK_KIND = { category: "task", is_list: false, main_idea: "", items: [], parts: [] };

export async function classifyCapture(base44: any, text: string, opts: { today?: string; aboutMe?: string } = {}) {
  let problem = "";
  try {
    const out = await callFunction(base44, "checkTaskCategory", {
      text,
      today: opts.today || undefined,
      about_me: opts.aboutMe || "",
    });
    const r = out?.response ?? out;
    if (r && KINDS.includes(r.category)) return r;
    problem = `unusable answer ${JSON.stringify(r)?.slice(0, 200)}`;
  } catch (e) {
    problem = `check failed: ${e?.response?.status || ""} ${e?.message || e}`.trim();
  }
  console.error(`[captureToTasks] ${problem}`);
  // A failed or unrecognised answer must NEVER lose the capture. Falling back
  // to "task" keeps the old behaviour, which is a misfiled idea at worst —
  // never a dropped one. "why" says so in the capture's own log line.
  return { ...TASK_KIND, why: `(fell back to task: ${problem})` };
}

// The person's own calendar date, for "her birthday is tomorrow".
export function localToday(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

// A birthday the classifier recognised: the same yearly record the in-app
// Add button and the calendar import make. The hourly refill job plans and
// books its reminders (1 week before, the day before, the day of), the same way
// it keeps every birthday going year after year. Null when there is no usable
// day, or no name for someone else's birthday: then it is saved as a task.
export async function createBirthdayTask(
  base44: any,
  kind: any,
  rawText: string,
  opts: { email: string; tz: string; captureId?: string },
) {
  const month = Number(kind?.birthday_month);
  const day = Number(kind?.birthday_day);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const own = kind?.birthday_is_own === true;
  const person = own ? null : (String(kind?.birthday_person || "").trim() || null);
  if (!own && !person) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = Number(localToday(opts.tz).slice(0, 4));
  // Feb 29 falls back to Feb 28 in a year that doesn't have it.
  const dateFor = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${pad(month)}-${pad(month === 2 && day === 29 && !leap ? 28 : day)}`;
  };
  let at = localToUTC(dateFor(year), "09:00", opts.tz);
  if (!at || new Date(at).getTime() <= Date.now()) at = localToUTC(dateFor(year + 1), "09:00", opts.tz);
  if (!at) return null;

  const record: Record<string, unknown> = {
    title: own ? "🎂 Your Birthday" : `🎂 ${person}'s Birthday`,
    description: own ? "Your birthday." : `Birthday reminder for ${person}.`,
    original_input: rawText,
    urgency: "medium",
    energy_required: "low",
    status: "active",
    reminder_interval: "once",
    recurrence_pattern: "yearly",
    classification: "birthday",
    is_own_birthday: own,
    birthday_person: person,
    birthday_remind_week_before: !own,
    birthday_remind_day_before: !own,
    birthday_remind_day_of: true,
    next_reminder: at,
    notification_recipient_email: opts.email,
    onesignal_notification_ids: [],
  };
  if (opts.captureId) record.capture_id = opts.captureId;
  // Created as the USER: Task RLS keys off created_by.
  return await base44.entities.Task.create(record);
}

// Something meant for ADHDone itself (a feature they want, something broken).
// Their words are kept in the Parking Lot so nothing is lost, and the app
// offers to send them to the developer the next time it opens (the
// FeedbackPrompt popup). Nothing leaves the app unless they say yes there. A
// popup that is already waiting for an answer is left alone.
export async function queueFeedbackPrompt(base44: any, text: string) {
  try {
    const me = await base44.auth.me();
    const waiting = me?.pending_feedback_prompt;
    if (waiting?.text && !waiting?.answered_at) return false;
    await base44.auth.updateMe({
      pending_feedback_prompt: { text: String(text).trim().slice(0, 2000), queued_at: new Date().toISOString() },
    });
    return true;
  } catch (e) {
    console.error("[captureToTasks] could not queue the send-to-the-developer question:", e?.message);
    return false;
  }
}

// Creates the parking lot row(s) for a capture the classifier called an idea.
// Mirrors the in-app behaviour exactly: a real list becomes a parent idea with
// checkbox children, anything else becomes one plain idea holding the user's
// own words (never the classifier's paraphrase of them).
//
// Created as the USER, not the service role: ParkingLotIdea RLS keys off
// created_by, so a service-role insert saves a row the user can never see.
// lookFirst: the server will give this idea its tracker look right away
// (foldIdeaIntoTrackers), so it is saved already marked tracker_checked and
// the Parking Lot page's own look leaves it alone until the server hands it
// back — otherwise both could log the same reading. Lists are never readings.
export async function createParkingLotIdeas(
  base44: any,
  category: any,
  rawText: string,
  captureId?: string,
  lookFirst = false,
) {
  const stamp = (rec: Record<string, unknown>) =>
    captureId ? { ...rec, capture_id: captureId } : rec;
  const made: { id: string; title: string }[] = [];

  if (category?.is_list && Array.isArray(category.items) && category.items.length > 1) {
    const parent = await base44.entities.ParkingLotIdea.create(stamp({
      idea: category.main_idea || rawText.trim(),
      converted_to_task: false,
      list_format: "checkbox",
    }));
    made.push({ id: parent.id, title: parent.idea });
    for (const item of category.items) {
      const child = await base44.entities.ParkingLotIdea.create(stamp({
        idea: item,
        parent_idea_id: parent.id,
        converted_to_task: false,
        list_format: "checkbox",
      }));
      made.push({ id: child.id, title: child.idea });
    }
    return made;
  }

  const one = await base44.entities.ParkingLotIdea.create(stamp({
    idea: rawText.trim(),
    converted_to_task: false,
    list_format: "plain",
    ...(lookFirst ? { tracker_checked: true } : {}),
  }));
  made.push({ id: one.id, title: one.idea });
  return made;
}
