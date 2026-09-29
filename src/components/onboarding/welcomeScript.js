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
    // Three taps, no typing. Skipped when they skipped the task.
    text: () => "When should it remind you?",
    input: 'when',
    skip: (name, handle, about, task) => !task,
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
