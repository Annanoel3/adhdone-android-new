import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Plus, Timer, LayoutGrid, Check } from "lucide-react";
import LaunchPicker from "../launch/LaunchPicker";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { usePluginPresent } from "@/components/shared/WidgetTaskSync";
import { HOME_SHORTCUTS, HOME_TILES_EVENT, readHomeTiles, saveHomeTiles } from "./homeShortcuts";

export default function QuickActions({ theme, user }) {
  const navigate = useNavigate();
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  
  const [rotatingText, setRotatingText] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const rotatingOptions = ["Task", "Idea"];

  // The person's own shortcut tiles (homeShortcuts.js).
  const [tiles, setTiles] = useState(() => readHomeTiles(user));
  const [picking, setPicking] = useState(false);
  const canRecordNotes = usePluginPresent('RecorderBridge');

  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingText((prev) => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // The account's copy arrives after the first paint; another copy of this
  // component (or another tab) may change the list.
  useEffect(() => { setTiles(readHomeTiles(user)); }, [user?.home_tiles]);
  useEffect(() => {
    const onChange = (e) => setTiles(Array.isArray(e.detail) ? e.detail : readHomeTiles(user));
    window.addEventListener(HOME_TILES_EVENT, onChange);
    return () => window.removeEventListener(HOME_TILES_EVENT, onChange);
  }, [user]);

  const toggleTile = (key) => {
    const next = tiles.includes(key) ? tiles.filter((k) => k !== key) : [...tiles, key];
    setTiles(saveHomeTiles(next));
  };

  const offered = HOME_SHORTCUTS.filter((s) => !s.needsRecorder || canRecordNotes);
  const chosen = tiles
    .map((key) => offered.find((s) => s.key === key))
    .filter(Boolean);

  const tileColor = theme === 'minimalist'
    ? 'bg-green-100 text-green-700'
    : 'bg-gradient-to-br from-purple-100 to-orange-100 text-purple-700';

  const actions = [
    {
      key: 'add',
      icon: Plus,
      label: "Add",
      rotatingLabel: true,
      tour: 'add-task',
      onClick: () => navigate(createPageUrl("AddTask")),
      color: tileColor
    },
    {
      key: 'timer',
      icon: Timer,
      label: "Timer",
      tour: 'timer',
      onClick: () => setShowTimer(true),
      color: theme === 'minimalist' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700'
    },
    ...chosen.map((s) => ({
      key: s.key,
      icon: s.icon,
      label: s.title,
      onClick: () => navigate(createPageUrl(s.page)),
      color: tileColor,
    })),
  ];

  const dark = theme === 'dark';
  const dialogClass = dark
    ? "bg-gray-900 text-white border-gray-700"
    : theme === "spicybrains"
      ? "bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400"
      : "bg-white text-gray-900 border-gray-200";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => (
        <Card
          key={action.key}
          data-tour={action.tour}
          className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} cursor-pointer border-none shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 ${
            specialMode === 'normal' ? (
              theme === 'dark' ? 'bg-gray-800' : 'bg-white/80 backdrop-blur-sm'
            ) : ''
          }`}
          onClick={() => action.onClick()}
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

      {/* Pick more tiles. A quiet text link, not a tile: the tiles are the
          person's, this is the door to them. */}
      <div className="flex justify-end mt-1.5">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
            specialMode !== 'normal' ? '' : dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          {chosen.length ? 'Edit shortcuts' : 'Add a shortcut'}
        </button>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className={`max-w-md ${dialogClass}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-purple-500" /> Home shortcuts
            </DialogTitle>
            <DialogDescription>
              Tap what you use most. It gets a tile under Add and Timer.
            </DialogDescription>
          </DialogHeader>
          <div className="py-1 max-h-[60vh] overflow-y-auto grid grid-cols-2 gap-2">
            {offered.map((s) => {
              const on = tiles.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleTile(s.key)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
                    on
                      ? dark ? 'border-purple-500 bg-purple-900/40 text-white' : 'border-purple-400 bg-purple-50 text-purple-900'
                      : dark ? 'border-gray-700 bg-gray-800 text-gray-200' : 'border-gray-200 bg-gray-50 text-gray-800'
                  }`}
                >
                  <s.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 leading-tight">{s.title}</span>
                  {on && <Check className="w-4 h-4 flex-shrink-0 text-purple-500" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <LaunchPicker open={showTimer} onOpenChange={setShowTimer} theme={theme} />
    </div>
  );
}
