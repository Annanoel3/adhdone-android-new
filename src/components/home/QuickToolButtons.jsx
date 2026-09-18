import React, { useRef, useState } from 'react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Timer, Shuffle, Lightbulb } from "lucide-react";

// Small shortcuts that sit next to Focus Mode — same icons as the sidebar nav.
const TOOLS = [
  { title: "Pomodoro", icon: Timer, url: createPageUrl("FocusTimer") },
  { title: "Decision Maker", icon: Shuffle, url: createPageUrl("DecisionMaker") },
  { title: "Parking Lot", icon: Lightbulb, url: createPageUrl("ParkingLot") },
];

export default function QuickToolButtons({ theme }) {
  // Press-and-hold reveals the tool's name above the icon (mobile has no hover).
  const [heldTool, setHeldTool] = useState(null);
  const holdTimer = useRef(null);
  const heldRef = useRef(false);

  const startHold = (title) => {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setHeldTool(title);
    }, 400);
  };

  const endHold = () => {
    clearTimeout(holdTimer.current);
    setHeldTool(null);
  };

  return (
    <div className="flex items-center gap-2">
      {TOOLS.map((tool) => (
        <div key={tool.title} className="relative">
          {heldTool === tool.title && (
            <span className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap px-2 py-1 rounded-md text-xs shadow-lg pointer-events-none z-20 ${
              theme === 'dark' ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white'
            }`}>
              {tool.title}
            </span>
          )}
          <Link
            to={tool.url}
            aria-label={tool.title}
            onClick={(e) => { if (heldRef.current) e.preventDefault(); }}
            onTouchStart={() => startHold(tool.title)}
            onTouchEnd={endHold}
            onTouchCancel={endHold}
            onMouseDown={() => startHold(tool.title)}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors select-none ${
              theme === 'dark'
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : theme === 'minimalist'
                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                  : 'border-purple-200 text-purple-700 hover:bg-purple-50'
            }`}
          >
            <tool.icon className="w-4 h-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}