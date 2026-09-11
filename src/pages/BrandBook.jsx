import React from "react";
import { Brain, Heart, Bell, Timer, TrendingUp, Lightbulb, CalendarDays, Mic, Rocket, Cake, Share2, MessageCircleHeart, Sparkles } from "lucide-react";
import BrandBackdrop from "@/components/brand/BrandBackdrop";
import { SectionTitle, Card, Swatch } from "@/components/brand/BrandSection";
import { MARKETING_PALETTE, CORE_THEMES, SEASONAL_MODES, FEATURES, VOICE_PRINCIPLES, SAY_THIS, SIGNATURE_PHRASES } from "@/components/brand/brandData";

export default function BrandBook() {
  return (
    <BrandBackdrop>
      <div
        className="max-w-5xl mx-auto px-5 sm:px-8"
        style={{ paddingTop: "max(2rem, calc(2rem + env(safe-area-inset-top)))", paddingBottom: "max(3rem, calc(3rem + env(safe-area-inset-bottom)))" }}
      >
        <a href="/" className="text-sm text-[#7A6F6F] hover:text-[#2F2A2A] transition-colors">← adhdone</a>

        {/* Hero */}
        <header className="mt-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/80 backdrop-blur shadow-lg flex items-center justify-center">
              <Brain className="w-7 h-7 text-[#E07A8B]" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight">ADHDone</span>
          </div>
          <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-4">Brand Book</p>
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.02] tracking-tight mb-6">
            Not another<br />checklist app.
          </h1>
          <p className="text-xl text-[#5A5252] max-w-2xl leading-relaxed">
            ADHDone was built by someone with ADHD, for people with ADHD. It's the assistant who knows a
            reminder at 3pm doesn't guarantee anything gets done — and makes sure it still gets done.
            Flexible, a little spicy, and always in your corner.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur text-[#D9667A] text-sm font-semibold shadow-sm">
            <Heart className="w-4 h-4" /> You've got this.
          </div>
        </header>

        {/* Story */}
        <section className="mb-20">
          <SectionTitle kicker="Where it comes from" title="Made by someone with ADHD, for people with ADHD.">
            This isn't a productivity company that discovered ADHD as a market. It's one person with ADHD
            who got tired of apps that assume you'll just… do the thing when the notification says so.
            Every feature exists because it solved a real problem on a real Tuesday: the idea that flew
            away, the birthday text that never got sent, the task that needed a countdown just to start.
          </SectionTitle>
          <Card className="p-6 sm:p-8">
            <p className="text-lg sm:text-xl font-semibold leading-relaxed text-[#2F2A2A]">
              "We're not here to make you more productive. We're here to help you get the thing done,
              feel okay about it, and move on with your day. Showing up is the win."
            </p>
          </Card>
        </section>

        {/* Voice */}
        <section className="mb-20">
          <SectionTitle kicker="Voice & Tone" title="How we sound.">
            Warm, real, a little funny, never clinical. We talk like a friend who happens to know the
            science — not a doctor with a clipboard.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {VOICE_PRINCIPLES.map((p) => (
              <Card key={p.title} className="p-5">
                <h3 className="font-bold mb-1">{p.title}</h3>
                <p className="text-sm text-[#5A5252] leading-relaxed">{p.desc}</p>
              </Card>
            ))}
          </div>

          <h3 className="text-xl font-bold mb-4">Say this, not that</h3>
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {SAY_THIS.map((row) => (
              <Card key={row.dont} className="p-5">
                <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-1">Not this</p>
                <p className="text-sm text-[#7A6F6F] line-through mb-3">{row.dont}</p>
                <p className="text-xs font-bold tracking-widest uppercase text-[#2E8B57] mb-1">This</p>
                <p className="text-sm font-medium">{row.say}</p>
              </Card>
            ))}
          </div>

          <Card className="p-6">
            <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-3">Signature phrases</p>
            <div className="flex flex-wrap gap-2">
              {SIGNATURE_PHRASES.map((phrase) => (
                <span key={phrase} className="px-3 py-1.5 rounded-full bg-[#FFF6EF] border border-[#F9D8CC] text-sm font-medium text-[#4A4242]">{phrase}</span>
              ))}
            </div>
          </Card>
        </section>

        {/* Marketing palette */}
        <section className="mb-20">
          <SectionTitle kicker="Marketing Palette" title="Peach, blush, and a warm charcoal.">
            Store listings, screenshots, and the sign-in page live here: a cream base with big, soft
            peach-and-pink blobs, frosted white cards, and bold charcoal headlines. Warm and human —
            never a cold SaaS blue.
          </SectionTitle>
          <div className="rounded-3xl overflow-hidden border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)]">
            <div className="h-40 relative" style={{ background: "linear-gradient(135deg, #FBC4A8 0%, #FFF6EF 55%, #F9A8B8 100%)" }}>
              <p className="absolute bottom-5 right-6 text-3xl font-extrabold text-[#2F2A2A] text-right leading-tight">Dashboard with<br />everything at a glance</p>
            </div>
            <div className="p-6 bg-white/85 grid grid-cols-2 sm:grid-cols-4 gap-5">
              {MARKETING_PALETTE.map((s) => <Swatch key={s.label} {...s} />)}
            </div>
          </div>
        </section>

        {/* In-app themes */}
        <section className="mb-20">
          <SectionTitle kicker="In-App Themes" title="Four core themes.">
            Inside the app, every theme is a full mood, not a palette swap. Minimalist is the calm
            default; the others are opt-in energy.
          </SectionTitle>
          <div className="space-y-6">
            {CORE_THEMES.map((theme) => {
              const Icon = theme.icon;
              return (
                <div key={theme.name} className="rounded-3xl overflow-hidden border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)]">
                  <div className="p-8 sm:p-10" style={{ background: theme.bg }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-white/80 backdrop-blur flex items-center justify-center shadow">
                        <Icon className="w-6 h-6 text-gray-800" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900">{theme.name}</h3>
                    </div>
                    <p className="text-gray-700 max-w-2xl leading-relaxed text-sm sm:text-base">{theme.blurb}</p>
                  </div>
                  <div className="p-6 bg-white/85 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {theme.swatches.map((s) => <Swatch key={s.label} {...s} />)}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="text-xl font-bold mt-12 mb-2">Seasonal modes</h3>
          <p className="text-[#5A5252] mb-6 max-w-2xl">
            Date-driven, cartoon-style backgrounds with frosted-glass cards. They rotate through the
            year on their own once unlocked — a little surprise every time the season turns.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {SEASONAL_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <Card key={mode.name} className="p-4">
                  <div className="w-9 h-9 rounded-lg mb-3 flex items-center justify-center" style={{ background: mode.color + "33" }}>
                    <Icon className="w-5 h-5" style={{ color: mode.color }} />
                  </div>
                  <p className="font-semibold text-sm">{mode.name}</p>
                  <p className="text-xs text-[#7A6F6F] mt-0.5">{mode.note}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Typography */}
        <section className="mb-20">
          <SectionTitle kicker="Typography" title="Bold headlines, friendly body.">
            System sans everywhere (Inter / SF Pro) for zero load time. Headlines are extrabold and
            tight; body copy is relaxed and never smaller than it needs to be.
          </SectionTitle>
          <Card className="divide-y divide-[#F3E4DC]">
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-2">Display · Extrabold / Tight</p>
              <p className="text-5xl font-extrabold tracking-tight">Keep track of progress</p>
            </div>
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-2">Heading · Bold</p>
              <p className="text-3xl font-bold">Parking Lot is where random ideas go</p>
            </div>
            <div className="p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-2">Body · Relaxed</p>
              <p className="text-base text-[#5A5252] leading-relaxed max-w-2xl">
                Capture every idea before it flies away. Start with the smallest possible step and let
                that be enough for right now.
              </p>
            </div>
          </Card>
        </section>

        {/* Iconography */}
        <section className="mb-20">
          <SectionTitle kicker="Iconography" title="Soft, rounded, lucide.">
            Consistent stroke, rounded corners, friendly. Feature icons sit in a pastel tile that matches
            the feature's accent — mint for done, lavender for smart, blush for birthdays.
          </SectionTitle>
          <div className="flex flex-wrap gap-3">
            {[Brain, Bell, Timer, TrendingUp, Lightbulb, CalendarDays, Mic, Rocket, Cake, Share2, MessageCircleHeart, Sparkles].map((Icon, i) => (
              <div key={i} className="w-14 h-14 rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-sm flex items-center justify-center">
                <Icon className="w-6 h-6 text-[#E07A8B]" />
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mb-20">
          <SectionTitle kicker="What's Inside" title="Helpful tools to keep you on track.">
            Everything currently shipping. A marketer should be able to describe the whole product from this list.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-[#FFE0E8] flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-[#E05A7A]" />
                  </div>
                  <h3 className="font-bold mb-1">{f.title}</h3>
                  <p className="text-sm text-[#5A5252] leading-relaxed">{f.desc}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Design principles */}
        <section className="mb-20">
          <SectionTitle kicker="Design Principles" title="Calm by default, energy on tap.">
            The app never shouts unless you ask it to. Rounded corners, soft shadows, generous
            whitespace, and mobile-first everything.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { t: "Rounded everything", d: "Cards 2xl, buttons rounded-xl. Soft, not sharp." },
              { t: "One thing at a time", d: "Today's Focus shows a few tasks, not the whole list. Nudges surface one task, not ten." },
              { t: "Low-stimulation default", d: "Minimalist is the baseline. Color is opt-in, never forced." },
              { t: "Momentum over completion", d: "Celebrate starting; never punish an unfinished list." },
              { t: "Birthdays are their own thing", d: "They never clutter the task list. Cake emoji, own page, own reminders." },
              { t: "Quiet hours are sacred", d: "Nothing fires at 4 a.m. Late-evening nudges wait for morning." },
            ].map((p) => (
              <Card key={p.t} className="p-5">
                <p className="font-bold mb-1">{p.t}</p>
                <p className="text-sm text-[#5A5252]">{p.d}</p>
              </Card>
            ))}
          </div>
        </section>

        <footer className="pt-10 border-t border-white/60 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-white/80 shadow flex items-center justify-center">
              <Brain className="w-4 h-4 text-[#E07A8B]" />
            </div>
            <span className="font-bold">ADHDone</span>
          </div>
          <p className="text-sm text-[#7A6F6F]">Built by someone with ADHD, for people with ADHD. You've got this.</p>
          <p className="text-xs text-[#B4A6A6] mt-2">Private brand reference — not linked in the app, share by URL only.</p>
        </footer>
      </div>
    </BrandBackdrop>
  );
}