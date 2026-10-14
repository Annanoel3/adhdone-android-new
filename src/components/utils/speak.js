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

// Spoken check-ins while a task is being timed (Anna, Oct 13 2026): a voice at
// a few points so someone who drifted — into another app, another thought —
// hears it and comes back. These are a hello, not a progress check: no
// minutes, no "still going?", no "finish strong" (Anna, Oct 13 2026, on a
// first draft: "sounds like pressure and would make me not want to do the
// task"). On by default; off in Settings → Reminders. The voice is the phone's
// own text-to-speech (speak.js), and it can only talk while the app is open —
// closed, the timer's end still rings as an alarm, but nothing speaks along
// the way.
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

// What gets said, in turn. Warm, short, no clock, no scorekeeping — the same
// thing a friend in the room would say if you went quiet for a while.
export const CHECK_IN_LINES = [
  'Hey, just checking in. Still with me?',
  "Quick hello from your timer. No rush — just making sure you're still here.",
  "If your mind wandered off, that's okay. Come on back whenever you're ready.",
  "Just a little nudge. Nothing's wrong — only checking you haven't floated away.",
  'Hey — you still there? Take your time.',
];
const line = (i) => CHECK_IN_LINES[i % CHECK_IN_LINES.length];

// Every check-in a session will have, as { key, at (ms since epoch), text }.
// Recomputed from the session each time it changes: pausing a stopwatch moves
// its start, so its check-ins move with it.
export function checkInPlan(session) {
  if (!session) return [];
  const out = [];

  if (session.stopwatch) {
    if (!session.startedAtISO) return out;
    const start = new Date(session.startedAtISO).getTime();
    // The task's usual length (Task.typical_minutes, from past timed
    // sessions) is WHEN the first hello comes — "the estimated time comes"
    // — never something the voice says out loud. Then every 10 minutes.
    // With no usual length: every 15 minutes.
    const est = Number(session.estimateMin) > 0 ? Math.round(Number(session.estimateMin)) : 0;
    if (est >= 2) {
      out.push({ key: 'estimate', at: start + est * MIN, text: line(0) });
      for (let i = 1; i <= 6; i++) out.push({ key: `after${i}`, at: start + (est + 10 * i) * MIN, text: line(i) });
    } else {
      for (let i = 1; i <= 8; i++) out.push({ key: `every${i}`, at: start + 15 * i * MIN, text: line(i - 1) });
    }
    return out;
  }

  // A countdown: a hello at halfway, and a soft heads-up two minutes from the
  // end (the end itself is spoken by the popup: "your N minutes are up").
  const total = session.durationMs > 0 ? session.durationMs : 5 * MIN;
  const end = new Date(session.endTimeISO).getTime();
  const start = end - total;
  const totalMin = Math.round(total / MIN);
  if (totalMin >= 4) out.push({ key: 'half', at: start + total / 2, text: line(0) });
  if (totalMin >= 6) out.push({ key: 'twoLeft', at: end - 2 * MIN, text: "Heads-up: about two minutes left. No rush." });
  return out;
}

// Says one check-in, if the voice is on.
export function sayCheckIn(text) {
  if (!voiceCheckInsOn() || !speechAvailable()) return false;
  return speak(text);
}
