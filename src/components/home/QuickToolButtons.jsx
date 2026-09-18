import React from 'react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Timer, Shuffle, Lightbulb } from "lucide-react";

// Small shortcuts that sit next to Focus Mode — same icons as the sidebar nav.
// The name sits under every icon permanently: no hold, no guessing, and it's
// how the icons become familiar in the first place.
const TOOLS = [
  { title: "Pomodoro", icon: Timer, url: createPageUrl("FocusTimer") },
  { title: "Decisions", icon: Shuffle, url: createPageUrl("DecisionMaker") },
  { title: "Parking Lot", icon: Lightbulb, url: createPageUrl("ParkingLot") },
];

export default function QuickToolButtons({ theme }) {
  return (
    <div className="flex items-start gap-3">
      {TOOLS.map((tool) => (
        <Link
          key={tool.title}
          to={tool.url}
          aria-label={tool.title}
          className="flex flex-col items-center gap-1 w-16 select-none"
        >
          <span
            className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${
              theme === 'dark'
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : theme === 'minimalist'
                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                  : 'border-purple-200 text-purple-700 hover:bg-purple-50'
            }`}
          >
            <tool.icon className="w-4 h-4" />
          </span>
          <span className={`text-[10px] leading-tight text-center ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {tool.title}
          </span>
        </Link>
      ))}
    </div>
  );
}