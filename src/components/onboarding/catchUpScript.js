// The catch-up conversation for accounts that onboarded BEFORE the name +
// about-me questions existed. Same shape as welcomeScript (beats with an
// optional `input`), but deliberately shorter: it skips the introduction and
// the Places explainer those users already saw, and asks only the two things
// their profile is missing.
const CATCH_UP_SCRIPT = [
  {
    text: () =>
      "Welcome back! ADHDone is still a pretty new app, so new things are always rolling out.",
  },
  {
    text: () =>
      "There's a new bit of setup that makes this app a lot better at helping *you* specifically. Two quick questions — that's it.",
  },
  {
    text: () =>
      "First: what should we call you? This becomes your username — you can change it in Settings anytime.",
    input: 'name',
  },
  {
    text: (name, handle) =>
      handle
        ? `Thanks, ${name}! Your handle is @${handle} — that's how friends will find you once sharing goes live.`
        : `Thanks, ${name}!`,
  },
  {
    text: () =>
      "Second: tell us a little about yourself — anything that helps ADHDone judge what actually matters to you. Stuff like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: () =>
      "Got it. That'll shape what counts as urgent and how hard this app nudges you about it. That's everything — back to your tasks.",
    final: true,
  },
];

// For a profile that already has a name (it was answered earlier, or set in
// Settings): the same catch-up minus the name beats, so nobody is asked for
// something the app already knows.
export const CATCH_UP_ABOUT_ONLY_SCRIPT = [
  {
    text: () =>
      "Welcome back! ADHDone is still a pretty new app, so new things are always rolling out.",
  },
  {
    text: (name) =>
      `There's a new bit of setup that makes this app a lot better at helping *you* specifically, ${name}. One quick question — that's it.`,
  },
  {
    text: () =>
      "Tell us a little about yourself — anything that helps ADHDone judge what actually matters to you. Stuff like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: () =>
      "Got it. That'll shape what counts as urgent and how hard this app nudges you about it. That's everything — back to your tasks.",
    final: true,
  },
];

export default CATCH_UP_SCRIPT;