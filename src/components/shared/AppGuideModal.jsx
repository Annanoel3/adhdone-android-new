import React from 'react';
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
  Share2,
  MessageCircle,
  Users,
  Trophy
} from "lucide-react";

export default function AppGuideModal({ isOpen, onClose, theme }) {
  const guides = [
    {
      icon: LayoutDashboard,
      title: "Home",
      description: "Your command center. See today's tasks, quick actions, daily tips, and track your progress at a glance."
    },
    {
      icon: ListTodo,
      title: "Tasks",
      description: "Manage all your tasks with ADHD-friendly features like urgency levels, energy requirements, and smart reminders."
    },
    {
      icon: Timer,
      title: "Focus Timer",
      description: "Use Pomodoro-style work sessions to stay focused. Set work and break intervals that work for your brain."
    },
    {
      icon: TrendingUp,
      title: "Progress",
      description: "Visualize your productivity trends, streaks, and achievements. See how far you've come!"
    },
    {
      icon: MessageCircleHeart,
      title: "Support Space",
      description: "A judgment-free AI companion for when you need to talk, vent, or process your thoughts."
    },
    {
      icon: Lightbulb,
      title: "Parking Lot",
      description: "Capture ideas and thoughts without losing focus on your current task. Review and convert them to tasks later."
    },
    {
      icon: Share2,
      title: "Community",
      description: "Connect with others for accountability and support:",
      subItems: [
        {
          icon: Share2,
          title: "Accountability",
          description: "Find and manage accountability partners who keep you on track"
        },
        {
          icon: MessageCircle,
          title: "Chat",
          description: "Message your accountability partners directly"
        },
        {
          icon: Users,
          title: "Focus Rooms",
          description: "Join virtual co-working sessions with others to stay motivated"
        },
        {
          icon: Trophy,
          title: "Leaderboard",
          description: "See how you rank among other users (privacy settings available)"
        }
      ]
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