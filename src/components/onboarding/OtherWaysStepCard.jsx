import React from "react";
import { Share2, Camera, Bell, LayoutGrid } from "lucide-react";
import OnboardingCard from "./OnboardingCard";

const WAYS = [
  {
    icon: Share2,
    title: "Share highlighted text",
    body: "Highlight text anywhere — a message, an email, a website — hit Share and pick ADHDone. It becomes a task, idea, or event.",
    example: true,
  },
  {
    icon: Camera,
    title: "Share a screenshot or photo",
    body: "Screenshot anything (an invite, a flyer, a receipt) and share it into the app — it reads it and makes the task for you.",
  },
  {
    icon: Bell,
    title: "The pinned notification",
    body: "We'll offer you a shortcut pinned in your notification tray — dump a task in without opening the app.",
  },
  {
    icon: LayoutGrid,
    title: "The home screen widget",
    body: "Add a task straight from the widget — and see today's tasks right on your home screen.",
  },
];

// Tour step: the non-obvious ways to get things into the app.
export default function OtherWaysStepCard({ isLast, stepNumber, totalSteps, onNext, onSkip }) {
  return (
    <OnboardingCard
      title="Other ways to add stuff 📥"
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      isLast={isLast}
      onNext={onNext}
      onSkip={onSkip}
      panelStyle={{ top: "50%", transform: "translateY(-50%)" }}
    >
      <p className="text-sm text-muted-foreground">
        You don't have to open the app to get a thought out of your head.
      </p>

      <div className="space-y-4 mt-4">
        {WAYS.map((way) => (
          <div key={way.title} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <way.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground">{way.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{way.body}</p>
              {way.example && (
                <p className="mt-2 text-sm text-foreground bg-accent rounded px-2 py-1 inline-block">
                  hey, don't forget to grab food on the way home
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </OnboardingCard>
  );
}