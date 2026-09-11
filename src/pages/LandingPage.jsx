import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Brain, CheckCircle2, Sparkles, Bell, Lightbulb, Rocket, Cake, Share2, TrendingUp } from "lucide-react";
import BrandBackdrop from "@/components/brand/BrandBackdrop";
import GoogleDisclosure from "@/components/brand/GoogleDisclosure";
import { Card } from "@/components/brand/BrandSection";

const BLURBS = [
  { icon: Bell, tint: "#DCF5E4", color: "#2E8B57", title: "Smart reminders that actually work", desc: "ADHDone figures out what deserves your attention and when — so the important stuff doesn't get buried." },
  { icon: Share2, tint: "#E9E4FF", color: "#7C5CE6", title: "Create tasks from any text", desc: "Highlight a text from Mom, share it to the app, and it's a task. No retyping." },
  { icon: Rocket, tint: "#FFE6D6", color: "#E0743F", title: "Launch into a task", desc: "A 5-minute countdown to liftoff, or a no-pressure sprint. Whichever gets you moving." },
  { icon: Lightbulb, tint: "#FFF3D6", color: "#D69A1E", title: "A parking lot for 2am ideas", desc: "Random idea you don't want to lose? Toss it in the Parking Lot and come back when you're ready." },
  { icon: Cake, tint: "#FFE0E8", color: "#E05A7A", title: "Never forget birthdays again", desc: "Reminders plus a drafted text ready to send. You just tap." },
  { icon: TrendingUp, tint: "#DDEBFF", color: "#3B7DD8", title: "Your data, your patterns", desc: "See when you actually get things done — without ever being guilt-tripped about it." },
];

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (!authed) return;
      if (sessionStorage.getItem('adhd_calendar_oauth_return') === '1') {
        sessionStorage.removeItem('adhd_calendar_oauth_return');
        navigate('/Calendar', { replace: true });
      } else {
        navigate("/Home", { replace: true });
      }
    });
  }, [navigate]);

  const handleSignIn = () => {
    base44.auth.redirectToLogin(window.location.origin + "/Home");
  };

  const cta = "bg-[#2F2A2A] hover:bg-[#1F1B1B] text-white rounded-2xl shadow-lg";

  return (
    <BrandBackdrop className="flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur shadow flex items-center justify-center">
            <Brain className="w-5 h-5 text-[#E07A8B]" />
          </div>
          <span className="font-extrabold text-xl tracking-tight">ADHDone</span>
        </div>
        <Button onClick={handleSignIn} className={`${cta} px-5`}>Sign in</Button>
      </header>

      <main className="flex-1 flex flex-col items-center text-center px-6 pt-10 pb-8 max-w-3xl mx-auto w-full">
        <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur text-[#D9667A] text-sm font-semibold px-4 py-1.5 rounded-full mb-6 shadow-sm">
          <Sparkles className="w-4 h-4" /> Not another checklist app
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.1] tracking-tight mb-5">
          Built by someone with ADHD,<br />for people with ADHD.
        </h1>
        <p className="text-lg text-[#5A5252] mb-8 max-w-xl leading-relaxed">
          Because we all know a reminder at 3pm doesn't guarantee anything actually gets done. Just throw your tasks in and let ADHDone be your "get it done" coach.
        </p>
        <Button onClick={handleSignIn} size="lg" className={`${cta} px-10 py-4 text-lg h-auto`}>
          Get started — it's free
        </Button>
        <div className="flex items-center gap-2 mt-4 text-sm text-[#7A6F6F]">
          <CheckCircle2 className="w-4 h-4 text-[#2E8B57]" /> No credit card required
        </div>
      </main>

      <section className="px-6 pb-12 max-w-3xl mx-auto w-full">
        <div className="grid sm:grid-cols-2 gap-4">
          {BLURBS.map(({ icon: Icon, tint, color, title, desc }) => (
            <Card key={title} className="p-6 text-left">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: tint }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="font-bold mb-1.5">{title}</h3>
              <p className="text-sm text-[#5A5252] leading-relaxed">{desc}</p>
            </Card>
          ))}
        </div>
        <p className="text-center text-lg font-semibold text-[#4A4242] mt-8">
          Flexible, a little spicy, and always in your corner.
        </p>
      </section>

      <section className="px-6 pb-12 max-w-2xl mx-auto w-full">
        <GoogleDisclosure />
      </section>

      <footer className="border-t border-white/60 py-6 px-6 text-center text-sm text-[#7A6F6F]">
        <div className="flex items-center justify-center gap-4">
          <Link to="/privacypolicy" className="hover:text-[#2F2A2A] hover:underline">Privacy Policy</Link>
          <span>·</span>
          <Link to="/Terms" className="hover:text-[#2F2A2A] hover:underline">Terms of Service</Link>
        </div>
        <p className="mt-2">© {new Date().getFullYear()} ADHDone. All rights reserved.</p>
      </footer>
    </BrandBackdrop>
  );
}