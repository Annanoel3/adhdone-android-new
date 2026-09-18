// The first-run conversation, as data. Each beat is one line Anna types; a beat
// with `input` waits for the user before moving on. Keeping the script separate
// from the flow component means the copy can be reworded without touching logic.
const SCRIPT = [
  {
    text: () => "Hey — welcome to ADHDone. I'm Anna, I built this thing.",
  },
  {
    text: () => 'First things first: what can I call you?',
    input: 'name',
  },
  {
    text: (name) => `Nice to meet you, ${name}!`,
  },
  {
    text: () => "Before you get started, I've got one quick question.",
  },
  {
    text: () =>
      "Tell me a little about yourself — anything that helps me judge what actually matters to you. Stuff like \"I play violin at weddings\" or \"I'm a nurse on night shifts.\"",
    input: 'about',
  },
  {
    text: () =>
      "Got it. I'll keep that in mind when I decide what's urgent and how hard to nag you about it.",
  },
  {
    text: () =>
      "Last thing: when you get a chance, open Places in the menu and set your schedule. That's how I know when to nudge you — and when to leave you alone at work.",
    final: true,
  },
];

export default SCRIPT;