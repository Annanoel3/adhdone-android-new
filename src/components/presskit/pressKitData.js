// Everything a marketer needs to sell ADHDone without ever having used it.
// Copy here is quotable as-is — it follows the voice rules in the Brand Book.

export const ONE_LINER =
  "ADHDone is an ADHD-first task app whose reminders think before they fire — built by someone with ADHD.";

export const ELEVATOR = [
  "Every other task app assumes that if it pings you at 3pm, the thing gets done. For an ADHD brain, that's not how it works — the ping arrives, gets swiped away, and the task is still sitting there at midnight.",
  "ADHDone is built on the opposite assumption. You throw a task in however you can (type it, say it, screenshot it, share a text from Mom), and the app works out what it actually is, when it really needs to happen, and how to get you moving on it. One nudge at a time, never a pile-up, never at 4 a.m.",
  "It was built by one person with ADHD who needed it to exist. That's the whole story, and it's the most valuable thing in this kit.",
];

// Who to talk to. Written as real people, not segments.
export const AUDIENCES = [
  { who: "Diagnosed adults, 25–45", pain: "Has tried every app. Every one became another list to feel bad about.", hook: "Not another checklist app." },
  { who: "Late-diagnosed women", pain: "Held it together for years by brute force and is exhausted. Very online, very community-driven.", hook: "Built by someone who gets it, not a productivity company." },
  { who: "Shift workers & nurses", pain: "Schedule changes weekly. Generic reminders fire mid-shift and get lost forever.", hook: "It goes quiet while you're on shift and picks back up after." },
  { who: "Parents running a household", pain: "Carries everyone's dates, birthdays, and errands in their head.", hook: "The birthday text is already written. You just tap send." },
  { who: "The undiagnosed-but-suspicious", pain: "Doesn't identify with ADHD yet, but nothing sticks.", hook: "A reminder at 3pm doesn't guarantee anything gets done." },
];

// The five things that make it different. Lead ads with these, not the feature list.
export const DIFFERENTIATORS = [
  { title: "The reminder does math first", detail: "A commute alert checks live traffic on your route, checks what time you start, subtracts the drive, adds a 10-minute buffer — then tells you to leave. It doesn't just repeat the task name at you." },
  { title: "One thing at a time, on purpose", detail: "Notifications are deduplicated against each other, so ten tasks never become ten pings. The app surfaces one, worded as a two-minute action." },
  { title: "Capture from anywhere, app closed", detail: "Share sheet, screenshot, voice, home-screen widget, pinned notification. The task is parsed and saved server-side without the app ever opening." },
  { title: "Quiet hours are sacred", detail: "Nothing fires overnight. Late nudges wait for morning. On by default, in the user's own timezone." },
  { title: "It never shames you", detail: "No overdue-count badges, no snooze tallies, no 'you missed your goal.' Pushing a task later is treated as normal, because it is." },
];

// Grouped so an ad can pick a lane instead of listing thirteen things.
export const FEATURE_GROUPS = [
  {
    group: "Getting it out of your head",
    items: [
      { name: "Smart capture", what: "Type, speak, or photograph it. AI works out the date, the priority, and whether it's a task, an event, a bill, or a birthday." },
      { name: "Share any text", what: "Highlight a message in any app, share to ADHDone, and it becomes a scheduled task. Nothing to type." },
      { name: "Home widget & quick capture", what: "Add a task from the home screen or a pinned notification without opening the app." },
      { name: "Parking Lot", what: "Where random 2 a.m. ideas go. Brain-dump now, turn into tasks later — or never. Both fine." },
    ],
  },
  {
    group: "Actually getting it done",
    items: [
      { name: "Smart reminders", what: "Deadline-aware, traffic-aware, quiet-hours-aware, and deduplicated so they never stack up." },
      { name: "Task timer", what: "Pick how long, watch it count down, and when it rings, keep going in Focus Mode or call it done." },
      { name: "Focus Mode & Pomodoro", what: "Hourly check-ins on one task, focus sessions with breaks built in, completion sounds, optional music." },
      { name: "Break it into steps", what: "One tap turns an overwhelming task into a short, ordered list of real first steps." },
    ],
  },
  {
    group: "The life admin nobody remembers",
    items: [
      { name: "Birthdays", what: "Their own page, their own reminders, never cluttering the task list. AI drafts the text; the user taps send." },
      { name: "Scheduled texts", what: "Write any message now, get reminded to send it at the right moment." },
      { name: "Google Calendar sync", what: "Optional, read-only. Events, tasks, and birthdays are each routed to the right place automatically." },
      { name: "Errand-aware nudges", what: "Add a location and reminders account for drive time. Two errands nearby? It suggests one trip." },
    ],
  },
  {
    group: "Making it feel good",
    items: [
      { name: "Insights", what: "When you get things done, what keeps getting pushed, what actually sticks. Never a guilt trip." },
      { name: "Diary", what: "A private, sealed daily entry with photos and draggable stickers. Never read by AI, never shared." },
      { name: "Talk It Out", what: "An AI chat that knows the app and knows executive function. For when you're stuck before you're started." },
      { name: "Themes & seasonal modes", what: "Four core themes plus a dozen date-driven seasonal skins that rotate through the year." },
      { name: "Hidden easter eggs", what: "Small rewards for genuinely ADHD behaviour — the 10-item Parking Lot, the task pushed one too many times. Never a punishment." },
    ],
  },
];

// Live, loopable creative already built into the app. Screen-record these.
export const AD_SPOTS = [
  { path: "/ad/a", name: "Variant A — Before / After", hypothesis: "Seeing your own pain is the hook.", beat: "Three identical ignored 'refill your prescription' reminders stack up on a dark lock screen, red pressure building. Flash. One warm, specific nudge. 'Still not refilled.' → 'One that actually gets you moving.'", length: "11s loop" },
  { path: "/ad/b", name: "Variant B — The Flood", hypothesis: "Overwhelm collapsing into calm is the hook.", beat: "Ten generic reminders pour in over three seconds, duplicates and all. Everything blurs out at once and leaves a single card: 'One thing: pay the electric bill.'", length: "10.5s loop" },
  { path: "/ad/c", name: "Variant C — It already did the work", hypothesis: "Showing the intelligence sells harder than showing the result.", beat: "A commute alert appears, then three ticks explain it: checked traffic, checked your start time, subtracted the drive. 'It didn't just remind you. It thought first.'", length: "10.5s loop" },
  { path: "/ad/d", name: "Variant D — The Confession", hypothesis: "'Built by one of us' lands harder than any feature.", beat: "Founder line, held in silence: 'I built this because a reminder at 3pm never once made me mail that package.' Then the smarter nudge that would have.", length: "11s loop" },
  { path: "/ad/e", name: "Variant E — Day in the life", hypothesis: "Breadth and rhythm beat depth and emotion.", beat: "Four cards, ~2s each: traffic at 7:20, quiet-while-on-shift at 11:40, one-thing nudge at 2:15, Mom's birthday at 6:00. 'A whole day, handled.'", length: "~11s loop" },
  { path: "/ad/f", name: "Variant F — Three texts, three tasks", hypothesis: "The share-sheet moment is the product demo.", beat: "Texts from Sarah, Mom and Ryan, each highlighted and shared to ADHDone. All three land as scheduled tasks. 'You didn't type a thing. You just hit share.'", length: "22s loop, vertical reel-safe" },
];

// Scroll-stopping first lines. All safe to use verbatim.
export const HOOKS = [
  "A reminder at 3pm doesn't guarantee anything actually gets done.",
  "I've had the same reminder for eleven days.",
  "Your task app isn't broken. It just assumes you're not you.",
  "What if the reminder checked traffic before it yelled at you?",
  "I didn't need another list. I needed a push.",
  "Ten reminders at once is the same as zero.",
  "The birthday text is already written. You just tap send.",
  "Built by someone with ADHD, for people with ADHD.",
  "It went quiet while I was on shift. No app has ever done that.",
  "You didn't type a thing. You just hit share.",
];

export const CAPTIONS = [
  { format: "Reel / TikTok", text: "POV: your reminder app finally understands that 3pm ≠ done. ADHDone nudges you once, with the actual next step. Not another checklist app. 🧠" },
  { format: "Story / short", text: "Highlight the text → share → it's a task with a reminder. That's the whole thing. That's why I use it." },
  { format: "Carousel closer", text: "Built by one person with ADHD who got tired of apps that assume you'll just do the thing when the notification says so. Free to start. You've got this." },
  { format: "Founder post", text: "I built the app I needed. It doesn't care how many tasks you've pushed. It cares that you start one. Showing up IS the win." },
];

export const HASHTAGS = [
  "#ADHD", "#ADHDAdults", "#ADHDwomen", "#LateDiagnosedADHD", "#ExecutiveDysfunction",
  "#ADHDTips", "#Neurodivergent", "#ADHDone", "#TaskManagement", "#ADHDProductivity",
];

// Guardrails. These exist because breaking them makes the app sound like everyone else.
export const RULES = {
  do: [
    "Talk like a warm, funny friend who happens to know the science.",
    "Point at ONE tiny next step, never the whole mountain.",
    "Celebrate starting. Showing up is the win.",
    "Say 'built by someone with ADHD' — it's true and it's the strongest asset.",
    "Show the app's own words. The real notification copy is better than invented copy.",
  ],
  dont: [
    "Never use productivity-shaming language — no 'overdue', no 'you failed', no snooze counts.",
    "Never say 'your ADHD brain' or imply a diagnosis. No othering, no clinical tone.",
    "Never promise a cure, a fix, or medical benefit.",
    "Never claim it does your tasks for you. It gets you to start them.",
    "Never show cold SaaS blue, sharp corners, or stock-photo office people.",
  ],
};

export const FACTS = [
  { k: "Platform", v: "Native Android app plus a full web app. Same codebase." },
  { k: "Price", v: "Free to start, no credit card required." },
  { k: "Account", v: "Email/password or Google sign-in." },
  { k: "AI", v: "Used for parsing tasks, wording reminders, drafting texts, and breaking tasks into steps." },
  { k: "Calendar", v: "Google Calendar sync is optional and read-only. The app never writes to a calendar." },
  { k: "Privacy", v: "Diary entries are sealed and never read by AI. Diary photos are stored privately, not on public URLs." },
  { k: "Maker", v: "Mediocre at Best Dev — a one-person studio." },
  { k: "Live app", v: "https://adhdone-73056b9b.base44.app" },
];

export const FAQ = [
  { q: "Is this a medical or clinical product?", a: "No. It's a task app designed around how ADHD actually works. Never market it as treatment." },
  { q: "Does it work if I don't have ADHD?", a: "Yes — nothing in it requires a diagnosis, and we never ask for one." },
  { q: "What's the single best thing to demo?", a: "The share sheet. Highlight a text, share it, watch it become a scheduled task. It lands in under five seconds of video." },
  { q: "What should I lead with if I only get one line?", a: "'A reminder at 3pm doesn't guarantee anything actually gets done.' Everything else follows from it." },
];