// The four ways to add a task without opening the app, in the order they're
// shown — in the Tasks page's first-visit walkthrough and in the App Guide.
const ADD_PATHS_BASE = "https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/4%20paths/";
export const ADD_PATHS = [
  {
    key: "text",
    title: "Share selected text",
    video: ADD_PATHS_BASE + "Select%20text.mp4",
    text: "Highlight text in any app — a message, an email, a website — tap Share and pick ADHDone. It becomes a task, idea or event.",
  },
  {
    key: "screenshot",
    title: "Share a screenshot",
    video: ADD_PATHS_BASE + "Screenshot.mp4",
    text: "Screenshot an invite, a flyer, a receipt, then share it to ADHDone. It reads the picture and makes the task for you.",
  },
  {
    key: "widget",
    title: "The home-screen widget",
    video: ADD_PATHS_BASE + "widget.mp4",
    text: "Tap + on the widget, type it, done. Today's tasks sit right on your home screen too.",
  },
  {
    key: "pinned",
    title: "The pinned notification",
    video: ADD_PATHS_BASE + "Screen_Recording_20260924_213759_ADHDone.mp4",
    // From 1.3.9 you tap it and a small typing box opens, and expanding it
    // shows the buttons that quiet notifications for 1, 2 or 3 hours. The
    // quiet sentence only shows on a build that can do it (the same check the
    // side menu's "Quiet notifications" uses); older builds keep the old words
    // (pull it down and type into it).
    get text() {
      const canQuiet = typeof window !== "undefined" &&
        typeof window.Capacitor?.Plugins?.AlarmBridge?.quietFor === "function";
      return canQuiet
        ? "With Quick Capture on, it sits in your notification tray. Tap it to add a task, or expand it to quiet notifications for 1, 2 or 3 hours. Turn it on in Settings."
        : "With Quick Capture on, it sits in your notification tray: tap or pull it down and type your task. Turn it on in Settings.";
    },
  },
];

// First-visit intros, keyed by page name. Every page gets exactly ONE short
// card. `points` are inline point-outs rendered inside that card — never extra
// steps. Anything already said in the main flow (how to add tasks, the pinned
// notification) is NOT repeated here.
// Home has no card: the welcome chat is the introduction, and a tour card
// right after it was one popup too many.
export const PAGE_TOURS = {
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