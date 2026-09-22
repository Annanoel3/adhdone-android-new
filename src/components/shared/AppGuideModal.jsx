import React from 'react';
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
  const guides = [
    {
      icon: LayoutDashboard,
      title: "Home",
      description: "Your command center. Today's tasks, quick actions, a daily tip, and gentle nudges when you need them."
    },
    {
      icon: Plus,
      title: "Adding a task — pick whatever's easiest",
      description: "Say it, type it, or share it in. You don't have to open the app to get a thought out of your head — the AI figures out the date, the steps, and how often to bug you:",
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
      description: "Everything in one place with urgency, energy level, subtasks, and smart reminders. Push a due date, break a task into steps, or drop it on the Back Burner when it's genuinely not today's problem — Back Burner tasks go quiet until you bring them back."
    },
    {
      icon: CalendarDays,
      title: "Calendar",
      description: "See your tasks and events by day or week, always starting on today. Connect Google Calendar to pull your real events in — they show up labeled so you can tell them from your own tasks."
    },
    {
      icon: Cake,
      title: "Birthdays",
      description: "Birthdays live on their own page and repeat every year. Get reminded a week out, the day before, and the day of — plus help drafting the text so you actually send it."
    },
    {
      icon: Rocket,
      title: "Launchpad",
      description: "Stuck at the starting line? Launchpad gets you moving with a countdown, a tiny first step, or a short sprint — because starting is the hard part."
    },
    {
      icon: Timer,
      title: "Focus Timer",
      description: "Pomodoro-style sessions with work and break lengths that fit your brain."
    },
    {
      icon: Lightbulb,
      title: "Parking Lot",
      description: "Brain dump ideas without derailing what you're doing. Make checklists, attach photos and notes, then convert anything into a task later."
    },
    {
      icon: TrendingUp,
      title: "Insights",
      description: "Your patterns, streaks, focus time, and achievements — what times you actually get things done, and proof of how far you've come."
    },
    {
      icon: MessageCircleHeart,
      title: "Talk It Out",
      description: "A judgment-free space for ADHD and executive-function strategy — planning, unsticking, venting, or figuring out how to use the app."
    },
    {
      icon: Sparkles,
      title: "Themes",
      description: "Light, dark, colorful, or Spicy Brains — plus seasonal themes that change with the calendar once you unlock them."
    },
    {
      icon: Moon,
      title: "Quiet Hours",
      description: "Set the hours you don't want to be bothered and reminders hold until morning. Set it in Settings."
    },
    {
      icon: Users,
      title: "Community — coming soon",
      description: "Accountability partners, chat, focus rooms, and leaderboards are on the way. We're waiting until there are enough people here to make it actually worth showing up for."
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