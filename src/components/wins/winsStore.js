import { base44 } from "@/api/base44Client";

// Wins: the answers to "What's one win from today?" (Anna, Oct 31 2026). One
// small store every wins surface shares — the evening card on Home, the box
// the evening notification opens, the wins list on Insights and the slump
// popup — so they all count and save the same way.

export const WINS_CHANGED = "wins-changed";
const SOURCES = ["evening_card", "evening_push", "wins_list", "other"];
const SAVE_TIMEOUT_MS = 20000;

// Per-phone flags. Browser storage can be missing or throw (private window,
// cleared data), so every read and write is guarded and nothing depends on it
// for correctness: the database is the real record.
const KEYS = {
  savedDay: "wins_saved_day", // the last day this phone saved a win (YYYY-MM-DD)
  cardDismissed: "wins_card_dismissed", // the day "Not today" hid the evening card
  draft: "wins_draft", // what they were typing, kept until it saves
  slumpShownAt: "wins_slump_shown_at", // when the slump popup last showed (ISO)
};

function readFlag(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function writeFlag(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* the flag just isn't remembered on this phone */ }
}

// The phone's own calendar day, YYYY-MM-DD (not UTC).
export function localDateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function announce() {
  try { window.dispatchEvent(new CustomEvent(WINS_CHANGED)); } catch { /* no window */ }
}

// Whose wins: every read is filtered to the signed-in person on top of the
// entity's own created_by rule, so an account with wider read access still
// only ever sees its own.
let emailPromise = null;
export async function myEmail() {
  if (!emailPromise) {
    emailPromise = base44.auth.me().then((me) => {
      if (!me?.email) throw new Error("not signed in");
      return me.email;
    });
    emailPromise.catch(() => { emailPromise = null; });
  }
  return emailPromise;
}

function withTimeout(promise, ms = SAVE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms / 1000}s`)), ms)),
  ]);
}

const byNewest = (a, b) =>
  String(b.win_date || "").localeCompare(String(a.win_date || "")) ||
  String(b.created_date || "").localeCompare(String(a.created_date || ""));

// Newest first, up to `limit`.
export async function listWins(limit = 500) {
  const email = await myEmail();
  const rows = await base44.entities.Win.filter({ created_by: email }, "-created_date", limit);
  return (rows || []).slice().sort(byNewest);
}

// One save per text at a time: a double tap, or Save pressed again after the
// box was closed and reopened mid-save, joins the save already under way
// instead of writing the win twice.
const inFlight = new Map();

export function addWin(text, source = "other", winDate) {
  const clean = String(text || "").trim();
  if (!clean) return Promise.reject(new Error("Nothing to save"));
  const day = winDate || localDateKey();
  const key = `${day}|${clean}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const saving = (async () => {
    const win = await withTimeout(base44.entities.Win.create({
      text: clean,
      win_date: day,
      source: SOURCES.includes(source) ? source : "other",
    }));
    writeFlag(KEYS.savedDay, day);
    announce();
    return win;
  })();
  inFlight.set(key, saving);
  saving.finally(() => inFlight.delete(key)).catch(() => {});
  return saving;
}

export async function deleteWin(id, winDate) {
  await base44.entities.Win.delete(id);
  // That day may have no win left: let the evening card ask again.
  if (winDate && readFlag(KEYS.savedDay) === winDate) writeFlag(KEYS.savedDay, "");
  announce();
}

// Whether `day` (default: today) already has a win, from any device.
export async function hasWinToday(day = localDateKey()) {
  if (readFlag(KEYS.savedDay) === day) return true;
  const email = await myEmail();
  const rows = await base44.entities.Win.filter({ created_by: email, win_date: day }, "-created_date", 1);
  if (rows?.length) {
    writeFlag(KEYS.savedDay, day);
    return true;
  }
  return false;
}

// Evening card "Not today": hidden for that day only.
export function isEveningCardDismissed(day = localDateKey()) {
  return readFlag(KEYS.cardDismissed) === day;
}
export function dismissEveningCard(day = localDateKey()) {
  writeFlag(KEYS.cardDismissed, day);
  announce();
}

// What they were typing, kept on this phone until it's saved, so closing the
// box (on purpose or by a stray back press) never loses it. A draft left
// unsaved is kept through the next day, then dropped, so last week's
// half-written win doesn't sit in tonight's box.
export function readWinDraft() {
  try {
    const saved = JSON.parse(readFlag(KEYS.draft) || "null");
    if (!saved?.t) return "";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (saved.d && saved.d < localDateKey(yesterday)) {
      writeFlag(KEYS.draft, "");
      return "";
    }
    return String(saved.t);
  } catch {
    return "";
  }
}
export function saveWinDraft(text) {
  const value = String(text || "");
  writeFlag(KEYS.draft, value.trim() ? JSON.stringify({ t: value, d: localDateKey() }) : "");
}
export function clearWinDraft() {
  writeFlag(KEYS.draft, "");
}

// The slump popup's last showing, mirrored here from the profile.
export function readSlumpShownAt() {
  return readFlag(KEYS.slumpShownAt);
}
export function writeSlumpShownAt(iso) {
  writeFlag(KEYS.slumpShownAt, iso);
}

// "HH:MM" → minutes after midnight, or the fallback when it isn't a time.
function toMinutes(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

// The evening card's window: from 5 PM until their quiet hours start
// (default 10 PM). When quiet hours start at or before 5 PM (people who sleep
// days), it's the 4 hours before quiet hours instead. A window that runs past
// midnight belongs to the day it started on, so a win written at 12:30 AM in
// a 9 PM-1 AM window counts for the evening before.
// Returns { open, dayKey }.
export function eveningWindow(user, now = new Date()) {
  const FIVE_PM = 17 * 60;
  const end = toMinutes(user?.quiet_hours_start, 22 * 60);
  const start = end > FIVE_PM ? FIVE_PM : (end - 240 + 1440) % 1440;
  const m = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return { open: m >= start && m < end, dayKey: localDateKey(now) };
  }
  // Runs past midnight.
  if (m >= start) return { open: true, dayKey: localDateKey(now) };
  if (m < end) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { open: true, dayKey: localDateKey(yesterday) };
  }
  return { open: false, dayKey: localDateKey(now) };
}

// Which of their days a moment belongs to, named the way eveningWindow names
// it, so a task finished at 12:30 AM lands on the same day as the mood they
// gave that evening (Insights, "Mood and what got done"). Their day turns over
// in the middle of their quiet hours, the same turnover as todayTasks'
// theirDayKey (3 AM for 10 PM-8 AM, noon for someone who sleeps 8 AM-4 PM),
// never at a fixed clock hour. It's named for the day its evening window
// starts on: for the 8 AM-4 PM sleeper, the 4-8 AM window and the shift
// before it carry that morning's date, as the evening card stamps them.
// Checked against eveningWindow for every quiet-hours pair on the half hour:
// every moment the window is open gets the window's dayKey.
export function dayOfMoment(user, at) {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return "";
  const FIVE_PM = 17 * 60;
  const qs = toMinutes(user?.quiet_hours_start, 22 * 60);
  const qe = toMinutes(user?.quiet_hours_end, 8 * 60);
  const eveningStart = qs > FIVE_PM ? FIVE_PM : (qs - 240 + 1440) % 1440;
  // Same start and end (no quiet hours): midnight, unless their evening runs
  // past midnight, then when it ends.
  const turn = qs !== qe
    ? (qs + Math.round(((qe - qs + 1440) % 1440) / 2)) % 1440
    : (eveningStart > qs ? qs : 0);
  const m = t.getHours() * 60 + t.getMinutes();
  const shift = (m < turn ? -1 : 0) + (eveningStart < turn ? 1 : 0);
  return localDateKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() + shift));
}

// A win's day in plain words: Today, Yesterday, Tuesday, Oct 27, Oct 27, 2025.
export function winDateLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ""));
  if (!m) return "";
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString(
    "en-US",
    date.getFullYear() === today.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
}
