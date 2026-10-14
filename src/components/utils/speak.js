// Browser text-to-speech. Uses the device's built-in speech engine —
// no API, no network, no Base44 integration credits.

export function speak(text, { rate = 0.95, pitch = 1 } = {}) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    // Cancel anything mid-sentence so messages never overlap.
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

// Spoken check-ins while a task is being timed (Anna, Oct 13 2026): a warm
// voice that cheers the person on, so someone who drifted — into another
// app, another thought — hears it and comes back. The shape is Anna's: a
// "let's get started" at the start, "that's 5 minutes, look at you go" at
// five, something about the task itself at ten ("your clothes are going to
// smell great"), a small "you've got this" at fifteen, "you're almost there"
// as the time this task usually takes them comes up, then a line every ten
// minutes. Never a countdown, never "still going?", never a clock after the
// 5-minute one (a first draft read as pressure). On by default; off in
// Settings → Reminders. The voice is the phone's own text-to-speech, and it
// can only talk while the app is open — closed, the timer's end still rings
// as an alarm, but nothing speaks along the way.
const KEY = 'timer_voice_checkins';
export const TIMER_VOICE_EVENT = 'timer-voice-changed';

export function voiceCheckInsOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
}

export function setVoiceCheckIns(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* stays on */ }
  try { window.dispatchEvent(new CustomEvent(TIMER_VOICE_EVENT, { detail: { on: !!on } })); } catch (e) { /* nothing listening */ }
}

export function speechAvailable() {
  return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
}

const MIN = 60 * 1000;

// The task's name as the voice says it: no emoji, no trailing period, first
// letter lowered so it sits inside a sentence ("Let's get started on laundry!").
function sayTitle(title) {
  const t = String(title || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '');
  if (!t) return 'your task';
  return t.charAt(0).toLowerCase() + t.slice(1);
}

// Written at the moment the timer starts (the task's own line is ready a few
// seconds later, from the LLM — see writeTimerVoice in LaunchContext). Every
// slot has plain words to fall back on, so the voice never goes quiet because
// a request failed.
const START_LINES = [
  (t) => `Let's get started on ${t}!`,
  (t) => `Okay — ${t}. Let's do this!`,
  (t) => `Here we go: ${t}. Let's get started!`,
  (t) => `Alright, time for ${t}. Let's go!`,
];
const FIVE_MIN_LINE = "That's 5 minutes, look at you go!";
const TEN_MIN_FALLBACK = 'Ten minutes in — keep it up!';
const FIFTEEN_LINES = [
  "You've got this.",
  "Fifteen minutes down. You've got this.",
  "Still going — nice. You've got this.",
];
const USUAL_LINE = "You're almost there! The time this usually takes you is coming up.";
const MORE_LINES = [
  'Still at it — nice work.',
  "Keep going, you're doing great.",
  'Look at you, still going!',
  'Nice. Keep it rolling.',
  "You're doing it. Keep going.",
  'Still here with you. Keep it up.',
];
const pick = (arr, i) => arr[Math.abs(i) % arr.length];

// Every line a session will say, as { key, at (ms since epoch), text }, in
// order. Recomputed from the session each time it changes: pausing a
// stopwatch moves its start, so everything moves with it. `session.voice` is
// the LLM's { tenMin, more[] } once it has arrived.
export function checkInPlan(session) {
  if (!session) return [];
  const stopwatch = !!session.stopwatch;
  let start;
  let end = Infinity;
  if (stopwatch) {
    if (!session.startedAtISO) return [];
    start = new Date(session.startedAtISO).getTime();
  } else {
    const total = session.durationMs > 0 ? session.durationMs : 5 * MIN;
    end = new Date(session.endTimeISO).getTime();
    start = end - total;
  }
  const title = sayTitle(session.title);
  const voice = session.voice || {};
  const seed = Math.floor(start / 1000);
  const out = [];

  // "You're almost there" as the task's usual length (Task.typical_minutes,
  // from past timed sessions) comes up — two minutes before it. Stopwatch
  // only; a countdown has its own end.
  const est = stopwatch && Number(session.estimateMin) > 0 ? Math.round(Number(session.estimateMin)) : 0;
  const usualAt = est >= 4 ? start + (est - 2) * MIN : null;

  out.push({ key: 'start', at: start + 1500, text: pick(START_LINES, seed)(title) });
  const marks = [
    { key: 'five', min: 5, text: FIVE_MIN_LINE },
    { key: 'ten', min: 10, text: (voice.tenMin && String(voice.tenMin).trim()) || TEN_MIN_FALLBACK },
    { key: 'fifteen', min: 15, text: pick(FIFTEEN_LINES, seed) },
  ];
  let lastMin = 0;
  for (const m of marks) {
    const at = start + m.min * MIN;
    // The fixed marks stop once "almost there" is due (and none lands in the
    // two minutes right before it): after that it's the every-ten-minutes line.
    if (usualAt != null && at >= usualAt - 2 * MIN) break;
    out.push({ key: m.key, at, text: m.text });
    lastMin = m.min;
  }
  if (usualAt != null) {
    out.push({ key: 'usual', at: usualAt, text: USUAL_LINE });
    lastMin = est - 2;
  }
  // Then one every ten minutes, for up to two more hours.
  const more = Array.isArray(voice.more) ? voice.more.map((x) => String(x || '').trim()).filter(Boolean) : [];
  for (let i = 0; i < 12; i++) {
    const min = lastMin + 10 * (i + 1);
    out.push({ key: `more${i}`, at: start + min * MIN, text: more[i] || pick(MORE_LINES, seed + i) });
  }
  // A countdown's last minute belongs to "your N minutes are up".
  return out.filter((c) => c.at < end - MIN);
}

// Says one check-in, if the voice is on.
export function sayCheckIn(text) {
  if (!voiceCheckInsOn() || !speechAvailable()) return false;
  return speak(text);
}
