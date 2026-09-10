// First-visit intro tours, keyed by page name. Each page is a list of steps;
// a step may point at an element via a CSS selector (data-tour attributes).
export const PAGE_TOURS = {
  Home: [
    {
      title: "Welcome to your home page! 👋",
      body: "This is your starting point every day. Here you can add tasks and ideas, see today's tasks and what's coming up at a glance, and get a push to start when you're stuck.",
    },
    {
      selector: '[data-tour="add-task"]',
      title: "Add tasks or ideas",
      body: "Add any task(s) or idea(s) simply by talking or typing. Dump it all in — the app sorts out what's a task and what's just an idea.",
    },
    {
      variant: "otherWays",
      title: "Other ways to add stuff 📥",
    },
    {
      selector: '[data-tour="launch"]',
      title: "Launch 🚀",
      body: "Stuck? Launch gives you a push. A Sprint is a short timed burst on one thing, and the Launchpad walks you through picking something and actually starting it.",
    },
  ],
  Calendar: [
    {
      title: "Your calendar 📅",
      body: "Import your Google Calendar events so ADHDone can be as helpful as possible — it uses them to time reminders around what you already have going on.",
    },
  ],
  FocusTimer: [
    {
      title: "Pomodoro timer ⏱️",
      body: "Work in one short focused block, then take a short break, and repeat. Timeboxing like this works well for ADHD brains: a defined end point lowers the activation cost of starting, and the built-in breaks keep attention from burning out.",
    },
  ],
  ParkingLot: [
    {
      title: "The Parking Lot 💡",
      body: "All of your ideas end up here! When you create a task, the app intelligently determines whether you're adding an idea or a task. Missing a task? Check here!",
    },
  ],
  Birthdays: [
    {
      title: "Birthdays 🎂",
      body: "Never forget to text your loved ones on their birthday again! Get help drafting and scheduling texts so you get the most out of birthdays.",
    },
  ],
};