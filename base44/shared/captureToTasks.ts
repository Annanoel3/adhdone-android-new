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

// ── Calling sibling functions ──────────────────────────────────────────────
// generateReminderSchedule and schedulePush are HTTP entrypoints, not
// importable modules, so they're invoked through the SDK. (Building the URL by
// hand from req.url does NOT work — inside a function that origin isn't the
// public app host, so every call silently came back empty.)
export async function callFunction(base44: any, name: string, body: unknown) {
  // asServiceRole is required for function-to-function calls; the plain client
  // is not permitted to invoke siblings from inside a function.
  const res = await base44.asServiceRole.functions.invoke(name, body);
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

export async function splitCapture(base44: any, text: string): Promise<string[]> {
  const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: SPLIT_PROMPT.replace("%TEXT%", text),
    response_json_schema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" } } },
      required: ["items"],
    },
  });
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const items = (parsed?.items || [])
    .map((s: string) => String(s || "").trim())
    .filter(Boolean);

  // Collapse accidental duplicates, and never return nothing — falling back to
  // the original text guarantees a capture can't silently vanish.
  const seen = new Set<string>();
  const unique = items.filter((s) => {
    const k = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.length ? unique : [text];
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
    // Only a rhythm the user actually asked for becomes a repeating reminder;
    // everything else is a one-shot, decided here and not by the model.
    reminder_interval: parsed.reminder_interval || "once",
    status: "active",
    day_only_task: dayOnly,
    deadline_style: parsed.deadline_style === "by" ? "by" : "on",
    notification_recipient_email: email,
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
  if (!task.next_reminder) return { scheduled: 0 };

  const plan = await callFunction(base44, "generateReminderSchedule", {
    title: task.title,
    scheduledDateISO: task.next_reminder,
    urgency: task.urgency,
    dayOnly: task.day_only_task,
    classification: task.classification,
    deadlineStyle: task.deadline_style,
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

    const res = await callFunction(base44, "schedulePush", {
      toUserExternalId: email,
      title: r.notification_title || task.title,
      body: r.notification_body || task.title,
      sendAtISO: sendAt.toISOString(),
      data: { task_id: task.id },
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

  if (ids.length) {
    await base44.asServiceRole.entities.Task.update(task.id, {
      onesignal_notification_ids: ids,
      reminder_schedule: entries,
      last_scheduled_until: entries[entries.length - 1].send_at,
    });
  }

  // planned vs scheduled differ when OneSignal rejects a send (e.g. the device
  // isn't subscribed) — worth reporting rather than silently claiming success.
  return { planned: (plan?.reminders || []).length, scheduled: ids.length };
}