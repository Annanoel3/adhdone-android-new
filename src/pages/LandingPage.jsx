import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Brain, CheckCircle2, Sparkles } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Don't auto-redirect in Base44 builder preview (inside iframe)
    const isPreview = window.self !== window.top || new URLSearchParams(window.location.search).has('preview');
    if (isPreview) return;
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
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto w-full">
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
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-16 pb-10 max-w-3xl mx-auto w-full">
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
        <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          No credit card required
        </div>
      </main>

      {/* Google Account Usage Disclosure */}
      <section className="px-6 pb-12">
        <div className="max-w-2xl mx-auto bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">How ADHDone uses your Google account:</h2>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">•</span>
              <span><strong>Google Sign-In:</strong> We use Google OAuth solely to securely authenticate your identity. We do not access your Gmail, Google Drive, or any other Google services through sign-in.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">•</span>
              <span><strong>Google Calendar (optional):</strong> If you choose to connect Google Calendar, we request read-only access to import your existing events into ADHDone as smart tasks with AI-assigned reminders. This connection is entirely optional and can be disconnected at any time.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">•</span>
              <span><strong>No data sharing:</strong> We never sell, share, or use your Google data for advertising. Your data is encrypted and used solely to power your ADHDone experience.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">•</span>
              <span><strong>Revoke access anytime:</strong> You can disconnect Google Calendar or revoke app permissions at any time from your Google account settings or within ADHDone settings.</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
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