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
    video: ADD_PATHS_BASE + "pinned%20notifications.mp4",
    text: "With Quick Capture on, pull down the notification and type straight into it. Turn it on in Settings.",
  },
];

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
        { label: "Add anything", text: "Talk or type it in. The app works out what's a task and what's just an idea." },
        { label: "More help as you go", text: "Each page introduces itself the first time you open it — look out for those popups." },
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