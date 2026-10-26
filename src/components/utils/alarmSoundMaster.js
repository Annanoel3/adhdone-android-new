// Brings an uploaded alarm sound up to alarm loudness before it is saved.
//
// The nine preset tones were re-mastered to alarm level on Oct 1 2026 after
// alarms came out quiet even at full volume; uploads never were, so a song
// someone picked rang about half as loud as a preset (Anna's own upload sat
// 5 dB under them, Oct 26 2026: "the alarm went back to being weirdly
// quiet"). This does for an upload what was done for the presets: a
// compressor to even it out, gain to the presets' level (about -10.5 dBFS
// RMS), a limiter so nothing clips, mono 16-bit WAV at 32 kHz (an alarm,
// not a hi-fi track), and at most 60 seconds (the alarm loops the file, so
// more buys nothing and a long song would be a huge file). If the browser
// can't decode the file, the original is used as it was.
const TARGET_RMS_DB = -10.5;
const CEILING_DB = -0.5;
const SAMPLE_RATE = 32000;
const MAX_SECONDS = 60;
const FADE_SECONDS = 0.5;

const rmsOf = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
};

function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
  }
  return buf;
}

// Returns { file, mastered: boolean }.
export async function masterAlarmSound(file) {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  const Offline = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
  if (!Ctx || !Offline || !file) return { file, mastered: false };
  let ac = null;
  try {
    const bytes = await file.arrayBuffer();
    ac = new Ctx();
    const decoded = await ac.decodeAudioData(bytes.slice(0));
    const seconds = Math.min(decoded.duration, MAX_SECONDS);
    const length = Math.ceil(seconds * SAMPLE_RATE);
    const off = new Offline(1, length, SAMPLE_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 6; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    src.connect(comp); comp.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    const ch = rendered.getChannelData(0);
    const rms = rmsOf(ch);
    if (!(rms > 0)) return { file, mastered: false };
    const gain = Math.pow(10, TARGET_RMS_DB / 20) / rms;
    const ceil = Math.pow(10, CEILING_DB / 20);
    const look = Math.round(SAMPLE_RATE * 0.005);
    const rel = Math.exp(-1 / (SAMPLE_RATE * 0.08));
    const out = new Float32Array(ch.length);
    let g = 1;
    for (let i = 0; i < ch.length; i++) {
      let pk = 0;
      const end = Math.min(ch.length, i + look);
      for (let j = i; j < end; j++) { const v = Math.abs(ch[j] * gain); if (v > pk) pk = v; }
      const need = pk > ceil ? ceil / pk : 1;
      g = need < g ? need : g + (1 - g) * (1 - rel);
      out[i] = ch[i] * gain * g;
    }
    // A clip cut at 60 s fades out instead of stopping dead.
    if (decoded.duration > MAX_SECONDS) {
      const fade = Math.round(SAMPLE_RATE * FADE_SECONDS);
      for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
    }
    const wav = encodeWav(out, SAMPLE_RATE);
    const base = String(file.name || 'alarm').replace(/\.[a-z0-9]+$/i, '');
    return { file: new File([wav], `${base}-loud.wav`, { type: 'audio/wav' }), mastered: true };
  } catch (e) {
    console.warn('alarm sound: could not re-master the upload, using it as is:', e?.message || e);
    return { file, mastered: false };
  } finally {
    try { ac?.close?.(); } catch (e) { /* ignore */ }
  }
}
