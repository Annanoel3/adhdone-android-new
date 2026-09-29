// The first-run conversation, as data. Each beat is one line the app types; a
// beat with `input` waits for the user before moving on; a beat with `skip`
// is left out when it returns true. Keeping the script separate from the flow
// component means the copy can be reworded without touching logic.
//
// Voice: the first line is the ONE place the builder introduces herself — after
// that it's the app talking to the user, so everything below stays in the app's
// voice ("this app", "we") and never says "I'm Anna" again.
//
// Shape: the whole first sitting is one task, one time, one permission, one
// alert-style question — under a minute. It used to open with a name, a bio
// and a Places explainer before the first task, and most new people left
// inside four minutes with nothing set up that could reach them. The name
// and about-you questions now come after their first task is checked off.
const SCRIPT = [
  {
    text: () => "Hey — welcome to ADHDone. Built by Anna, a girl who just wants to stop missing doctors appointments and got tired of apps that just don't work.",
  },
  {
    // The first win comes FIRST. One real thing on the list inside the first
    // minute, before a name, a bio, a tour or a permission — so there is a
    // reminder to arrive, and a reason to come back. (Name and about-you are
    // asked after their first task gets checked off; see catchUpScript.)
    text: () =>
      "What's one thing you keep forgetting? Type it in and it's on your list.",
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
