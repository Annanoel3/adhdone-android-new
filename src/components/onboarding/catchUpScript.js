// The catch-up conversation for accounts that onboarded BEFORE the name +
// about-me questions existed. Same shape as welcomeScript (beats with an
// optional `input`), but deliberately shorter: it skips the introduction and
// the Places explainer those users already saw, and asks only the two things
// their profile is missing.
// The line after the about-you question: an answer is thanked, a skip isn't.
const afterAbout = (back) => (name, handle, about) =>
  String(about || '').trim()
    ? `Got it. That shapes what counts as urgent and how hard the app nudges you. Back to your ${back}.`
    : `That's ok — you can always revisit this in Settings. Back to your ${back}.`;

const CATCH_UP_SCRIPT = [
  {
    text: () =>
      "Welcome back! ADHDone is still a pretty new app, so new things are always rolling out.",
  },
  {
    text: () =>
      "Two quick questions that make this app a lot better at helping *you*.",
  },
  {
    text: () =>
      "First: what should we call you? You can change it in Settings anytime.",
    input: 'name',
  },
  {
    text: (name) => `Thanks, ${name}!`,
  },
  {
    text: () =>
      "Second: tell us a little about yourself, so ADHDone knows what matters to you. Like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: afterAbout('tasks'),
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
      `One quick question that makes this app a lot better at helping *you*, ${name}.`,
  },
  {
    text: () =>
      "Tell us a little about yourself, so ADHDone knows what matters to you. Like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: afterAbout('tasks'),
    final: true,
  },
];

// For a NEW account, after its first task is checked off: the first sitting
// asks for nothing but a task and a time, so the name and about-you come
// here, once the app has done something for them.
export const FIRST_DONE_SCRIPT = [
  {
    text: () => "First one done — nice. Two quick questions now that you've seen how this works.",
  },
  {
    text: () => "What should we call you? You can change it in Settings anytime.",
    input: 'name',
  },
  {
    text: (name) => `Thanks, ${name}!`,
  },
  {
    text: () =>
      "And tell us a little about yourself, so ADHDone knows what matters to you. Like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: afterAbout('list'),
    final: true,
  },
];

// Same, for an account that already gave its name in the welcome chat (the
// usual case): just the about-you question.
export const FIRST_DONE_ABOUT_ONLY_SCRIPT = [
  {
    text: (name) => `First one done — nice work, ${name}. One quick question now that you've seen how this works.`,
  },
  {
    text: () =>
      "Tell us a little about yourself, so ADHDone knows what matters to you. Like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: afterAbout('list'),
    final: true,
  },
];

// For someone who closed the welcome chat before giving a name (so the app has
// nothing to call them): asked once more, on a later open, for the name alone.
// The about-you question still comes after their first checked-off task.
export const NAME_ONLY_SCRIPT = [
  {
    text: () =>
      "Quick one: we never caught your name. What should we call you?",
    input: 'name',
  },
  {
    text: (name, handle) =>
      handle
        ? `Thanks, ${name}! Your handle is @${handle} — that's how friends will find you once sharing goes live. That's all — back to your list.`
        : `Thanks, ${name}! That's all — back to your list.`,
    final: true,
  },
];

export default CATCH_UP_SCRIPT;