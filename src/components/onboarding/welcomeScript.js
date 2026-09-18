// The first-run conversation, as data. Each beat is one line the app types; a
// beat with `input` waits for the user before moving on. Keeping the script
// separate from the flow component means the copy can be reworded without
// touching logic.
//
// Voice: the first line is the ONE place the builder introduces herself — after
// that it's the app talking to the user, so everything below stays in the app's
// voice ("this app", "we") and never says "I'm Anna" again.
const SCRIPT = [
  {
    text: () => "Hey — welcome to ADHDone. Built by Anna, a girl who just wants to stop missing doctors appointments and got tired of apps that just don't work.",
  },
  {
    text: () => "First things first: what should we call you? This becomes your username — you can change it in Settings anytime.",
    input: 'name',
  },
  {
    text: (name, handle) =>
      handle
        ? `Nice to meet you, ${name}! Your handle is @${handle} — that's how friends will find you once sharing goes live.`
        : `Nice to meet you, ${name}!`,
  },
  {
    text: () => "One quick question before you get started.",
  },
  {
    text: () =>
      "Tell us a little about yourself — anything that helps ADHDone judge what actually matters to you. Stuff like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: () =>
      "Got it. That'll shape what counts as urgent and how hard this app nudges you about it.",
  },
  {
    text: () =>
      "Last thing: when you get a chance, open Places in the menu and set your schedule. That's how ADHDone knows when to nudge you — and when to leave you alone at work.",
    final: true,
  },
];

export default SCRIPT;