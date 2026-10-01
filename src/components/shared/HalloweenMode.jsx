import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Frosted BLACK everything (Anna, Oct 1 2026): "no dark text directly on the
// background, no white cards or containers." The Halloween wallpaper is a
// night scene; the other seasons keep their white glass. Scoped to the app
// shell (#adhdone-app-bg), which is where every page renders — dialogs, menus
// and toasts are portaled outside it and keep their own look. Inside the
// shell, anything written for white (dark text, pale chips, white panels,
// inputs) is turned over by class token, so every page reads right without
// touching each one.
const TEXT = '#f3ecff';
const MUTED = 'rgba(243, 236, 255, 0.72)';
const TITLE = '#ffb15c';
const GLASS = 'rgba(14, 9, 26, 0.66)';
const PANEL = 'rgba(14, 9, 26, 0.6)';
const CHROME = 'rgba(14, 9, 26, 0.78)';
const LINE = 'rgba(255, 255, 255, 0.14)';
const RAISED = 'rgba(255, 255, 255, 0.09)';
const S = '#adhdone-app-bg';

const PALE_COLORS = ['gray', 'stone', 'slate', 'zinc', 'neutral', 'purple', 'violet', 'indigo', 'fuchsia',
  'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue'];
const PALE_SHADES = ['50', '100', '200'];
const PALE_BG = ['white', 'background', 'card', 'muted', 'secondary', 'accent', 'popover',
  ...PALE_COLORS.flatMap((c) => PALE_SHADES.map((s) => `${c}-${s}`))];
// Colour words stay readable on dark glass by moving to their pale shade.
const TINTS = [
  [['red', 'rose'], '#fda4af'],
  [['pink', 'fuchsia'], '#f9a8d4'],
  [['orange', 'amber', 'yellow'], '#fdba74'],
  [['green', 'emerald', 'lime'], '#86efac'],
  [['teal', 'cyan', 'sky', 'blue'], '#93c5fd'],
  [['purple', 'violet', 'indigo'], '#d8b4fe'],
];
const DARK_TEXT = ['[class*="text-gray-"]', '[class*="text-stone-"]', '[class*="text-slate-"]', '[class*="text-zinc-"]',
  '[class*="text-neutral-"]', '[class~="text-black"]', '[class~="text-foreground"]', '[class~="text-muted-foreground"]',
  '[class~="text-card-foreground"]', '[class~="text-popover-foreground"]'];
const MUTED_TEXT = ['4', '5', '6'].flatMap((n) => ['gray', 'stone', 'slate', 'zinc', 'neutral'].map((c) => `[class*="text-${c}-${n}"]`))
  .concat(['[class~="text-muted-foreground"]']);
const CARDS = ['.halloween-card', '[class~="bg-card"]'];
const inShell = (sel) => `${S} ${sel}`;
const inCards = (sel) => CARDS.map((c) => `${S} ${c} ${sel}`).join(', ');
const list = (arr, fn) => arr.map(fn).join(',\n');

const HALLOWEEN_CSS = `
  ${S} { color: ${TEXT}; }
  /* Cards: dark glass */
  ${CARDS.map(inShell).join(', ')} {
    background: ${GLASS} !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid ${LINE} !important;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35) !important;
    color: ${TEXT} !important;
  }
  /* Text written for white: light. Muted greys stay a little softer. */
  ${list(DARK_TEXT, inShell)} { color: ${TEXT} !important; }
  ${list(MUTED_TEXT, inShell)} { color: ${MUTED} !important; }
  ${S} h1, ${S} h2, ${S} .halloween-title, ${inCards('h3')}, ${inCards('h4')} { color: ${TITLE} !important; }
  ${S} .halloween-text { color: ${TEXT} !important; }
  ${TINTS.map(([names, colour]) => names.map((n) => inShell(`[class*="text-${n}-"]`)).join(', ') + ` { color: ${colour} !important; }`).join('\n')}
  /* White and pale surfaces (panels, chips, rows, outline buttons): dark glass;
     inside a card a lighter translucent lift so they still read as raised. */
  ${list(PALE_BG, (c) => inShell(`[class~="bg-${c}"]`))},
  ${inShell('[class*="bg-white/"]')} { background-color: ${PANEL} !important; border-color: ${LINE} !important; }
  ${list(PALE_BG, (c) => inShell(`[class~="from-${c}"]`))} { background-image: none !important; background-color: ${PANEL} !important; }
  ${list(PALE_BG, (c) => inCards(`[class~="bg-${c}"]`))},
  ${inCards('[class*="bg-white/"]')} { background-color: ${RAISED} !important; }
  ${list(PALE_BG, (c) => inCards(`[class~="from-${c}"]`))} { background-image: none !important; background-color: ${RAISED} !important; }
  ${list(['[class*="border-gray-"]', '[class*="border-stone-"]', '[class*="border-slate-"]', '[class*="border-zinc-"]', '[class*="border-purple-1"]',
     '[class*="border-purple-2"]', '[class*="border-pink-"]', '[class*="border-orange-"]', '[class*="border-green-"]', '[class*="border-blue-"]',
     '[class*="border-white/"]', '[class~="border-input"]', '[class~="border-border"]'], inShell)} { border-color: ${LINE} !important; }
  ${inShell('[class*="divide-gray-"] > * + *')} { border-color: ${LINE} !important; }
  ${inShell('input:not([type="checkbox"]):not([type="radio"]):not([type="range"])')},
  ${inShell('textarea')}, ${inShell('select')}, ${inShell('[role="combobox"]')} {
    background-color: ${RAISED} !important; color: #fff !important; border-color: rgba(255, 255, 255, 0.2) !important;
  }
  ${inShell('[role="combobox"] *')} { color: ${TEXT} !important; }
  ${inShell('::placeholder')} { color: rgba(243, 236, 255, 0.5) !important; }
  ${inShell('option')} { color: #111 !important; background: #fff !important; }
  /* The top bar (in the shell) and the side menu (portaled on the phone) */
  ${S} .halloween-chrome { background: ${CHROME} !important; border-color: ${LINE} !important; }
  ${S} .halloween-chrome * { color: ${TEXT} !important; }
  [data-sidebar="sidebar"] { background: ${CHROME} !important; border-color: ${LINE} !important; }
  [data-sidebar="sidebar"] * { color: ${TEXT} !important; }
  [data-sidebar="sidebar"] [class*="bg-white/"] { background-color: ${RAISED} !important; }
  [data-sidebar="sidebar"] [class*="border-white/"] { border-color: ${LINE} !important; }
`;

export default function HalloweenMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🍂', '🍁'][Math.floor(Math.random() * 2)]
      };
      setItems(prev => [...prev.slice(-1), newItem]);
    }, 4800);

    return () => {
      clearInterval(itemInterval);
    };
  }, []);

  return (
    <>
      <style>{HALLOWEEN_CSS}</style>

      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 0.8, scale: 0.8 }}
            animate={{ 
              y: window.innerHeight + 20,
              x: item.x + (Math.random() - 0.5) * 100,
              opacity: [0.8, 1, 0.8, 0],
              scale: [0.8, 1.2, 1, 0.8],
              rotate: [0, 180, 360]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 3 + 5, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: '28px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {item.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}