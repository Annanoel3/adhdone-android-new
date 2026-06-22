import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Brain, Bell, CalendarDays, Timer, Palette, CheckCircle2, Sparkles } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Task Breakdown",
    desc: "Speak or type a task and AI instantly splits it into manageable steps — no overwhelm.",
  },
  {
    icon: Bell,
    title: "Flexible Smart Reminders",
    desc: "Reminders that adapt to you: every 10 min, hourly, daily, or at a specific time. Never forget again.",
  },
  {
    icon: CalendarDays,
    title: "Google Calendar Sync",
    desc: "Your calendar events become tasks automatically with AI-assigned importance and reminders.",
  },
  {
    icon: Timer,
    title: "Focus Timer & Rooms",
    desc: "Pomodoro-style focus sessions you can share with accountability partners in real time.",
  },
  {
    icon: Palette,
    title: "Calming Themes",
    desc: "Minimalist, dark, colorful, seasonal — switch to whatever helps your brain feel at ease.",
  },
  {
    icon: Sparkles,
    title: "Parking Lot for Ideas",
    desc: "Capture random thoughts without losing focus. Come back and convert them to tasks later.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) navigate("/Home", { replace: true });
    });
  }, [navigate]);

  const handleSignIn = () => {
    base44.auth.redirectToLogin(window.location.origin + "/Home");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-green-50 to-stone-100 flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-900">ADHDone</span>
        </div>
        <Button onClick={handleSignIn} className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-5">
          Sign in
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-16 pb-20 max-w-3xl mx-auto w-full">
        <span className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <Sparkles className="w-4 h-4" /> Built for the ADHD brain
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
          Stop losing track.<br />Start getting things done.
        </h1>
        <p className="text-lg text-gray-600 mb-8 max-w-xl">
          ADHDone is an AI-powered productivity app designed specifically for people with ADHD. Smart reminders, instant task breakdown, Google Calendar sync, and focus tools — all in one place.
        </p>
        <Button
          onClick={handleSignIn}
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white rounded-2xl px-10 py-4 text-lg h-auto shadow-lg"
        >
          Get started — it's free
        </Button>

        {/* Social proof */}
        <div className="flex items-center gap-2 mt-5 text-sm text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          No credit card required
        </div>
      </main>

      {/* Features */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-10">
            Everything your brain needs
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-stone-50 rounded-2xl p-6 border border-stone-200">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-green-700" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to finally feel on top of things?</h2>
        <Button
          onClick={handleSignIn}
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white rounded-2xl px-10 py-4 text-lg h-auto shadow-lg"
        >
          Get started for free
        </Button>
      </section>

      {/* Google Account Usage Disclosure */}
      <section className="bg-stone-50 border-t border-stone-200 py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-4">How ADHDone uses your Google account:</h2>
          <ul className="space-y-4 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0">•</span>
              <span><strong>Google Sign-In:</strong> We use Google OAuth solely to securely authenticate your identity. We do not access your Gmail, Google Drive, or any other Google services through sign-in.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0">•</span>
              <span><strong>Google Calendar (optional):</strong> If you choose to connect Google Calendar, we request read-only access to import your existing events into ADHDone as smart tasks with AI-assigned reminders. This connection is entirely optional and can be disconnected at any time.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0">•</span>
              <span><strong>No data sharing:</strong> We never sell, share, or use your Google data for advertising. Your data is encrypted and used solely to power your ADHDone experience.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0">•</span>
              <span><strong>Revoke access anytime:</strong> You can disconnect Google Calendar or revoke app permissions at any time from your Google account settings or within ADHDone settings.</span>
            </li>
          </ul>
          <p className="mt-5 text-xs text-gray-500">
            ADHDone's use of Google user data complies with the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-6 px-6 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-4">
          <Link to="/privacypolicy" className="hover:text-gray-700 hover:underline">Privacy Policy</Link>
          <span>·</span>
          <Link to="/Terms" className="hover:text-gray-700 hover:underline">Terms of Service</Link>
        </div>
        <p className="mt-2">© {new Date().getFullYear()} ADHDone. All rights reserved.</p>
      </footer>
    </div>
  );
}