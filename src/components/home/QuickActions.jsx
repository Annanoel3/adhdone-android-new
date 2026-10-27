import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Plus, Timer, LayoutGrid, ChevronUp, ChevronDown, X, Columns2, Columns3, Columns4 } from "lucide-react";
import LaunchPicker from "../launch/LaunchPicker";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { usePluginPresent } from "@/components/shared/WidgetTaskSync";
import HomeSecretLink from "./HomeSecretLink";
import {
  HOME_SHORTCUTS, HOME_TILES_EVENT, readHomeTiles, saveHomeTiles,
  TILE_COLS, HOME_COLS_EVENT, readTileCols, saveTileCols,
} from "./homeShortcuts";

// Tiles per row (Anna, Oct 27 2026: "a tiny icon that allows a user to switch
// the shortcuts to rows of 2, 3, or 4"). Tailwind needs the whole class
// written out, so each count has its own set.
const COLS = {
  2: { grid: 'grid-cols-2', pad: 'p-4 md:p-6', box: 'p-3 md:p-4 rounded-2xl', icon: 'w-5 h-5 md:w-6 md:h-6', label: 'text-sm md:text-base', gap: 'gap-3', Icon: Columns2 },
  3: { grid: 'grid-cols-3', pad: 'p-3', box: 'p-2.5 rounded-xl', icon: 'w-5 h-5', label: 'text-xs', gap: 'gap-2', Icon: Columns3 },
  4: { grid: 'grid-cols-4', pad: 'p-2', box: 'p-2 rounded-xl', icon: 'w-4 h-4', label: 'text-[11px]', gap: 'gap-1.5', Icon: Columns4 },
};

export default function QuickActions({ theme, user }) {
  const navigate = useNavigate();
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  
  const [rotatingText, setRotatingText] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const rotatingOptions = ["Task", "Idea"];

  // The person's own shortcut tiles (homeShortcuts.js).
  const [tiles, setTiles] = useState(() => readHomeTiles(user));
  const [cols, setCols] = useState(() => readTileCols(user));
  const [picking, setPicking] = useState(false);
  const canRecordNotes = usePluginPresent('RecorderBridge');
  const L = COLS[cols] || COLS[2];
  const nextCols = () => setCols(saveTileCols(TILE_COLS[(TILE_COLS.indexOf(cols) + 1) % TILE_COLS.length]));

  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingText((prev) => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // The account's copy arrives after the first paint; another copy of this
  // component (or another tab) may change the list.
  useEffect(() => { setTiles(readHomeTiles(user)); setCols(readTileCols(user)); }, [user?.home_tiles, user?.home_tile_cols]);
  useEffect(() => {
    const onChange = (e) => setTiles(Array.isArray(e.detail) ? e.detail : readHomeTiles(user));
    const onCols = () => setCols(readTileCols(user));
    window.addEventListener(HOME_TILES_EVENT, onChange);
    window.addEventListener(HOME_COLS_EVENT, onCols);
    return () => {
      window.removeEventListener(HOME_TILES_EVENT, onChange);
      window.removeEventListener(HOME_COLS_EVENT, onCols);
    };
  }, [user]);

  const addTile = (key) => { if (!tiles.includes(key)) setTiles(saveHomeTiles([...tiles, key])); };
  const removeTile = (key) => setTiles(saveHomeTiles(tiles.filter((k) => k !== key)));
  // Reorder with arrows (Anna, Oct 27 2026: "let users reorder them around").
  // Arrows rather than drag: they work the same on every phone and never
  // fight the dialog's scroll.
  const moveTile = (key, dir) => {
    // Move within the tiles this phone shows; a saved key this phone can't
    // show (Record Notes without the recorder) keeps its place at the end.
    const shown = tiles.filter((k) => offered.some((s) => s.key === k));
    const hidden = tiles.filter((k) => !offered.some((s) => s.key === k));
    const i = shown.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return;
    [shown[i], shown[j]] = [shown[j], shown[i]];
    setTiles(saveHomeTiles([...shown, ...hidden]));
  };

  const offered = HOME_SHORTCUTS.filter((s) => !s.needsRecorder || canRecordNotes);
  const chosen = tiles
    .map((key) => offered.find((s) => s.key === key))
    .filter(Boolean);

  const tileColor = theme === 'minimalist'
    ? 'bg-green-100 text-green-700'
    : 'bg-gradient-to-br from-purple-100 to-orange-100 text-purple-700';

  // Add is always first; everything after it is the person's list (Timer
  // included, on by default).
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
    ...chosen.map((s) => s.key === 'timer'
      ? {
        key: 'timer',
        icon: Timer,
        label: "Timer",
        tour: 'timer',
        onClick: () => setShowTimer(true),
        color: theme === 'minimalist' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700'
      }
      : {
        key: s.key,
        icon: s.icon,
        label: s.title,
        // A page opens; an event (Focus Mode) asks its prompt to open.
        onClick: () => (s.event ? window.dispatchEvent(new CustomEvent(s.event)) : navigate(createPageUrl(s.page))),
        color: s.key === 'focus'
          ? (theme === 'minimalist' ? 'bg-green-100 text-green-700' : 'bg-gradient-to-br from-green-100 to-emerald-100 text-green-700')
          : tileColor,
      }),
  ];

  const dark = theme === 'dark';
  const dialogClass = dark
    ? "bg-gray-900 text-white border-gray-700"
    : theme === "spicybrains"
      ? "bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400"
      : "bg-white text-gray-900 border-gray-200";

  return (
    <div>
      <div className={`grid ${L.grid} ${L.gap}`}>
      {actions.map((action) => (
        <Card
          key={action.key}
          data-tour={action.tour}
          className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} ${actions.length === 1 ? 'col-span-full' : ''} cursor-pointer border-none shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 ${
            specialMode === 'normal' ? (
              theme === 'dark' ? 'bg-gray-800' : 'bg-white/80 backdrop-blur-sm'
            ) : ''
          }`}
          onClick={() => action.onClick()}
        >
          <div className={`${L.pad} flex flex-col items-center text-center ${cols === 2 ? 'gap-3' : 'gap-1.5'}`}>
            <div className={`${L.box} ${specialMode === 'normal' ? action.color : ''}`}>
              <action.icon className={L.icon} />
            </div>
            <div className={`font-medium leading-tight ${L.label} ${specialMode === 'normal' ? (theme === 'dark' ? 'text-white' : 'text-gray-900') : ''}`}>
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
          person's, this is the door to them. Beside it, the tiny per-row
          switch: tap to go 2 → 3 → 4 → 2. */}
      <div className="flex justify-end items-center gap-1 mt-1.5">
        <HomeSecretLink theme={theme} spot="tiles" className="mr-auto pl-1" />
        <button
          type="button"
          onClick={nextCols}
          aria-label={`Tiles per row: ${cols}. Tap to change`}
          title={`${cols} per row`}
          className={`flex items-center gap-0.5 text-xs px-2 py-1 rounded-md ${
            specialMode !== 'normal' ? '' : dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <L.Icon className="w-3.5 h-3.5" />
          <span className="tabular-nums">{cols}</span>
        </button>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
            specialMode !== 'normal' ? '' : dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          {chosen.some((s) => s.key !== 'timer') ? 'Edit shortcuts' : 'Add a shortcut'}
        </button>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className={`max-w-md ${dialogClass}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-purple-500" /> Home shortcuts
            </DialogTitle>
            <DialogDescription>
              Tiles sit next to Add in this order. Arrows move one; × takes it off.
            </DialogDescription>
          </DialogHeader>
          <div className="py-1 max-h-[60vh] overflow-y-auto space-y-3">
            {chosen.length > 0 && (
              <div className={`rounded-lg border divide-y ${dark ? 'border-gray-700 divide-gray-700' : 'border-gray-200 divide-gray-200'}`}>
                {chosen.map((s, i) => (
                  <div key={s.key} className={`flex items-center gap-2 px-2 py-1.5 text-sm ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <s.icon className="w-4 h-4 flex-shrink-0 text-purple-500" />
                    <span className="flex-1 leading-tight">{s.title}</span>
                    <button type="button" onClick={() => moveTile(s.key, -1)} disabled={i === 0} aria-label={`Move ${s.title} up`}
                      className={`p-1.5 rounded-md disabled:opacity-25 ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => moveTile(s.key, 1)} disabled={i === chosen.length - 1} aria-label={`Move ${s.title} down`}
                      className={`p-1.5 rounded-md disabled:opacity-25 ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => removeTile(s.key)} aria-label={`Remove ${s.title}`}
                      className={`p-1.5 rounded-md ${dark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {offered.some((s) => !tiles.includes(s.key)) && (
              <div>
                <p className={`text-xs font-medium mb-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Add a tile</p>
                <div className="grid grid-cols-2 gap-2">
                  {offered.filter((s) => !tiles.includes(s.key)).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => addTile(s.key)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
                        dark ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                      <s.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 leading-tight">{s.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LaunchPicker open={showTimer} onOpenChange={setShowTimer} theme={theme} />
    </div>
  );
}
