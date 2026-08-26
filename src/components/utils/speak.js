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