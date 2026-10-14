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
// hears it and comes back. The words never scold: a wandering mind is the
// normal thing here, not a failure. On by default; off in Settings →
// Reminders. The voice is the phone's own text-to-speech (speak.js), and it
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

// The task's name, short enough to say out loud.
function sayTitle(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 7).join(' ') : 'your task';
}

// Every check-in a session will have, as { key, at (ms since epoch), text }.
// Recomputed from the session each time it changes: pausing a stopwatch moves
// its start, so its check-ins move with it.
export function checkInPlan(session) {
  if (!session) return [];
  const title = sayTitle(session.title);
  const out = [];

  if (session.stopwatch) {
    if (!session.startedAtISO) return out;
    const start = new Date(session.startedAtISO).getTime();
    // The task's usual length (Task.typical_minutes, from past timed
    // sessions): the one moment Anna named — "the estimated time comes".
    const est = Number(session.estimateMin) > 0 ? Math.round(Number(session.estimateMin)) : 0;
    if (est >= 2) {
      out.push({ key: 'estimate', at: start + est * MIN,
        text: `That's ${est} minutes — about what ${title} usually takes you. Still going, or is it done?` });
      for (let i = 1; i <= 6; i++) {
        const m = est + 10 * i;
        out.push({ key: `after${i}`, at: start + m * MIN,
          text: `${m} minutes in. Still on ${title}? If you drifted, no big deal — just come back to it.` });
      }
    } else {
      for (let i = 1; i <= 8; i++) {
        const m = 15 * i;
        out.push({ key: `every${i}`, at: start + m * MIN,
          text: `${m} minutes in. Still on ${title}? If your mind wandered, that's okay — come on back.` });
      }
    }
    return out;
  }

  // A countdown: halfway, and two minutes from the end (the end itself is
  // spoken by the popup: "your N minutes are up").
  const total = session.durationMs > 0 ? session.durationMs : 5 * MIN;
  const end = new Date(session.endTimeISO).getTime();
  const start = end - total;
  const totalMin = Math.round(total / MIN);
  if (totalMin >= 4) out.push({ key: 'half', at: start + total / 2, text: `Halfway there. Still on ${title}?` });
  if (totalMin >= 6) out.push({ key: 'twoLeft', at: end - 2 * MIN, text: `Two minutes left on ${title}. If you drifted, come on back and finish strong.` });
  return out;
}

// Says one check-in, if the voice is on.
export function sayCheckIn(text) {
  if (!voiceCheckInsOn() || !speechAvailable()) return false;
  return speak(text);
}
