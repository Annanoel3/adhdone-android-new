import React from 'react';
import { useNavigate } from "react-router-dom";
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
  Plus,
  Mic,
  Camera,
  Zap,
  Share2,
  CalendarDays,
  Cake,
  Moon,
  Sparkles,
  LayoutGrid,
  Target
} from "lucide-react";

const ADD_PATH_ICONS = { text: Share2, screenshot: Camera, widget: LayoutGrid, pinned: Zap };
// The how-to clips, by the same keys the Tasks page walkthrough uses.
const ADD_PATH_VIDEOS = Object.fromEntries(ADD_PATHS.map((p) => [p.key, p.video]));

export default function AppGuideModal({ isOpen, onClose, onGo, theme }) {
  const navigate = useNavigate();
  // "Turn it on in Settings" / "Set them in Settings": the guide closes — and
  // the side menu it was opened from (onGo, Anna Oct 13 2026) — and the app
  // goes straight to that card (Settings scrolls to the #hash).
  const go = (to) => { (onGo || onClose)(); navigate(to); };

  // Wording is Anna's (Oct 13 2026), lightly tidied.
  const guides = [
    {
      icon: LayoutDashboard,
      title: "Home",
      description: "Your command center. Today's tasks, quick actions, a daily tip, and gentle nudges when you need them."
    },
    {
      icon: Plus,
      title: "Adding tasks is easy",
      subItems: [
        {
          icon: Mic,
          title: "Say it",
          description: "Tap the mic in the app and just say your task or idea. You can even say features you wish the app had, to put in a request."
        },
        {
          icon: ADD_PATH_ICONS.text,
          title: "Share selected text",
          description: "Highlight text in any app. Tap Share and pick ADHDone.",
          video: ADD_PATH_VIDEOS.text,
        },
        {
          icon: ADD_PATH_ICONS.screenshot,
          title: "Share a screenshot",
          description: "Screenshot an invite, a flyer, a receipt, then share it to ADHDone. It reads the information from the picture and turns it into a task.",
          video: ADD_PATH_VIDEOS.screenshot,
        },
        {
          icon: ADD_PATH_ICONS.widget,
          title: "The home-screen widget",
          description: "Tap + to add tasks.",
          video: ADD_PATH_VIDEOS.widget,
        },
        {
          icon: ADD_PATH_ICONS.pinned,
          title: "The pinned notification",
          description: "With quick capture on, pull down your notification tray and tap the permanent notification to add a task.",
          link: { label: "Turn it on in Settings", to: "/settings#quick-capture" },
        },
      ]
    },
    {
      icon: ListTodo,
      title: "Tasks",
      description: "Everything in one place with urgency, subtasks, and smart reminders. Push a due date, break a task into steps, or drop it on the Back Burner when it's not today's problem."
    },
    {
      icon: CalendarDays,
      title: "Calendar",
      description: "Sync any calendar on your phone to add its tasks and events here."
    },
    {
      icon: Cake,
      title: "Birthdays",
      description: "Birthdays live on their own page and repeat every year. Get reminded a week out, the day before, and the day of — plus help drafting the text so you actually send it."
    },
    {
      icon: Timer,
      title: "Task Timer",
      description: "Time tasks to learn how long things really take you. Good for time blindness."
    },
    {
      icon: Target,
      title: "Focus Mode",
      description: "Pick one task to focus on. Your other recurring reminders go quiet until it's done (events, due dates and birthdays still come through), and that task checks in with you hourly."
    },
    {
      icon: Timer,
      title: "Pomodoro",
      description: "Work-and-break rounds with lengths you pick."
    },
    {
      icon: Lightbulb,
      title: "Parking Lot",
      description: "Brain dump ideas without derailing what you're doing. Add to the Parking Lot anywhere you can add a task — just say it's an idea."
    },
    {
      icon: TrendingUp,
      title: "Insights",
      description: "For the data lovers. Your patterns, streaks, and productivity — what times you're most productive, and proof of how far you've come."
    },
    {
      icon: MessageCircleHeart,
      title: "Talk It Out",
      description: "A judgment-free space for ADHD and executive-function strategy. App questions go here too."
    },
    {
      icon: Sparkles,
      title: "Themes",
      description: "Light, dark, colorful, or Spicy Brains — plus seasonal themes, unlocked when you find a special something in the app. Keep an eye out 👀"
    },
    {
      icon: Moon,
      title: "Quiet Hours",
      description: "Set the hours you don't want to be bothered.",
      link: { label: "Set them in Settings", to: "/settings?section=reminders#quiet-hours" },
    }
  ];

  const linkClass = `mt-1 inline-block text-sm font-medium underline underline-offset-2 ${
    theme === 'dark' ? 'text-green-400' : 'text-purple-600'
  }`;

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
              <CardContent className="p-3">
                {/* The icon sits beside the title only; everything under it
                    runs the card's full width (Anna, Oct 13 2026: the text
                    was squished to the right). */}
                <div className="flex items-center gap-3 mb-1">
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
                  <h3 className={`font-semibold ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    {guide.title}
                  </h3>
                </div>
                {guide.description && (
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {guide.description}
                  </p>
                )}
                {guide.link && (
                  <button type="button" onClick={() => go(guide.link.to)} className={linkClass}>
                    {guide.link.label}
                  </button>
                )}

                {guide.subItems && (
                  <div className="mt-2 space-y-3">
                    {guide.subItems.map((subItem) => (
                      <div key={subItem.title}>
                        <p className="text-sm">
                          <subItem.icon className={`inline-block w-4 h-4 mr-1.5 -mt-0.5 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`} />
                          <span className={`font-medium ${
                            theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                          }`}>
                            {subItem.title}:
                          </span>
                          <span className={`ml-1 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {subItem.description}
                          </span>
                        </p>
                        {subItem.link && (
                          <button type="button" onClick={() => go(subItem.link.to)} className={linkClass}>
                            {subItem.link.label}
                          </button>
                        )}
                        {subItem.video && (
                          <AutoClip src={subItem.video} className="mt-2 w-full max-h-[50vh] rounded-lg bg-black object-contain" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}