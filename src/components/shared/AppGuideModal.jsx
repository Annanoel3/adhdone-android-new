import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { ADD_PATHS } from "@/components/onboarding/pageIntros";
import { AutoClip } from "@/components/onboarding/PageIntroTour";
import { onThisPhone } from "@/lib/phonePlatform";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Target,
  Rocket,
  AlarmClock,
  HelpCircle,
  ChevronDown,
  Wrench,
  Shuffle,
  MapPin,
  BookLock,
  Settings as SettingsIcon
} from "lucide-react";

const ADD_PATH_ICONS = { text: Share2, screenshot: Camera, widget: LayoutGrid, pinned: Zap };
// The how-to clips, by the same keys the Tasks page walkthrough uses.
// They're Android screen recordings, so the iPhone app shows none
// (phonePlatform.js androidClips).
const ALL_ADD_PATH_VIDEOS = Object.fromEntries(ADD_PATHS.map((p) => [p.key, p.video]));

export default function AppGuideModal({ isOpen, onClose, onGo, theme }) {
  const navigate = useNavigate();
  // Every section starts closed, so the whole list fits on one screen and the
  // person sees everything they can open without scrolling (Anna, Oct 24
  // 2026, after a tester found the open-everything guide "a lot to look at").
  // A section's videos only load once it is opened. Closing the guide and
  // opening it again starts closed again.
  const [openSections, setOpenSections] = useState({});
  useEffect(() => { if (isOpen) setOpenSections({}); }, [isOpen]);
  const toggleSection = (title) => setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  // Decided when the guide opens, not when the page first loads.
  const ADD_PATH_VIDEOS = onThisPhone('androidClips') ? ALL_ADD_PATH_VIDEOS : {};
  // "Turn it on in Settings" / "Set them in Settings": the guide closes — and
  // the side menu it was opened from (onGo, Anna Oct 13 2026) — and the app
  // goes straight to that card (Settings scrolls to the #hash).
  const go = (to) => { (onGo || onClose)(); navigate(to); };

  // Alarms exist on this build (the same check Settings' Alarms card makes).
  // Where they don't, the alarm-or-notification step says nothing.
  const hasAlarms = typeof window !== 'undefined' && typeof window.Capacitor?.Plugins?.AlarmBridge?.sync === 'function';
  // Record Notes needs the phone's recorder (the menu offers it on the same
  // check); the guide doesn't describe it where it isn't there.
  const hasRecorder = typeof window !== 'undefined' && !!window.Capacitor?.Plugins?.RecorderBridge;

  // Wording is Anna's (Oct 13 2026), lightly tidied.
  const guides = [
    // The three things a new person needs on day one, before the feature
    // list (Anna, Oct 24 2026, after a tester found the guide "a lot to look
    // at"): how to add something, alarm vs notification, and how to get back
    // here. Nothing below is repeated in it.
    {
      icon: Rocket,
      title: "Start here",
      subItems: [
        {
          icon: Plus,
          title: "Add something",
          description: "Tap Add on Home. Type it, say it or snap a photo, the way you'd tell a person: \"call the dentist Tuesday at 2\", \"idea: paint the hallway\", \"Mom's birthday is March 3\". ADHDone works out whether it's a task, an event, a birthday or an idea.",
        },
        ...(hasAlarms ? [
        {
          icon: AlarmClock,
          title: "Alarm or notification?",
          description: "A notification sits in your tray until you look. An alarm rings full screen, even on silent, until you deal with it. You picked one during setup; each task also has its own switch on its card.",
          link: { label: "Change the default in Settings", to: "/settings?section=reminders#alarms" },
        },
        ] : []),
        {
          icon: HelpCircle,
          title: "Finding this guide again",
          description: "Tap the menu button in the top left, then App Guide.",
        },
      ],
    },
    {
      icon: LayoutDashboard,
      title: "Home",
      description: "Today's tasks, a daily tip, and shortcuts to what you use most (Add a shortcut sits under Add and Timer)."
    },
    {
      icon: ListTodo,
      title: "Tasks",
      description: "Everything you've added. Push a due date, break a task into steps, or put it on the Back Burner when it's not today's problem.",
      // Its own dropdowns, under Tasks rather than beside it (Anna, Oct 24
      // 2026: "Put adding tasks is easy and task timer under tasks dropdown").
      children: [
    {
      icon: Plus,
      title: "Adding tasks is easy",
      // Each way is its own dropdown (Anna, Oct 27 2026: "make each task adding
      // method a dropdown too"), so one video shows at a time.
      children: [
        {
          icon: Mic,
          title: "Say it",
          description: "Tap the mic and say your task or idea. Wishes for the app count too."
        },
        // The rest only where this phone app has them (phonePlatform.js): the
        // iPhone app doesn't offer what it can't do (Anna, Oct 22 2026).
        ...(onThisPhone('shareToApp') ? [
        {
          icon: ADD_PATH_ICONS.text,
          title: "Share selected text",
          description: "Highlight text in any app. Tap Share and pick ADHDone.",
          video: ADD_PATH_VIDEOS.text,
        },
        {
          icon: ADD_PATH_ICONS.screenshot,
          title: "Share a screenshot",
          description: "Screenshot an invite, a flyer or a receipt and share it to ADHDone. It reads the picture and makes the task.",
          video: ADD_PATH_VIDEOS.screenshot,
        },
        ] : []),
        ...(onThisPhone('homeWidget') ? [
        {
          icon: ADD_PATH_ICONS.widget,
          title: "The home-screen widget",
          description: "Tap + to add tasks.",
          video: ADD_PATH_VIDEOS.widget,
        },
        ] : []),
        ...(onThisPhone('pinnedCapture') ? [
        {
          icon: ADD_PATH_ICONS.pinned,
          title: "The pinned notification",
          description: "Pull down your notification tray and tap the ADHDone notification to add a task.",
          link: { label: "Turn it on in Settings", to: "/settings#quick-capture" },
        },
        ] : []),
      ]
    },
    {
      icon: Timer,
      title: "Task Timer",
      description: "Time tasks to learn how long things really take you. Good for time blindness."
    },
    // Focus Mode is started from a task, so it sits with Tasks, not in Tools.
    {
      icon: Target,
      title: "Focus Mode",
      description: "Pick one task. ADHDone reminds you of it every hour until it's done and keeps your other nudges quiet. Events, due dates and birthdays still come through."
    },
      ],
    },
    {
      icon: CalendarDays,
      title: "Calendar",
      description: "Sync any calendar on your phone to add its tasks and events here."
    },
    {
      icon: Cake,
      title: "Birthdays",
      description: "Their own page, repeating every year. Reminders a week out, the day before and the day of, plus help writing the text."
    },
    // The same groups as the side menu (Tools, Reflect), so the guide reads
    // the way the app is laid out (Anna, Oct 24 2026). The entries for Record
    // Notes, Decision Maker, Places and Diary use each page's own words.
    {
      icon: Wrench,
      title: "Tools",
      children: [
    {
      icon: Timer,
      title: "Focus Timer",
      description: "Pomodoro: work-and-break rounds with lengths you pick. Or a plain stopwatch."
    },
    {
      icon: Lightbulb,
      title: "Parking Lot",
      description: "Ideas for later. Add one anywhere you can add a task; just say it's an idea."
    },
    ...(hasRecorder ? [
    {
      icon: Mic,
      title: "Record Notes",
      description: "Record a meeting, appointment or class. ADHDone writes short, clear notes: to-dos first, then the details you'll need."
    },
    ] : []),
    {
      icon: Shuffle,
      title: "Decision Maker",
      description: "Too many options? Type or say them and let the app pick one for you."
    },
    {
      icon: MapPin,
      title: "Places",
      description: "Your home area and work address, so \"leave now\" comes with a real drive time."
    },
      ],
    },
    {
      icon: Sparkles,
      title: "Reflect",
      children: [
    {
      icon: MessageCircleHeart,
      title: "Talk It Out",
      description: "A judgment-free space for ADHD and executive-function strategy. App questions go here too."
    },
    {
      icon: TrendingUp,
      title: "Insights",
      description: "Your patterns and streaks, and proof of how far you've come."
    },
    {
      icon: BookLock,
      title: "Diary",
      description: "Yours alone: no AI reads it, nobody else sees it. A new entry can start with the tasks you finished that day."
    },
      ],
    },
    {
      icon: SettingsIcon,
      title: "Settings",
      children: [
    {
      icon: Sparkles,
      title: "Themes",
      description: "Light, dark, colorful or Spicy Brains. Seasonal themes unlock when you find a special something. Keep an eye out 👀"
    },
    {
      icon: Moon,
      title: "Quiet Hours",
      description: "Set the hours you don't want to be bothered.",
      link: { label: "Set them in Settings", to: "/settings?section=reminders#quiet-hours" },
    },
      ],
    }
  ];

  const linkClass = `mt-1 inline-block text-sm font-medium underline underline-offset-2 ${
    theme === 'dark' ? 'text-green-400' : 'text-purple-600'
  }`;

  // One section: a header row that toggles it, and when open its text, link,
  // sub-items and any nested sections (`children`, drawn the same way one
  // step in, each with its own toggle and closed to start). `path` keys the
  // open state, so two sections with the same title in different places
  // can't open together.
  const renderSection = (guide, path, depth) => {
    const key = `${path}/${guide.title}`;
    const open = !!openSections[key];
    return (
      <div key={key}>
        {/* The whole header row is the toggle. The icon sits beside the
            title only; everything under it runs the row's full width
            (Anna, Oct 13 2026: the text was squished to the right). */}
        <button
          type="button"
          onClick={() => toggleSection(key)}
          aria-expanded={open}
          className="w-full flex items-center gap-3 text-left py-2 px-1 rounded-lg active:bg-black/5 dark:active:bg-white/5"
        >
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${
            theme === 'minimalist' 
              ? 'bg-green-100' 
              : theme === 'dark'
                ? 'bg-green-900/30'
                : 'bg-gradient-to-br from-purple-100 to-orange-100'
          }`}>
            <guide.icon className={`w-4 h-4 ${
              theme === 'minimalist' 
                ? 'text-green-600' 
                : theme === 'dark'
                  ? 'text-green-400'
                  : 'text-purple-600'
            }`} />
          </div>
          <h3 className={`${depth > 0 ? 'font-medium' : 'font-semibold'} text-sm flex-1 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            {guide.title}
          </h3>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`} />
        </button>
        {open && (<div className="px-1 pb-3">
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
        {guide.video && (
          <AutoClip src={guide.video} className="mt-2 w-full max-h-[50vh] rounded-lg bg-black object-contain" />
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

        {guide.children && (
          <div className={`mt-2 ml-4 pl-2 border-l-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            {guide.children.map((child) => renderSection(child, key, depth + 1))}
          </div>
        )}
        </div>)}
      </div>
    );
  };

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

        {/* A table of contents, not a stack of cards: rows are kept short so
            all of them fit on one phone screen with nothing open. */}
        <div className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
          {guides.map((guide) => renderSection(guide, '', 0))}
        </div>
      </DialogContent>
    </Dialog>
  );
}