// First-visit intros, keyed by page name. Every page gets exactly ONE short
// card. `points` are inline point-outs rendered inside that card — never extra
// steps. Anything already said in the main flow (how to add tasks, the pinned
// notification) is NOT repeated here.
export const PAGE_TOURS = {
  Home: [
    {
      title: "This is home base 🏠",
      body: "Today's stuff and what's coming up, all in one spot.",
      points: [
        { label: "Add anything", text: "Talk or type it in — or share text and screenshots straight from other apps. The app figures out what's a task and what's just an idea." },
        { label: "Stuck? Launch 🚀", text: "A short Sprint on one thing, or the Launchpad to help you pick and actually start." },
      ],
    },
  ],
  Calendar: [
    {
      title: "Your calendar 📅",
      body: "Pull in your Google Calendar and reminders get timed around what you've already got going on.",
    },
  ],
  FocusTimer: [
    {
      title: "Focus Timer ⏱️",
      body: "One short focused block, a break, repeat — a defined end point makes starting way easier.",
    },
  ],
  ParkingLot: [
    {
      title: "The Parking Lot 💡",
      body: "Ideas land here so they don't clutter your tasks. Missing something? Check here first.",
    },
  ],
  Birthdays: [
    {
      title: "Birthdays 🎂",
      body: "Never miss a birthday text again — get a nudge on the day and a draft you can send in one tap.",
    },
  ],
};