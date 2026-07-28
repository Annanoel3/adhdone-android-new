import React from "react";
import {
  Sparkles,
  Heart,
  Brain,
  Palette,
  Mic,
  Bell,
  Timer,
  Users,
  TrendingUp,
  Lightbulb,
  CalendarDays,
  MessageCircleHeart,
  Trophy,
  Sun,
  Moon,
  Gift,
  PartyPopper,
  Heart as HeartIcon,
  Clover,
  Flag,
  Flame,
  Snowflake,
  Ghost,
  Cat,
  Leaf,
  Flower2,
} from "lucide-react";

/* ── Brand tokens (mirrors src/index.css + src/Layout.jsx theme overrides) ── */
const CORE_THEMES = [
  {
    name: "Minimalist",
    icon: Sun,
    blurb: "The default. Calm sage greens on warm stone. Quiet, breathable, low-stimulation — for minds that get overwhelmed by clutter.",
    bg: "linear-gradient(135deg, #f6f7f4, #eef2ee)",
    swatches: [
      { label: "Primary", value: "hsl(142 76% 36%)", hex: "#2E8B57" },
      { label: "Accent", value: "hsl(142 30% 85%)", hex: "#DCEBDE" },
      { label: "Card", value: "hsl(0 0% 100%)", hex: "#FFFFFF" },
      { label: "Background", value: "stone-50 / sage-50", hex: "#F6F7F4" },
      { label: "Foreground", value: "hsl(0 0% 9%)", hex: "#171717" },
      { label: "Border", value: "hsl(0 0% 91%)", hex: "#E8E8E8" },
    ],
  },
  {
    name: "Dark",
    icon: Moon,
    blurb: "Deep charcoal greens. Same calm energy, kinder on the eyes at night. For the 2 a.m. planners.",
    bg: "linear-gradient(135deg, #0a0a0b, #141517)",
    swatches: [
      { label: "Primary", value: "hsl(142 76% 45%)", hex: "#34D399" },
      { label: "Card", value: "hsl(17 20% 12%)", hex: "#241F1A" },
      { label: "Background", value: "hsl(17 20% 8%)", hex: "#14110D" },
      { label: "Foreground", value: "hsl(0 0% 98%)", hex: "#FAFAFA" },
      { label: "Border", value: "hsl(240 4% 18%)", hex: "#2B2B30" },
      { label: "Muted", value: "hsl(240 4% 15%)", hex: "#26262B" },
    ],
  },
  {
    name: "Colorful",
    icon: Palette,
    blurb: "Playful purple with orange and teal accents. Friendly and motivating without being loud.",
    bg: "linear-gradient(135deg, #f5f3ff, #fff7ed, #f0fdfa)",
    swatches: [
      { label: "Primary", value: "hsl(271 91% 65%)", hex: "#8B5CF6" },
      { label: "Accent", value: "hsl(173 80% 70%)", hex: "#5EEAD4" },
      { label: "Secondary", value: "hsl(33 100% 95%)", hex: "#FFF8E9" },
      { label: "Card", value: "hsl(0 0% 100%)", hex: "#FFFFFF" },
      { label: "Foreground", value: "hsl(0 0% 9%)", hex: "#171717" },
      { label: "Ring", value: "hsl(271 91% 65%)", hex: "#8B5CF6" },
    ],
  },
  {
    name: "Spicy Brains",
    icon: Sparkles,
    blurb: "Maximum dopamine. Neon magenta-to-cyan gradients, yellow borders, bold uppercase type. A celebration of colorful minds — backed by color-psychology notes for each hue.",
    bg: "linear-gradient(135deg, #ff6b9d 0%, #c06bff 50%, #6bc5ff 100%)",
    swatches: [
      { label: "Primary", value: "hsl(330 100% 50%)", hex: "#FF0080" },
      { label: "Secondary", value: "hsl(280 100% 70%)", hex: "#B14BFF" },
      { label: "Accent", value: "hsl(180 100% 50%)", hex: "#00FFFF" },
      { label: "Border", value: "#FFFF00", hex: "#FFFF00" },
      { label: "Gradient", value: "magenta → purple → cyan", hex: "#FF6B9D" },
      { label: "Text", value: "black w/ yellow shadow", hex: "#000000" },
    ],
  },
];

const SEASONAL_MODES = [
  { name: "Kawaii", icon: Cat, color: "#FFB6D9", note: "Soft pink. Permanent cute mode." },
  { name: "Halloween", icon: Ghost, color: "#2A1A3A", note: "Oct 25 – Nov 5. Spooky, playful." },
  { name: "Fall", icon: Leaf, color: "#B5651D", note: "Sep – Oct 24, Nov 6 – 30. Warm autumnal." },
  { name: "Winter", icon: Snowflake, color: "#A8D8F0", note: "Dec – Feb. Frosted and calm." },
  { name: "Christmas", icon: Gift, color: "#0B6623", note: "Dec 20 – 26. Red & green festive." },
  { name: "Valentines", icon: HeartIcon, color: "#E85D75", note: "Feb 10 – 16. Warm and pink." },
  { name: "New Years", icon: PartyPopper, color: "#1A1A2E", note: "Dec 27 – Jan 5. Midnight sparkle." },
  { name: "St. Patrick's", icon: Clover, color: "#2E7D32", note: "Mar 10 – 20. Emerald luck." },
  { name: "Fourth of July", icon: Flag, color: "#B22234", note: "Jul 1 – 7. Patriotic." },
  { name: "Summer", icon: Sun, color: "#F2C94C", note: "Jun – Aug. Bright and sunny." },
  { name: "Spring", icon: Flower2, color: "#F48FB1", note: "Mar 21 – May. Fresh and blooming." },
];

const FEATURES = [
  { icon: Brain, title: "Smart Task Breakdown", desc: "AI decomposes big overwhelming tasks into tiny, actionable first steps ('do the first 2 minutes')." },
  { icon: Bell, title: "Flexible Recurring Reminders", desc: "10 min to daily intervals, adaptive snooze logic, quiet-hours aware, OneSignal push." },
  { icon: Flame, title: "Energy-Based Suggestions", desc: "Tasks tagged low / medium / high energy; the app surfaces a task that fits your current state." },
  { icon: Timer, title: "Focus Timer & Focus Rooms", desc: "Pomodoro sessions plus live co-focus rooms with shared timers, music, and emoji reactions." },
  { icon: TrendingUp, title: "Progress & Insights", desc: "Streaks, completion charts, energy-by-time-of-day, and productivity patterns — never guilt-tripping." },
  { icon: Lightbulb, title: "Parking Lot", desc: "Capture stray ideas without acting on them now. Convert to tasks when the time is right." },
  { icon: CalendarDays, title: "Google Calendar Sync", desc: "Auto-imports events, AI-routes them to tasks or birthday reminders, never duplicates." },
  { icon: Mic, title: "Universal Voice Assistant", desc: "Add tasks, ask for help, and get coached by voice — hands-free capture when you can't type." },
  { icon: Users, title: "Accountability & Community", desc: "Partner up, chat, share mood check-ins, and join weekly challenges with streaks and leaderboards." },
  { icon: MessageCircleHeart, title: "Support Space", desc: "A safe, moderated community space for ADHD support — never clinical, always kind." },
  { icon: Trophy, title: "Gamification", desc: "Points, achievements, streaks, and weekly challenges that reward showing up, not just finishing." },
  { icon: Sparkles, title: "Daily Tips & Motivation Coach", desc: "Context-aware daily tips and an AI motivation coach tuned to your mood and momentum." },
];

const VOICE_PRINCIPLES = [
  { title: "Built by one of us", desc: "ADHDone was built by someone with ADHD, for people with ADHD. The voice comes from lived experience, not a clinical textbook." },
  { title: "Not another checklist app", desc: "We don't sell productivity — we sell getting it done. A reminder at 3pm doesn't guarantee anything, and we own that." },
  { title: "Warm, like a friend", desc: "We write like we're texting a friend who's stuck — never a clinician with a clipboard." },
  { title: "A little spicy", desc: "Real, a touch of humor, a little attitude. Never clinical, never sterile." },
  { title: "In your corner", desc: "Flexible and forgiving. We adjust to how your brain actually works — never the other way around." },
  { title: "Tiny first steps", desc: "Every nudge includes one concrete, sub-2-minute action — not the whole task." },
  { title: "No guilt, ever", desc: "Tomorrow is always a fresh start. We never frame a day as failed or 'tough'." },
  { title: "No othering", desc: "We never say 'your ADHD brain' or diagnose. Just helpful tips anyone could use." },
];

const SIGNATURE_PHRASES = [
  "Not another checklist app",
  "Built by someone with ADHD, for people with ADHD",
  "A reminder at 3pm doesn't guarantee anything gets done",
  "Just throw your tasks in",
  'Your "get it done" coach',
  "A parking lot for 2am ideas",
  "A little spicy",
  "Always in your corner",
  "You've got this",
  "Showing up IS the win",
];

function Swatch({ label, value, hex }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg border border-black/10 shadow-sm flex-shrink-0"
        style={{ background: hex }}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900">{label}</p>
        <p className="text-[11px] text-gray-500 font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({ kicker, title, children }) {
  return (
    <div className="mb-8">
      {kicker && (
        <p className="text-xs font-bold tracking-widest uppercase text-green-600 mb-2">{kicker}</p>
      )}
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{title}</h2>
      {children && <p className="text-base text-gray-600 max-w-2xl">{children}</p>}
    </div>
  );
}

export default function BrandBook() {
  return (
    <div
      className="min-h-screen bg-stone-50 text-gray-900"
      style={{
        paddingTop: "max(2rem, calc(2rem + env(safe-area-inset-top)))",
        paddingBottom: "max(3rem, calc(3rem + env(safe-area-inset-bottom)))",
      }}
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-8">

        {/* ── Back link ── */}
        <div className="mb-8">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← adhdone.app
          </a>
        </div>

        {/* ── Hero ── */}
        <header className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center shadow-lg">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">ADHDone</span>
          </div>
          <p className="text-sm font-semibold text-green-600 tracking-wide uppercase mb-4">Brand Book</p>
          <h1 className="text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight mb-6">
            An AI productivity companion<br />
            <span className="bg-gradient-to-r from-green-600 via-purple-600 to-cyan-500 bg-clip-text text-transparent">
              for spicy brains.
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl leading-relaxed">
            ADHDone helps people with ADHD get stuff done — without the shame, the overwhelm, or the
            neurotypical guilt trip. Smart reminders, tiny first steps, flexible themes, and a community
            that gets it.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-medium">
            <Heart className="w-4 h-4" /> You've got this.
          </div>
        </header>

        {/* ── Mission ── */}
        <section className="mb-20">
          <SectionTitle kicker="The Mission" title="Not another checklist app.">
            ADHDone was built by someone with ADHD, for people with ADHD — because we all know a reminder
            at 3pm doesn't guarantee anything actually gets done. The app works the way your brain
            actually does: flexible, a little spicy, and always in your corner. It figures out what
            deserves your attention and when, adjusting priority and reminder frequency so the important
            stuff doesn't get buried under a pile of well-meaning reminders.
          </SectionTitle>
        </section>

        {/* ── Voice & Tone ── */}
        <section className="mb-20">
          <SectionTitle kicker="Voice & Tone" title="How we sound.">
            Warm, real, a little funny, and never clinical. We talk like a friend who happens to know
            the science — not a doctor with a clipboard.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {VOICE_PRINCIPLES.map((p) => (
              <div key={p.title} className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-1">{p.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-green-50 border border-purple-100">
            <p className="text-xs font-bold tracking-widest uppercase text-purple-600 mb-3">Signature phrases</p>
            <div className="flex flex-wrap gap-2">
              {SIGNATURE_PHRASES.map((phrase) => (
                <span
                  key={phrase}
                  className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700"
                >
                  {phrase}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Color System ── */}
        <section className="mb-20">
          <SectionTitle kicker="Color System" title="Four core themes.">
            Every theme is a full mood, not just a palette swap. Users cycle through them; seasonal
            themes unlock as a reward. Color is functional here — calm for overstimulated moments,
            energy for low-motivation ones.
          </SectionTitle>
          <div className="space-y-6">
            {CORE_THEMES.map((theme) => {
              const Icon = theme.icon;
              return (
                <div
                  key={theme.name}
                  className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm"
                >
                  <div
                    className="p-8 sm:p-10 relative"
                    style={{ background: theme.bg, minHeight: 180 }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-white/80 backdrop-blur flex items-center justify-center shadow">
                        <Icon className="w-6 h-6 text-gray-800" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900">{theme.name}</h3>
                    </div>
                    <p className="text-gray-700 max-w-2xl leading-relaxed text-sm sm:text-base">
                      {theme.blurb}
                    </p>
                  </div>
                  <div className="p-6 bg-white grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {theme.swatches.map((s) => (
                      <Swatch key={s.label} {...s} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Seasonal */}
          <h3 className="text-xl font-bold text-gray-900 mt-12 mb-4">Seasonal modes</h3>
          <p className="text-gray-600 mb-6 max-w-2xl">
            Date-activated limited-edition themes that unlock as users explore. Each swaps the app
            background for a themed scene with frosted-glass cards.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {SEASONAL_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <div key={mode.name} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
                  <div
                    className="w-9 h-9 rounded-lg mb-3 flex items-center justify-center"
                    style={{ background: mode.color + "33" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: mode.color }} />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">{mode.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{mode.note}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Typography ── */}
        <section className="mb-20">
          <SectionTitle kicker="Typography" title="System sans, done right.">
            ADHDone uses the platform's native sans-serif stack (Inter on most devices, SF Pro on
            Apple) — chosen for legibility and zero load time. Hierarchy comes from weight and size,
            not novelty fonts.
          </SectionTitle>
          <div className="rounded-3xl bg-white border border-gray-200 shadow-sm divide-y divide-gray-100">
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Display · 5xl / Bold / Tight</p>
              <p className="text-5xl font-bold tracking-tight text-gray-900">You've got this</p>
            </div>
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Heading · 3xl / Bold</p>
              <p className="text-3xl font-bold text-gray-900">One tiny thing at a time</p>
            </div>
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Body · Base / Regular / Relaxed</p>
              <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
                Start with the smallest possible task and let that be enough for this moment. Starting
                creates momentum — waiting for motivation doesn't.
              </p>
            </div>
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Mono · Code & tokens</p>
              <p className="font-mono text-sm text-gray-700">hsl(142 76% 36%) · primary · minimalist</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Spicy Brains mode is the exception: bold, uppercase, condensed-feeling type with layered
            yellow/magenta text-shadow for maximum playfulness.
          </p>
        </section>

        {/* ── Iconography ── */}
        <section className="mb-20">
          <SectionTitle kicker="Iconography" title="Soft, rounded, lucide.">
            All icons are from <span className="font-mono text-sm">lucide-react</span> — consistent
            stroke weight, rounded corners, friendly. No sharp corporate marks. Icons pair with a
            wordmark, never replace it.
          </SectionTitle>
          <div className="flex flex-wrap gap-3">
            {[
              Brain, Bell, Timer, TrendingUp, Lightbulb, CalendarDays, Mic,
              Users, MessageCircleHeart, Trophy, Sparkles, Heart,
            ].map((Icon, i) => (
              <div
                key={i}
                className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center"
              >
                <Icon className="w-6 h-6 text-green-600" />
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section className="mb-20">
          <SectionTitle kicker="What's Inside" title="Every feature, in one glance.">
            A marketer should be able to describe the whole product from this list.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Design Principles ── */}
        <section className="mb-20">
          <SectionTitle kicker="Design Principles" title="Calm by default, energy on tap.">
            The app never shouts unless the user asks it to (Spicy Brains). Generous whitespace, rounded
            2xl corners, soft shadows, frosted-glass cards in seasonal modes, and safe-area-aware
            spacing for mobile. Built mobile-first, responsive up to desktop.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { t: "Rounded everything", d: "Cards 2xl, buttons rounded-xl, avatars rounded-2xl. Soft, not sharp." },
              { t: "Safe-area aware", d: "Notches, home indicators, and keyboard insets respected throughout." },
              { t: "Low-stimulation default", d: "Minimalist is the baseline. Color is opt-in, never forced." },
              { t: "Momentum over completion", d: "Celebrate showing up; never punish an unfinished list." },
            ].map((p) => (
              <div key={p.t} className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm">
                <p className="font-bold text-gray-900 mb-1">{p.t}</p>
                <p className="text-sm text-gray-600">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pt-10 border-t border-gray-200 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold">ADHDone</span>
          </div>
          <p className="text-sm text-gray-500">
            ADHDone — AI productivity for ADHD brains. You've got this.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This page is a private brand reference. It's not linked in the app — share by URL only.
          </p>
        </footer>
      </div>
    </div>
  );
}