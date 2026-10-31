import { base44 } from "@/api/base44Client";
import { myEmail } from "./winsStore";

// "How did you feel today?" (Anna, Oct 31 2026): the evening mood, asked with
// the win on the evening card and in the box the evening notification opens,
// and laid next to what got done on Insights. Private: DayMood's rule is
// created_by only, it is never shared with partners, and every read here is
// filtered to the signed-in person as well. No AI anywhere: counts only.
//
// One row per person per day (DayMood.day, the evening card's day key from
// winsStore.eveningWindow). Saving again that day updates that row. Two
// phones saving the same first answer in the same second could each create
// one; every read then takes the most recently updated row for the day and
// every save updates that same row, so the other is never shown or counted
// (nothing is ever deleted).

export const MOOD_CHANGED = "day-mood-changed";
const SAVE_TIMEOUT_MS = 20000;

export const MOODS = [
  { value: 1, face: "😣", label: "Rough" },
  { value: 2, face: "😔", label: "Low" },
  { value: 3, face: "😐", label: "Okay" },
  { value: 4, face: "🙂", label: "Good" },
  { value: 5, face: "😄", label: "Great" },
];

export const MOOD_REASONS = [
  { key: "slept_badly", label: "Slept badly" },
  { key: "sick_or_hurting", label: "Sick or hurting" },
  { key: "stressed", label: "Stressed" },
  { key: "lots_going_on", label: "Lots going on" },
  { key: "low_energy", label: "Low energy" },
];

export const NOTE_MAX = 200;
const REASON_KEYS = MOOD_REASONS.map((r) => r.key);

export function moodInfo(value) {
  return MOODS.find((m) => m.value === Number(value)) || null;
}
export function reasonLabel(key) {
  return MOOD_REASONS.find((r) => r.key === key)?.label || "";
}
// 1 Rough and 2 Low are the "rough days".
export function isRoughMood(value) {
  const n = Number(value);
  return n === 1 || n === 2;
}

function withTimeout(promise, ms = SAVE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms / 1000}s`)), ms)),
  ]);
}

function announce(day, row) {
  try { window.dispatchEvent(new CustomEvent(MOOD_CHANGED, { detail: { day, row } })); } catch { /* no window */ }
}

const newestFirst = (a, b) =>
  String(b?.updated_date || b?.created_date || "").localeCompare(String(a?.updated_date || a?.created_date || ""));

// The row for `day`, or null. Always asks the database (another phone may
// have answered since).
export async function getDayMood(day) {
  if (!day) return null;
  const email = await myEmail();
  const rows = await base44.entities.DayMood.filter({ created_by: email, day }, "-updated_date", 5);
  return (rows || []).slice().sort(newestFirst)[0] || null;
}

// Every day they've answered, one row per day, newest day first.
export async function listDayMoods(limit = 1000) {
  const email = await myEmail();
  const rows = await base44.entities.DayMood.filter({ created_by: email }, "-updated_date", limit);
  const byDay = new Map();
  for (const row of (rows || []).slice().sort(newestFirst)) {
    if (!row?.day || byDay.has(row.day) || !moodInfo(row.mood)) continue;
    byDay.set(row.day, row);
  }
  return [...byDay.values()].sort((a, b) => String(b.day).localeCompare(String(a.day)));
}

function cleanFields(fields) {
  const mood = Number(fields?.mood);
  if (!moodInfo(mood)) throw new Error("Pick a face first");
  const out = { mood };
  if (fields.reasons !== undefined) {
    const list = Array.isArray(fields.reasons) ? fields.reasons : [];
    out.reasons = REASON_KEYS.filter((k) => list.includes(k));
  }
  if (fields.note !== undefined) {
    out.note = String(fields.note || "").trim().slice(0, NOTE_MAX);
  }
  return out;
}

async function writeDayMood(day, fields) {
  const clean = cleanFields(fields);
  const existing = await getDayMood(day);
  let row;
  if (existing) {
    const updated = await base44.entities.DayMood.update(existing.id, clean);
    row = { ...existing, ...clean, ...(updated && typeof updated === "object" ? updated : {}) };
  } else {
    row = await base44.entities.DayMood.create({ day, reasons: [], note: "", ...clean });
  }
  announce(day, row);
  return row;
}

// Saves for one day go one after another, each sending the whole answer as it
// stands (face, chips, note), so quick taps land in order and the last one
// wins. Each save looks the row up first, so a save that timed out but did
// land is updated next time instead of written twice.
const queues = new Map();
export function saveDayMood(day, fields) {
  if (!day) return Promise.reject(new Error("No day"));
  const before = queues.get(day) || Promise.resolve();
  const run = before.catch(() => {}).then(() => withTimeout(writeDayMood(day, fields)));
  queues.set(day, run);
  run.finally(() => { if (queues.get(day) === run) queues.delete(day); }).catch(() => {});
  return run;
}
