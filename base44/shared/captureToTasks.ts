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
import { decideReminderInterval } from "./reminderIntervalDecision.ts";
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
const SPLIT_PROMPT = `Read this and decide whether it describes ONE thing to do or SEVERAL SEPARATE ones.

"""
%TEXT%
"""

Separate means they'd be done at different times or places and neither depends on the other.
Steps of a single outing, or two ways of saying the same thing, are ONE thing — never split those.
Most input is ONE thing. Only split when it's genuinely unmistakable.

For each thing, return the user's own wording for that part, kept whole enough to still
carry its day, time and place. Do not summarize, rewrite, or add anything.

Return JSON: { "items": ["...", "..."] }`;

// `_base44` is kept so the caller's signature stays the same; the split runs
// on OpenAI with the app's own key (RULES.md rule 1), not on Base44 credits.
export async function splitCapture(_base44: any, text: string): Promise<string[]> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [{ role: "user", content: SPLIT_PROMPT.replace("%TEXT%", text) }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "capture_split",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { items: { type: "array", items: { type: "string" } } },
          required: ["items"],
        },
      },
    },
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const items = (parsed?.items || [])
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
    // The next step this chore leads to, scheduled the moment the task is
    // marked done (see logTaskCompletion).
    follow_up_title: parsed.follow_up_title || null,
    follow_up_minutes: parsed.follow_up_minutes || null,
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

  // Service-role calls have no end-user session, so the home origin the
  // travel-aware "leave now" reminder needs has to be looked up and passed.
  let homeOrigin = "";
  if (task.location) {
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email });
      homeOrigin = getHomeOrigin(users?.[0]);
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
    timezone: tz,
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

// ── Task or idea ───────────────────────────────────────────────────────────
// The SAME question the in-app Add button asks, asked in the SAME place, so a
// capture from the share sheet / pinned notification / widget lands where it
// would have landed had it been typed into the app. Before this existed,
// everything captured from outside the app became a Task, even a pure idea.
//
// The prompt itself lives inside the checkTaskCategory function, not here and
// not in the web pipeline, so the two entry points cannot drift apart. Send it
// raw text and nothing else.
export async function classifyCapture(base44: any, text: string) {
  try {
    const out = await callFunction(base44, "checkTaskCategory", { text });
    const r = out?.response ?? out;
    if (r && (r.category === "parking_lot" || r.category === "task")) return r;
    console.error("[captureToTasks] unusable category answer:", JSON.stringify(r)?.slice(0, 200));
  } catch (e) {
    console.error("[captureToTasks] category check failed:", e?.message);
  }
  // A failed or unrecognised answer must NEVER lose the capture. Falling back
  // to "task" keeps the old behaviour, which is a misfiled idea at worst —
  // never a dropped one.
  return { category: "task", is_list: false, main_idea: "", items: [] };
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
