import React from "react";
import { Brain, Check, X, ExternalLink, Palette } from "lucide-react";
import BrandBackdrop from "@/components/brand/BrandBackdrop";
import { SectionTitle, Card } from "@/components/brand/BrandSection";
import DeveloperCredit from "@/components/brand/DeveloperCredit";
import KitNav from "@/components/presskit/KitNav";
import AdSpotGrid from "@/components/presskit/AdSpotGrid";
import CopyBank from "@/components/presskit/CopyBank";
import {
  ONE_LINER, ELEVATOR, AUDIENCES, DIFFERENTIATORS, FEATURE_GROUPS,
  AD_SPOTS, HOOKS, CAPTIONS, HASHTAGS, RULES, FACTS, FAQ,
} from "@/components/presskit/pressKitData";

const SECTIONS = [
  { id: "start", label: "Start here — what this app is" },
  { id: "who", label: "Who we're talking to" },
  { id: "why", label: "Why it's different" },
  { id: "features", label: "Everything in the app" },
  { id: "creative", label: "Ready-made ad spots" },
  { id: "copy", label: "Hooks, captions & hashtags" },
  { id: "rules", label: "Do this, never that" },
  { id: "look", label: "How it should look" },
  { id: "facts", label: "Facts, links & FAQ" },
];

export default function PressKit() {
  return (
    <BrandBackdrop>
      <div
        className="max-w-5xl mx-auto px-5 sm:px-8"
        style={{ paddingTop: "max(2rem, calc(2rem + env(safe-area-inset-top)))", paddingBottom: "max(3rem, calc(3rem + env(safe-area-inset-bottom)))" }}
      >
        <a href="/" className="text-sm text-[#7A6F6F] hover:text-[#2F2A2A] transition-colors">← adhdone</a>

        <header className="mt-8 mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/80 backdrop-blur shadow-lg flex items-center justify-center">
              <Brain className="w-7 h-7 text-[#E07A8B]" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight">ADHDone</span>
          </div>
          <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-4">Marketing Kit</p>
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.02] tracking-tight mb-6">
            Everything you<br />need to sell it.
          </h1>
          <p className="text-xl text-[#5A5252] max-w-2xl leading-relaxed">
            One page, written for someone who has never opened the app: what it is, who it's for,
            why it's different, every feature, six ad spots you can record today, and copy you can
            paste without changing a word.
          </p>
          <DeveloperCredit className="mt-8" />
        </header>

        <KitNav sections={SECTIONS} />

        {/* 01 — Start here */}
        <section id="start" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Start here" title="What this app is.">
            If you read nothing else on this page, read this.
          </SectionTitle>
          <Card className="p-6 sm:p-8 mb-6">
            <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-2">The one-liner</p>
            <p className="text-2xl font-extrabold leading-snug text-[#2F2A2A]">{ONE_LINER}</p>
          </Card>
          <div className="space-y-4">
            {ELEVATOR.map((p, i) => (
              <Card key={i} className="p-6">
                <p className="text-base text-[#4A4242] leading-relaxed">{p}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* 02 — Audience */}
        <section id="who" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Audience" title="Who we're talking to.">
            Five real people. Pick one per ad — the hook changes completely depending on which.
          </SectionTitle>
          <div className="space-y-3">
            {AUDIENCES.map((a) => (
              <Card key={a.who} className="p-5 sm:p-6 sm:flex sm:gap-8">
                <div className="sm:w-56 shrink-0 mb-3 sm:mb-0">
                  <p className="font-bold text-[#2F2A2A]">{a.who}</p>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-[#5A5252] leading-relaxed">{a.pain}</p>
                  <p className="text-sm font-semibold text-[#D9667A]">Lead with: "{a.hook}"</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* 03 — Differentiators */}
        <section id="why" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="The real pitch" title="Why it's different.">
            Every ADHD app claims to be built for ADHD. These five things are concrete, demonstrable,
            and specific to this app. Lead with them instead of the feature list.
          </SectionTitle>
          <div className="space-y-4">
            {DIFFERENTIATORS.map((d, i) => (
              <Card key={d.title} className="p-6 flex gap-5">
                <span className="text-3xl font-extrabold text-[#F9C4B4] leading-none">{i + 1}</span>
                <div>
                  <h3 className="font-bold text-lg mb-1.5">{d.title}</h3>
                  <p className="text-sm text-[#5A5252] leading-relaxed">{d.detail}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* 04 — Features */}
        <section id="features" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="The whole product" title="Everything in the app.">
            Grouped by the job it does, so an ad can take one lane instead of listing twenty things.
            All of this is shipping today.
          </SectionTitle>
          <div className="space-y-8">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.group}>
                <h3 className="text-xl font-bold mb-4">{g.group}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {g.items.map((f) => (
                    <Card key={f.name} className="p-5">
                      <p className="font-bold mb-1">{f.name}</p>
                      <p className="text-sm text-[#5A5252] leading-relaxed">{f.what}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 05 — Ad spots */}
        <section id="creative" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Creative you already have" title="Six ad spots, ready to record.">
            These are live pages inside the app. Each one animates on a loop by itself — open it,
            screen-record it, and you have a finished spot. Variant F is already built to vertical
            reel dimensions with the top and bottom kept clear for platform captions.
          </SectionTitle>
          <AdSpotGrid spots={AD_SPOTS} />
        </section>

        {/* 06 — Copy bank */}
        <section id="copy" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Copy bank" title="Hooks, captions & hashtags.">
            All of this is approved and on-voice. Use it verbatim.
          </SectionTitle>
          <CopyBank hooks={HOOKS} captions={CAPTIONS} hashtags={HASHTAGS} />
        </section>

        {/* 07 — Rules */}
        <section id="rules" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Guardrails" title="Do this, never that.">
            The right-hand column is the important one. Breaking those rules makes ADHDone sound like
            every app our audience has already deleted.
          </SectionTitle>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-7 h-7 rounded-lg bg-[#DCF5E4] flex items-center justify-center">
                  <Check className="w-4 h-4 text-[#2E8B57]" strokeWidth={3} />
                </span>
                <p className="font-bold">Always</p>
              </div>
              <ul className="space-y-3">
                {RULES.do.map((r) => (
                  <li key={r} className="text-sm text-[#4A4242] leading-relaxed">{r}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-7 h-7 rounded-lg bg-[#FFE0E8] flex items-center justify-center">
                  <X className="w-4 h-4 text-[#E05A7A]" strokeWidth={3} />
                </span>
                <p className="font-bold">Never</p>
              </div>
              <ul className="space-y-3">
                {RULES.dont.map((r) => (
                  <li key={r} className="text-sm text-[#4A4242] leading-relaxed">{r}</li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        {/* 08 — Look */}
        <section id="look" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Visual direction" title="How it should look.">
            Warm cream base, soft peach-and-blush blobs, frosted white cards, bold charcoal headlines.
            Rounded everything. Never cold SaaS blue. The full palette, typography, logo usage and
            theme swatches live in the Brand Book.
          </SectionTitle>
          <div className="rounded-3xl overflow-hidden border border-white/70 shadow-[0_8px_30px_rgba(120,60,60,0.08)] mb-6">
            <div className="h-36" style={{ background: "linear-gradient(135deg, #FBC4A8 0%, #FFF6EF 55%, #F9A8B8 100%)" }} />
          </div>
          <a
            href="/BrandBook"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#2F2A2A] hover:bg-[#1F1B1B] text-white font-semibold transition-colors"
          >
            <Palette className="w-4 h-4" /> Open the Brand Book
          </a>
        </section>

        {/* 09 — Facts */}
        <section id="facts" className="mb-20 scroll-mt-8">
          <SectionTitle kicker="Reference" title="Facts, links & FAQ.">
            The details you'll get asked about.
          </SectionTitle>
          <Card className="divide-y divide-[#F3E4DC] mb-8">
            {FACTS.map((f) => (
              <div key={f.k} className="p-5 sm:flex sm:gap-8">
                <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] sm:w-40 shrink-0 mb-1 sm:mb-0 sm:pt-0.5">{f.k}</p>
                <p className="text-sm text-[#4A4242] leading-relaxed break-words">
                  {f.v.startsWith("http") ? (
                    <a href={f.v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-[#D9667A] hover:underline">
                      {f.v} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : f.v}
                </p>
              </div>
            ))}
          </Card>

          <div className="space-y-3">
            {FAQ.map((f) => (
              <Card key={f.q} className="p-5">
                <p className="font-bold mb-1.5">{f.q}</p>
                <p className="text-sm text-[#5A5252] leading-relaxed">{f.a}</p>
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
          <p className="text-sm text-[#7A6F6F] mt-1">An app by <span className="font-semibold text-[#4A4242]">Mediocre at Best Dev</span>.</p>
          <p className="text-xs text-[#B4A6A6] mt-2">Marketing kit — not linked in the app, share by URL only.</p>
        </footer>
      </div>
    </BrandBackdrop>
  );
}