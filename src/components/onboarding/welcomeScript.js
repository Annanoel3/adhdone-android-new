// The first-run conversation, as data. Each beat is one line the app types; a
// beat with `input` waits for the user before moving on. Keeping the script
// separate from the flow component means the copy can be reworded without
// touching logic.
//
// Voice: the first line is the ONE place the builder introduces herself — after
// that it's the app talking to the user, so everything below stays in the app's
// voice ("this app", "we") and never says "I'm Anna" again.
const SCHEDULE_HINTS = [
  'irregular', 'shift', 'shifts', 'rotating', 'varies', 'vary', 'different every',
  'changes every', 'night', 'nights', 'overnight', 'graveyard', 'on call', 'on-call',
  'no set', 'never the same', 'weekends', 'schedule',
];

const mentionsSchedule = (about) => {
  const text = (about || '').toLowerCase();
  return SCHEDULE_HINTS.some((w) => text.includes(w));
};

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
    // Someone who mentions shifts / irregular hours has just told us something
    // the free-text note can't actually act on — the acknowledgment points them
    // straight at the place where it becomes real.
    text: (name, handle, about) =>
      mentionsSchedule(about)
        ? "Got it. Since your hours move around, head to Places whenever a new schedule gets posted — drop in a photo of it or type the week in, and this app will work around your shifts instead of guessing."
        : "Got it. That'll shape what counts as urgent and how hard this app nudges you about it.",
  },
  {
    // The first win: one real thing on the list before they ever see Home,
    // so a reminder exists to arrive. The app also books a test notification a
    // few minutes out, so they learn what a reminder looks like today, not
    // whenever the first due time happens to come around.
    text: () =>
      "Now let's get you a win. What's one thing you need to do today? Type it with a time if you know one — like \"call the pharmacy at 3\" — and this app will remind you.",
    input: 'task',
  },
  {
    text: (name, handle, about, task) =>
      task
        ? "On the list, reminder set. In a couple of minutes you'll get a test notification so you know they're reaching you."
        : "No problem — add one from Home whenever you're ready.",
  },
  {
    text: () =>
      "Last thing: when you get a chance, open Places in the menu and set your schedule. That's how ADHDone knows when to nudge you — and when to leave you alone at work.",
    final: true,
  },
];

export default SCRIPT;