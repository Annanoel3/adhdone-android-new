import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Frosted BLACK cards (Anna, Oct 1 2026). The Halloween wallpaper is a night
// scene, so its cards are dark glass with light text — not the white glass the
// other seasons use (the Layout's shared white rule leaves halloween out).
// The cards' insides were written for white: dark text, pale chips and inputs.
// The rules below turn those over wholesale, so every page that uses the
// seasonal card class reads right without touching each one.
const TEXT = '#f3ecff';
const TITLE = '#ffb15c';
const GLASS = 'rgba(14, 9, 26, 0.66)';
const CHROME = 'rgba(14, 9, 26, 0.78)';
const LINE = 'rgba(255, 255, 255, 0.14)';
const RAISED = 'rgba(255, 255, 255, 0.09)';

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
const sel = (scope, list, fn) => list.map((x) => `${scope} ${fn(x)}`).join(',\n');

const HALLOWEEN_CSS = `
  .halloween-card {
    background: ${GLASS} !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid ${LINE} !important;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35) !important;
    color: ${TEXT} !important;
  }
  .halloween-card * { color: ${TEXT} !important; }
  .halloween-card h1, .halloween-card h2, .halloween-card h3, .halloween-card h4,
  .halloween-title { color: ${TITLE} !important; }
  .halloween-text { color: ${TEXT} !important; }
  ${TINTS.map(([names, colour]) => names.map((n) => `.halloween-card [class*="text-${n}-"]`).join(', ') + ` { color: ${colour} !important; }`).join('\n')}
  /* Pale surfaces inside a card (chips, rows, inputs, outline buttons) */
  ${sel('.halloween-card', PALE_BG, (c) => `[class~="bg-${c}"]`)},
  .halloween-card [class*="bg-white/"] { background-color: ${RAISED} !important; }
  ${sel('.halloween-card', PALE_BG, (c) => `[class~="from-${c}"]`)} { background-image: none !important; background-color: ${RAISED} !important; }
  .halloween-card [class*="border-gray-"], .halloween-card [class*="border-stone-"], .halloween-card [class*="border-slate-"],
  .halloween-card [class*="border-purple-1"], .halloween-card [class*="border-purple-2"], .halloween-card [class*="border-pink-"],
  .halloween-card [class*="border-orange-"], .halloween-card [class*="border-green-"], .halloween-card [class*="border-blue-"],
  .halloween-card [class*="border-white/"], .halloween-card [class~="border-input"], .halloween-card [class~="border-border"] { border-color: ${LINE} !important; }
  .halloween-card [class*="divide-gray-"] > * + * { border-color: ${LINE} !important; }
  .halloween-card input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  .halloween-card textarea, .halloween-card select, .halloween-card [role="combobox"] {
    background-color: ${RAISED} !important; color: #fff !important; border-color: rgba(255, 255, 255, 0.2) !important;
  }
  .halloween-card ::placeholder { color: rgba(243, 236, 255, 0.5) !important; }
  .halloween-card option { color: #111 !important; background: #fff !important; }
  /* The top bar and the side menu: the same dark glass */
  .halloween-chrome, [data-sidebar="sidebar"] { background: ${CHROME} !important; border-color: ${LINE} !important; }
  .halloween-chrome *, [data-sidebar="sidebar"] * { color: ${TEXT} !important; }
  .halloween-chrome [class*="bg-white/"], [data-sidebar="sidebar"] [class*="bg-white/"] { background-color: ${RAISED} !important; }
  .halloween-chrome [class*="border-white/"], [data-sidebar="sidebar"] [class*="border-white/"] { border-color: ${LINE} !important; }
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