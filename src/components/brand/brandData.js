import {
  Sparkles, Palette, Mic, Bell, Timer, TrendingUp, Lightbulb, CalendarDays,
  MessageCircleHeart, Sun, Moon, Gift, PartyPopper, Heart, Clover, Flag,
  Snowflake, Ghost, Cat, Leaf, Flower2, Rocket, Share2, Cake, Smartphone, MapPin,
} from "lucide-react";

// Marketing palette — pulled straight from the Play Store screenshots.
export const MARKETING_PALETTE = [
  { label: "Cream", hex: "#FFF6EF", note: "Page base. Never pure white." },
  { label: "Peach", hex: "#FBC4A8", note: "Top-left blob, warm and soft." },
  { label: "Blush", hex: "#F9A8B8", note: "Pink blob. The spicy bit." },
  { label: "Coral", hex: "#FAB4A6", note: "Where peach meets pink." },
  { label: "Charcoal", hex: "#2F2A2A", note: "Headlines. Warm, not black." },
  { label: "Sage", hex: "#2E8B57", note: "In-app primary. Calm action." },
  { label: "Lavender", hex: "#8B5CF6", note: "Smart / AI accents." },
  { label: "Mint", hex: "#DCF5E4", note: "Success, done, celebrate." },
];

export const CORE_THEMES = [
  { name: "Minimalist", icon: Sun, blurb: "The default. Calm sage on warm stone. Quiet, breathable, low-stimulation — for days when everything is too loud.", bg: "linear-gradient(135deg, #f6f7f4, #eef2ee)",
    swatches: [{ label: "Primary", hex: "#2E8B57" }, { label: "Accent", hex: "#DCEBDE" }, { label: "Background", hex: "#F6F7F4" }, { label: "Foreground", hex: "#171717" }] },
  { name: "Dark", icon: Moon, blurb: "Deep charcoal greens. Same calm energy, kinder on the eyes. For the 2 a.m. planners.", bg: "linear-gradient(135deg, #0a0a0b, #141517)",
    swatches: [{ label: "Primary", hex: "#34D399" }, { label: "Card", hex: "#241F1A" }, { label: "Background", hex: "#14110D" }, { label: "Foreground", hex: "#FAFAFA" }] },
  { name: "Colorful", icon: Palette, blurb: "Playful purple with orange and teal. Friendly and motivating without shouting.", bg: "linear-gradient(135deg, #f5f3ff, #fff7ed, #f0fdfa)",
    swatches: [{ label: "Primary", hex: "#8B5CF6" }, { label: "Accent", hex: "#5EEAD4" }, { label: "Secondary", hex: "#FFF8E9" }, { label: "Foreground", hex: "#171717" }] },
  { name: "Spicy Brains", icon: Sparkles, blurb: "Maximum dopamine. Magenta-to-cyan gradients, yellow borders, bold uppercase type. Each hue comes with a color-psychology note.", bg: "linear-gradient(135deg, #ff6b9d 0%, #c06bff 50%, #6bc5ff 100%)",
    swatches: [{ label: "Primary", hex: "#FF0080" }, { label: "Secondary", hex: "#B14BFF" }, { label: "Accent", hex: "#00FFFF" }, { label: "Border", hex: "#FFFF00" }] },
];

export const SEASONAL_MODES = [
  { name: "Kawaii", icon: Cat, color: "#FFB6D9", note: "Soft pink. Permanent cute mode." },
  { name: "Halloween", icon: Ghost, color: "#2A1A3A", note: "Oct 10 – Nov 1." },
  { name: "Fall", icon: Leaf, color: "#B5651D", note: "Sep – early Oct, most of Nov." },
  { name: "Harvest", icon: Leaf, color: "#C97B2A", note: "Nov 22 – 26." },
  { name: "Winter", icon: Snowflake, color: "#A8D8F0", note: "Dec – early Mar." },
  { name: "Christmas", icon: Gift, color: "#0B6623", note: "Dec 20 – 26." },
  { name: "New Years", icon: PartyPopper, color: "#1A1A2E", note: "Dec 27 – Jan 5." },
  { name: "Valentines", icon: Heart, color: "#E85D75", note: "Feb 10 – 16." },
  { name: "St. Patrick's", icon: Clover, color: "#2E7D32", note: "Mar 10 – 20." },
  { name: "Spring", icon: Flower2, color: "#F48FB1", note: "Mar 21 – May." },
  { name: "Fourth of July", icon: Flag, color: "#B22234", note: "Jul 1 – 7." },
  { name: "Summer", icon: Sun, color: "#F2C94C", note: "Jun – Aug." },
];

export const FEATURES = [
  { icon: Mic, title: "Smart task capture", desc: "Type it, say it, or snap a photo. The AI figures out the date, the priority, and whether it's a task, an event, a bill, or a birthday." },
  { icon: Share2, title: "Create tasks from any text", desc: "Highlight a text from Mom, share it to ADHDone, done. Works from any app on the phone." },
  { icon: Bell, title: "Smart notifications", desc: "Reminders that know a 3pm ping doesn't get anything done. Deadline-aware, quiet-hours aware, and they never pile up on each other." },
  { icon: Rocket, title: "Launch into tasks", desc: "Launchpad gives you a 5-minute countdown to liftoff. Sprint says 'just start right now, no pressure.'" },
  { icon: Timer, title: "Pomodoro timer", desc: "Focus sessions with a break baked in, completion sounds, and optional background music." },
  { icon: Lightbulb, title: "Parking Lot", desc: "Where random ideas go. Brain dump now, turn into tasks later — or never. Both are fine." },
  { icon: CalendarDays, title: "Google Calendar sync", desc: "Optional read-only import. Events, tasks, and birthdays get routed to the right place automatically." },
  { icon: Cake, title: "Birthdays & scheduled texts", desc: "Never forget a birthday again. AI drafts the text, you tap send. Schedule any text for later, too." },
  { icon: TrendingUp, title: "Insights", desc: "Your data, your patterns, made visible. When you get things done, what gets pushed, what actually sticks — never a guilt trip." },
  { icon: MapPin, title: "Errand-aware nudges", desc: "Add a location and reminders account for drive time. Two errands nearby? It'll suggest one trip." },
  { icon: MessageCircleHeart, title: "Talk It Out", desc: "An AI chat that knows the app and knows executive function. Stuck? Overwhelmed? Start here." },
  { icon: Smartphone, title: "Home widget & quick capture", desc: "Add a task from the home screen without opening the app. Because the idea won't wait." },
  { icon: Palette, title: "Themes built for focus", desc: "Four core themes plus a dozen seasonal ones that rotate through the year. Low-stimulation by default, dopamine on tap." },
];

export const VOICE_PRINCIPLES = [
  { title: "Built by one of us", desc: "ADHDone was built by someone with ADHD, for people with ADHD. The voice comes from lived experience, not a textbook." },
  { title: "Not another checklist app", desc: "We don't sell productivity. We sell actually getting the thing done — and we're honest that reminders alone don't do that." },
  { title: "Like texting a friend", desc: "Short, warm, a little cheeky. We're the friend who says 'hey, the Roomba isn't going to run itself' — not a clinician with a clipboard." },
  { title: "A little spicy", desc: "Real, funny when it fits, a touch of attitude. Never sterile, never corporate." },
  { title: "Tiny first steps", desc: "Every nudge points at one concrete, two-minute action. Not the whole mountain." },
  { title: "Showing up is the win", desc: "We celebrate starting. Tomorrow is always a fresh start, and no day is ever 'a failure'." },
  { title: "No shaming, ever", desc: "We never count snoozes at you or point out how old a task is. Support, not surveillance." },
  { title: "No othering", desc: "We never say 'your ADHD brain' or diagnose. Just helpful stuff anyone could use." },
];

export const SAY_THIS = [
  { dont: "Task overdue: Run the Roomba", say: "Hey — the Roomba's still waiting. Two minutes, press the button, walk away." },
  { dont: "You have 7 incomplete tasks.", say: "Big day on the list. Pick one. Just one. We'll deal with the rest after." },
  { dont: "Reminder: Pay rent (High Priority)", say: "Rent's due Friday. Future-you would love it if you knocked it out now." },
  { dont: "You missed your goal today.", say: "Today happened. Tomorrow's a fresh start — you showed up, and that counts." },
];

export const SIGNATURE_PHRASES = [
  "Not another checklist app",
  "Built by someone with ADHD, for people with ADHD",
  "A reminder at 3pm doesn't guarantee anything gets done",
  "Just throw your tasks in",
  'Your "get it done" coach',
  "Parking Lot is where random ideas go",
  "Capture every idea before it flies away",
  "A little spicy",
  "Always in your corner",
  "Showing up IS the win",
  "You've got this",
];