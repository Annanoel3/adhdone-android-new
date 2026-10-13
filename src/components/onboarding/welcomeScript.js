// The first-run conversation, as data. Each beat is one line the app types; a
// beat with `input` waits for the user before moving on; a beat with `skip`
// is left out when it returns true. Keeping the script separate from the flow
// component means the copy can be reworded without touching logic.
//
// Voice: the first line is the ONE place the builder introduces herself — after
// that it's the app talking to the user, so everything below stays in the app's
// voice ("this app", "we") and never says "I'm Anna" again.
//
// Shape: the whole first sitting is a name, one task, one time, one permission
// and one alert-style question — about a minute. It used to open with a bio
// and a Places explainer before the first task, and most new people left
// inside four minutes with nothing set up that could reach them. The about-you
// question now comes after their first task is checked off.
// Did they already say when, inside the task itself? "call the dentist at 3",
// "dentist tomorrow", "pay rent friday", "in 20 minutes" — then "when should
// it remind you?" is a question they just answered, so it isn't asked; the
// parser reads the time out of their words the same as it does on Home. Only
// plain time words count — a bare number ("pick up 3 things") is not a time.
export function saysWhen(text) {
  const t = String(text || '').toLowerCase();
  return /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/.test(t)
    || /\bat\s+\d{1,2}(:\d{2})?\b/.test(t)
    || /\b(today|tonight|tomorrow|tmrw|this (morning|afternoon|evening|weekend)|next week|noon|midnight)\b/.test(t)
    || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b/.test(t)
    || /\bin\s+(a|an|\d+)\s*(min|mins|minute|minutes|hour|hours|hr|hrs|day|days|week|weeks)\b/.test(t)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/.test(t)
    || /\b\d{1,2}\/\d{1,2}\b/.test(t);
}

const SCRIPT = [
  {
    text: () => "Hey — welcome to ADHDone. Built by Anna, a girl who just wants to stop missing doctors appointments and got tired of apps that just don't work.",
  },
  {
    text: () => "First things first: what should we call you? This becomes your username — you can change it in Settings anytime.",
    input: 'name',
  },
  {
    // The first win comes right after the name. One real thing on the list
    // inside the first minute, before a bio, a tour or a permission — so there
    // is a reminder to arrive, and a reason to come back. (The about-you
    // question waits until their first task is checked off; see catchUpScript.)
    text: (name, handle) =>
      handle
        ? `Nice to meet you, ${name}! Your handle is @${handle} — that's how friends will find you once sharing goes live. Now: what's one thing you keep forgetting? Type it in and it's on your list.`
        : `Nice to meet you, ${name}! What's one thing you keep forgetting? Type it in and it's on your list.`,
    input: 'task',
  },
  {
    // Three taps, no typing. Skipped when they skipped the task, and when the
    // task already says when (Anna, Oct 13 2026: "it already has a time" as a
    // button made no sense — the app can tell, so it doesn't ask).
    text: () => "When should it remind you?",
    input: 'when',
    skip: (name, handle, about, task) => !task || saysWhen(task),
  },
  {
    // The notifications question, asked at the one moment it makes sense —
    // right after they set a time — with the reason on it. Only in the phone
    // app; the browser has nothing to ask (WelcomeChat skips it there).
    text: (name, handle, about, task, when) =>
      task
        ? `${when ? `Set for ${when}. ` : ''}So it can reach you, Android's about to ask if ADHDone can send notifications.`
        : "So reminders can reach you, Android's about to ask if ADHDone can send notifications.",
    input: 'notify',
  },
  {
    text: (name, handle, about, task, when, notify) =>
      notify === 'declined'
        ? "Without notifications nothing from ADHDone can reach you. You can turn them on any time from the row at the top of Home."
        : task
          ? `You're set. ${when ? `First reminder: ${when}.` : "It'll remind you when it's time."}`
          : "You're set — add something from Home whenever you're ready.",
    final: true,
  },
];

export default SCRIPT;
