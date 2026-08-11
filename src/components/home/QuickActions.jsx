import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Plus, Rocket, Phone } from "lucide-react";
import LaunchPicker from "../launch/LaunchPicker";
import ScheduledTextDialog from "../scheduledtexts/ScheduledTextDialog";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function QuickActions({ theme, user }) {
  const navigate = useNavigate();
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  
  const [rotatingText, setRotatingText] = useState(0);
  const [showLaunch, setShowLaunch] = useState(false);
  const [showScheduleText, setShowScheduleText] = useState(false);
  const rotatingOptions = ["Task", "Idea"];

  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingText((prev) => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const actions = [
    {
      icon: Plus,
      label: "Add",
      rotatingLabel: true,
      onClick: () => navigate(createPageUrl("AddTask")),
      color: theme === 'minimalist' ? 'bg-green-100 text-green-700' : 'bg-gradient-to-br from-purple-100 to-orange-100 text-purple-700'
    },
    {
      icon: Rocket,
      label: "Launch",
      onClick: () => setShowLaunch(true),
      color: theme === 'minimalist' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700'
    },
    {
      icon: Phone,
      label: "Text",
      onClick: () => setShowScheduleText(true),
      color: theme === 'minimalist' ? 'bg-blue-100 text-blue-700' : 'bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-700'
    }
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
      {actions.map((action) => (
        <Card
          key={action.label}
          className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} cursor-pointer border-none shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 ${
            specialMode === 'normal' ? (
              theme === 'dark' ? 'bg-gray-800' : 'bg-white/80 backdrop-blur-sm'
            ) : ''
          }`}
          onClick={() => action.onClick ? action.onClick() : navigate(action.href)}
        >
          <div className="p-4 md:p-6 flex flex-col items-center text-center gap-3">
            <div className={`p-3 md:p-4 rounded-2xl ${specialMode === 'normal' ? action.color : ''}`}>
              <action.icon className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div className={`font-medium text-sm md:text-base ${specialMode === 'normal' ? (theme === 'dark' ? 'text-white' : 'text-gray-900') : ''}`}>
              {action.rotatingLabel ? (
                <div className="flex items-center justify-center gap-1">
                  <span>{action.label}</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={rotatingText}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="inline-block"
                    >
                      {rotatingOptions[rotatingText]}
                    </motion.span>
                  </AnimatePresence>
                </div>
              ) : (
                action.label
              )}
            </div>
          </div>
        </Card>
      ))}
      </div>
      <LaunchPicker open={showLaunch} onOpenChange={setShowLaunch} theme={theme} />
      <ScheduledTextDialog
        isOpen={showScheduleText}
        onClose={() => setShowScheduleText(false)}
        onSaved={() => {
          setShowScheduleText(false);
          window.dispatchEvent(new Event("scheduled-texts-changed"));
        }}
        user={user}
        theme={theme}
      />
    </div>
  );
}