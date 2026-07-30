// Lightweight Web Audio sound synthesis for the Launchpad + Sprint features.
// No external files needed — tones are generated on the fly so they're always
// available even offline.

let ctx = null;
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, type = 'sine', gain = 0.2, startAt = 0, dur = 0.6, sweepTo }) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + startAt;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Soft "heads up" bell at the 1-minute mark of the Launchpad.
export function playWarning() {
  tone({ freq: 880, type: 'sine', gain: 0.18, dur: 0.5 });
  setTimeout(() => tone({ freq: 660, type: 'sine', gain: 0.14, dur: 0.5 }), 220);
}

// Rocket-liftoff sound: a rising sweep followed by a low boom.
export function playLiftoff() {
  tone({ freq: 180, type: 'sawtooth', gain: 0.22, dur: 1.3, sweepTo: 900 });
  setTimeout(() => tone({ freq: 110, type: 'sine', gain: 0.3, dur: 0.7 }), 1150);
}

// Warm, pleasant chord for the sprint-end "it's okay to stop" moment.
export function playSprintEnd() {
  [523.25, 659.25, 783.99].forEach((f, i) => {
    setTimeout(() => tone({ freq: f, type: 'sine', gain: 0.16, dur: 1.1 }), i * 90);
  });
}

export function haptic(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}