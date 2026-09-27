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

import { runTaskParse } from "./runTaskParse.ts";
import { decideReminderInterval, isRecurringInterval } from "./reminderIntervalDecision.ts";
import { getHomeOrigin } from "./homeOrigin.ts";

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

  return record;
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
  if (isRecurringInterval(task.reminder_interval)) {
    const firstAt = new Date(task.next_reminder);
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

  // Service-role calls have no end-user session, so the home origin the
  // travel-aware "leave now" reminder needs has to be looked up and passed.
  // An event also needs to know whether the owner's phone can record notes.
  let homeOrigin = "";
  let avoidTolls = false;
  let canRecord = false;
  if (task.location || task.classification === "event") {
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email });
      homeOrigin = getHomeOrigin(users?.[0]);
      avoidTolls = users?.[0]?.commute_avoid_tolls === true;
      canRecord = users?.[0]?.notes_can_record === true;
    } catch (e) {
      console.error("[captureToTasks] home origin lookup failed:", e);
    }
  }

  const plan = await callFunction(base44, "generateReminderSchedule", {
    title: task.title,
    scheduledDateISO: task.next_reminder,
    urgency: task.urgency,
    dayOnly: task.day_only_task,
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

  for (const r of plan?.reminders || []) {
    const sendAtISO = r.relative_minutes_before != null
      ? new Date(scheduled - r.relative_minutes_before * 60000).toISOString()
      : localToUTC(
          localDayOffset(r.days_before || 0),
          `${String(r.hour ?? 9).padStart(2, "0")}:${String(r.minute ?? 0).padStart(2, "0")}`,
          tz,
        );

    if (!sendAtISO) continue;
    const sendAt = new Date(sendAtISO);
    if (sendAt.getTime() <= Date.now()) continue;

    // Same payload shape as every other booking path: schedulePush reads
    // data.taskId / data.type for the collision ledger, and the tap-through
    // handler reads screen + taskId. A clock-time reminder ("morning of",
    // "night before") is a check-in — it yields to time-critical pushes.
    const res = await callFunction(base44, "schedulePush", {
      toUserExternalId: email,
      title: r.notification_title || task.title,
      body: r.notification_body || task.title,
      sendAtISO: sendAt.toISOString(),
      data: {
        screen: "/TaskNotification",
        taskId: task.id,
        urgency: task.urgency || "medium",
        type: r.relative_minutes_before != null ? "task_reminder" : "task_checkin",
      },
    });

    if (res?.notificationId) {
      ids.push(res.notificationId);
      entries.push({
        notification_id: res.notificationId,
        send_at: sendAt.toISOString(),
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
export async function createParkingLotIdeas(
  base44: any,
  category: any,
  rawText: string,
  captureId?: string,
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
  }));
  made.push({ id: one.id, title: one.idea });
  return made;
}
