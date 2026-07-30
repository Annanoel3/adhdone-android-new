import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Brain,
  Target,
  Lightbulb,
  Zap,
  ListTree,
  Gift,
  Palette,
  Mic,
  CalendarDays,
  MessageCircleHeart,
  Trophy,
  Heart,
  Sparkles,
} from 'lucide-react';

const SPICY_FEATURES = [
  {
    icon: Brain,
    title: 'Reminders that actually think',
    description:
      "An AI reads each task and decides how often to nudge you, how urgent it is, and how much energy it'll take. A 10-minute errand doesn't get the same treatment as 'renew your license.' Quiet hours keep it silent when you're done for the day, and the first nudge of the day is one friendly digest instead of a pile-up of notifications that freezes you in place.",
  },
  {
    icon: Target,
    title: 'Focus Mode',
    description:
      "Pick the one thing you're working on and ADHDone silences everything else — replacing the noise with a gentle hourly 'how's it going?' check-in until you're done. No more notification fatigue or task paralysis from twelve reminders firing at once.",
  },
  {
    icon: Lightbulb,
    title: 'The Parking Lot',
    description:
      "Got a random 2am idea or a 'someday' project? Toss it in the Parking Lot instead of losing focus. The AI even figures out whether what you said is a real task, a calendar event, or just an idea that belongs here — so the right thing ends up in the right place.",
  },
  {
    icon: Zap,
    title: 'Energy-aware suggestions',
    description:
      "Every task is tagged with the energy it'll take (low / medium / high) and the app checks in on how you're actually feeling, so you can match what you do to what you've got in the tank today.",
  },
  {
    icon: ListTree,
    title: 'Tiny first steps',
    description:
      "Big tasks get broken down into ordered, doable sub-steps by the AI — so 'do laundry' becomes a sequence instead of a wall of dread. Celebrate each step as you go.",
  },
  {
    icon: Gift,
    title: "It's actually fun",
    description:
      "Completion confetti, momentum celebrations, hidden Easter eggs, and a whole rainbow of seasonal themes keep things light — so your brain doesn't get bored and bail halfway through.",
  },
  {
    icon: Palette,
    title: 'Spicy Brains theme',
    description:
      "A high-contrast neon theme built on color psychology: red for urgency, yellow for optimism and memory, blue for calm, green for balance, orange for energy, and purple for creativity — a little extra dopamine for brains that need it.",
  },
  {
    icon: Mic,
    title: "Say it, don't type it",
    description:
      "Speak your tasks out loud and the AI splits them, schedules them, and figures out the timing. Say 'today' on a chore and you get gentle 2-hour check-ins — and if it's not done by tonight, it rolls over as overdue tomorrow (one-time reminders are reserved for actual events).",
  },
  {
    icon: CalendarDays,
    title: 'A calendar that makes sense',
    description:
      "Import your Google Calendar and ADHDone intelligently routes each item: real appointments stay events, actionable items become tasks, and birthdays get their own reminders — each with an AI-built reminder schedule.",
  },
  {
    icon: MessageCircleHeart,
    title: 'A place to vent (and body-double)',
    description:
      "A judgment-free AI Support Space for when you need to talk something through — plus accountability partners, mood check-ins, and Focus Rooms (virtual body doubling) so you're not doing it alone.",
  },
  {
    icon: Trophy,
    title: 'Wins, not guilt',
    description:
      "Streaks, achievements, weekly challenges, and a weekly recap celebrate showing up — never the productivity-shaming 'you failed' notifications other apps love. We celebrate tiny wins, because tiny wins compound.",
  },
];

export default function About() {
  const navigate = useNavigate();
  const theme = localStorage.getItem('adhd_theme') || 'minimalist';

  const pageBg =
    theme === 'dark'
      ? 'bg-gray-900'
      : theme === 'spicybrains'
        ? 'bg-gradient-to-br from-pink-300 to-yellow-300'
        : 'bg-gradient-to-br from-stone-50 via-sage-50 to-stone-100';

  const cardBg = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const heading = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const body = theme === 'dark' ? 'text-gray-300' : 'text-gray-600';
  const subtle = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const featureCard = theme === 'dark' ? 'bg-gray-900/60' : 'bg-gray-50';

  return (
    <div
      className={`min-h-screen p-4 md:p-8 ${pageBg}`}
      style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}
    >
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/settings')}
          className="gap-2 p-3 h-12 text-base rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Settings
        </Button>

        <div className="mb-8 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${heading}`}>About ADHDone</h1>
            <p className={subtle}>Not another checklist app.</p>
          </div>
        </div>

        {/* Our story / Play Store description */}
        <Card className={`mb-6 border-none shadow-lg ${cardBg}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${heading}`}>
              <Heart className="w-5 h-5" />
              Our Story
            </CardTitle>
          </CardHeader>
          <CardContent className={`space-y-4 text-sm leading-relaxed ${body}`}>
            <p>
              Built by someone with ADHD — for people with ADHD, and anyone who
              shares the same (or similar) struggles.
            </p>
            <p>
              Let's be honest: a reminder at 3pm doesn't guarantee anything
              actually gets done. Most task apps assume that if they ping you,
              you'll do the thing. ADHDone doesn't. It's built around the way a
              spicy brain actually works — the overwhelm, the time blindness, the
              47 tabs open, the 2am ideas you can't afford to lose, and the shame
              spiral when a to-do list gets too long.
            </p>
            <p>
              So instead of another rigid checklist, ADHDone is your get-it-done
              companion: it figures out what deserves your attention and when,
              breaks the scary stuff into tiny first steps, celebrates you for
              showing up, and gently course-corrects when life happens. No
              productivity shaming — just one tiny win at a time.
            </p>
          </CardContent>
        </Card>

        {/* What sets it apart */}
        <Card className={`mb-6 border-none shadow-lg ${cardBg}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${heading}`}>
              <Sparkles className="w-5 h-5" />
              What Sets ADHDone Apart
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-sm leading-relaxed mb-5 ${body}`}>
              Here's every way ADHDone is geared toward spicy brains — the stuff
              a typical task app would never even think to do.
            </p>

            <div className="space-y-3">
              {SPICY_FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className={`flex items-start gap-3 rounded-xl p-4 ${featureCard}`}
                >
                  <div
                    className={`p-2 rounded-lg flex-shrink-0 ${
                      theme === 'minimalist'
                        ? 'bg-green-100'
                        : theme === 'dark'
                          ? 'bg-green-900/30'
                          : 'bg-gradient-to-br from-purple-100 to-orange-100'
                    }`}
                  >
                    <feature.icon
                      className={`w-5 h-5 ${
                        theme === 'minimalist'
                          ? 'text-green-600'
                          : theme === 'dark'
                            ? 'text-green-400'
                            : 'text-purple-600'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold mb-1 ${heading}`}>
                      {feature.title}
                    </h3>
                    <p className={`text-sm leading-relaxed ${body}`}>
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className={`text-center text-lg font-medium mt-8 ${heading}`}>
              Flexible, a little spicy, and always in your corner.
            </p>
          </CardContent>
        </Card>

        <div style={{ height: '80px' }} aria-hidden="true" />
      </div>
    </div>
  );
}