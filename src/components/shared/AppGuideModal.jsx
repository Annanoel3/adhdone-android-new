import React, { useState } from 'react';
import { ADD_PATHS } from "@/components/onboarding/pageIntros";
import { AutoClip } from "@/components/onboarding/PageIntroTour";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  ListTodo,
  Timer,
  MessageCircleHeart,
  Lightbulb,
  TrendingUp,
  Users,
  Plus,
  Mic,
  Camera,
  Zap,
  Share2,
  CalendarDays,
  Cake,
  Rocket,
  Moon,
  Sparkles,
  LayoutGrid
} from "lucide-react";

const ADD_PATH_ICONS = { text: Share2, screenshot: Camera, widget: LayoutGrid, pinned: Zap };

export default function AppGuideModal({ isOpen, onClose, theme }) {
  // One short line per page. The long version read as a wall of text and got
  // skipped (Anna, Oct 13 2026: "a lot of text ... will definitely be skipped
  // over by an adhd brain"). The ways to add a task from outside the app stay,
  // with their clips, behind one tap.
  const [showWays, setShowWays] = useState(false);
  const guides = [
    {
      icon: LayoutDashboard,
      title: "Home",
      description: "Today's tasks and quick actions."
    },
    {
      icon: Plus,
      title: "Adding a task",
      description: "Say it, type it, or share it in. The app works out the when.",
      moreLabel: "5 ways to add without opening the app",
      subItems: [
        {
          icon: Mic,
          title: "Talk it out",
          description: "Tap the mic and just say it — 'remind me to call the dentist Friday'"
        },
        // The four outside-the-app ways, each with its how-to clip — same
        // order and wording as the Tasks page walkthrough.
        ...ADD_PATHS.map((path) => ({
          icon: ADD_PATH_ICONS[path.key],
          title: path.title,
          description: path.text,
          video: path.video,
        })),
      ]
    },
    {
      icon: ListTodo,
      title: "Tasks",
      description: "Everything you've added. Push the date, split into steps, or park it on the Back Burner."
    },
    {
      icon: CalendarDays,
      title: "Calendar",
      description: "Tasks and events by day or week. Bring in your phone's calendars."
    },
    {
      icon: Cake,
      title: "Birthdays",
      description: "Reminded a week out, the day before, and the day of — with a text ready to send."
    },
    {
      icon: Timer,
      title: "Task Timer",
      description: "Pick a length, it counts down. When it rings: keep going, check it off, or stop."
    },
    {
      icon: Timer,
      title: "Focus Timer",
      description: "Work and break rounds that fit your brain."
    },
    {
      icon: Lightbulb,
      title: "Parking Lot",
      description: "Dump ideas without derailing. Turn them into tasks later."
    },
    {
      icon: TrendingUp,
      title: "Insights",
      description: "Streaks, focus time, and when you actually get things done."
    },
    {
      icon: MessageCircleHeart,
      title: "Talk It Out",
      description: "A judgment-free place to plan, get unstuck, or vent."
    },
    {
      icon: Sparkles,
      title: "Themes",
      description: "Light, dark, Spicy Brains, seasonal. Settings → Look and feel."
    },
    {
      icon: Moon,
      title: "Quiet Hours",
      description: "Reminders hold until morning. Settings → Reminders."
    },
    {
      icon: Users,
      title: "Community — coming soon",
      description: "Partners, chat, focus rooms, leaderboards — once enough people are here."
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''
      }`}>
        <DialogHeader>
          <DialogTitle className={`text-2xl ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            How to Use ADHDone
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {guides.map((guide) => (
            <Card key={guide.title} className={`border-none ${
              theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    theme === 'minimalist' 
                      ? 'bg-green-100' 
                      : theme === 'dark'
                        ? 'bg-green-900/30'
                        : 'bg-gradient-to-br from-purple-100 to-orange-100'
                  }`}>
                    <guide.icon className={`w-5 h-5 ${
                      theme === 'minimalist' 
                        ? 'text-green-600' 
                        : theme === 'dark'
                          ? 'text-green-400'
                          : 'text-purple-600'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold mb-1 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {guide.title}
                    </h3>
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      {guide.description}
                    </p>
                    
                    {guide.subItems && (
                      <button
                        type="button"
                        onClick={() => setShowWays((v) => !v)}
                        aria-expanded={showWays}
                        className={`mt-2 text-sm font-medium underline-offset-2 hover:underline ${
                          theme === 'dark' ? 'text-green-400' : 'text-purple-600'
                        }`}
                      >
                        {showWays ? 'Hide' : guide.moreLabel}
                      </button>
                    )}

                    {guide.subItems && showWays && (
                      <div className="mt-3 ml-4 space-y-2">
                        {guide.subItems.map((subItem) => (
                          <div key={subItem.title} className="flex items-start gap-2">
                            <subItem.icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                            }`} />
                            <div>
                              <span className={`font-medium text-sm ${
                                theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                              }`}>
                                {subItem.title}:
                              </span>
                              <span className={`text-sm ml-1 ${
                                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {subItem.description}
                              </span>
                              {subItem.video && (
                                <AutoClip src={subItem.video} className="mt-2 w-full max-h-[50vh] rounded-lg bg-black object-contain" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}