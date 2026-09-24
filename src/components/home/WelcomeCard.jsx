import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import FocusModeButton from "./FocusModeButton";
import QuickToolButtons from "./QuickToolButtons";

// What flies out of the sparkle button when it's tapped. Stars for the Light,
// Colorful and Spicy Brains themes; black and purple stars for Dark; and each
// seasonal skin gets its own (these are all the seasonal skins in the app —
// see SPECIAL_MODE_LABELS in Layout.jsx; a new one needs an entry here).
const STAR_EMOJIS = ['⭐', '🌟', '✨', '💫'];
const SEASONAL_BURST = {
  kawaii: ['💖', '🌸', '🎀', '✨'],
  halloween: ['🎃', '👻', '🦇', '🕸️'],
  fall: ['🍂', '🍁', '🍄', '🌰'],
  harvest: ['🦃', '🌽', '🥧', '🍂'],
  winter: ['❄️', '⛄', '🧣', '❄️'],
  christmas: ['🎄', '🎁', '⭐', '🎅'],
  valentines: ['💗', '💘', '💕', '🌹'],
  newyears: ['🎉', '🥂', '🎆', '✨'],
  stpatricks: ['☘️', '🍀', '🌈', '🪙'],
  fourthjuly: ['🎆', '🇺🇸', '🎇', '⭐'],
  summer: ['☀️', '🌊', '🍉', '🌴'],
  spring: ['🌸', '🌷', '🦋', '🌼'],
};

function burstPieces(burstId, theme, specialMode) {
  const count = 14;
  const seasonal = specialMode !== 'normal' ? SEASONAL_BURST[specialMode] : null;
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 70 + Math.random() * 80;
    const piece = {
      id: `${burstId}-${i}`,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 25,
      rot: (Math.random() - 0.5) * 300,
      size: 16 + Math.random() * 14,
      delay: Math.random() * 0.08,
      char: '',
      color: undefined,
      glow: undefined,
    };
    if (seasonal) {
      piece.char = seasonal[i % seasonal.length];
    } else if (theme === 'dark') {
      // Mostly black, some purple. A faint purple edge keeps the black ones
      // visible against the dark page.
      piece.char = '★';
      if (i % 3 === 0) {
        piece.color = i % 2 ? '#a855f7' : '#7c3aed';
      } else {
        piece.color = '#0a0a0a';
        piece.glow = '0 0 3px rgba(168, 85, 247, 0.9)';
      }
    } else {
      piece.char = STAR_EMOJIS[i % STAR_EMOJIS.length];
    }
    pieces.push(piece);
  }
  return pieces;
}

export default function WelcomeCard({ userName, theme, user }) {
  const specialMode = localStorage.getItem('special_mode') || 'normal';

  // Tap the sparkle: a little burst flies out of it. Drawn over the whole
  // screen (not inside the card) so the card's edge doesn't cut it off.
  const sparkleRef = useRef(null);
  const [bursts, setBursts] = useState([]);
  const burst = () => {
    const r = sparkleRef.current?.getBoundingClientRect();
    if (!r) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, x: r.left + r.width / 2, y: r.top + r.height / 2, pieces: burstPieces(id, theme, specialMode) };
    setBursts((prev) => [...prev.slice(-3), entry]);
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 1500);
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card bg-transparent` : ''} border-none shadow-lg overflow-hidden ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-white to-green-50/30' 
          : theme === 'dark'
            ? 'bg-gradient-to-br from-gray-800 to-gray-850'
            : 'bg-gradient-to-br from-white to-purple-50'
      ) : ''
    }`}>
      <CardContent className="p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className={`text-sm mb-2 ${
              specialMode !== 'normal' ? `${specialMode}-text` : 
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {getTimeGreeting()}
            </p>
            <h1 className={`text-3xl font-bold mb-2 ${
              specialMode !== 'normal' ? `${specialMode}-title` :
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              Ready to get things done?
            </h1>
            <p className={
              specialMode !== 'normal' ? `${specialMode}-text` :
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }>
              Let's tackle today one step at a time
            </p>
          </div>
          <button
            type="button"
            ref={sparkleRef}
            onClick={burst}
            aria-label="Sparkle"
            className={`p-3 rounded-2xl transition-transform active:scale-90 ${
            specialMode !== 'normal' ? 'bg-transparent' :
            theme === 'minimalist' 
              ? 'bg-green-100' 
              : theme === 'dark'
                ? 'bg-green-900/30'
                : 'bg-gradient-to-br from-purple-100 to-orange-100'
          }`}>
            <Sparkles className={`w-6 h-6 ${
              specialMode !== 'normal' ? '' :
              theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
            }`} />
          </button>
        </div>
        <div className="mt-5 -mx-2 flex flex-nowrap items-start justify-between">
          <FocusModeButton user={user} theme={theme} />
          <QuickToolButtons theme={theme} />
        </div>
      </CardContent>
      {bursts.length > 0 && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
          {bursts.map((b) => b.pieces.map((p) => (
            <motion.span
              key={p.id}
              className="absolute select-none leading-none"
              style={{
                left: b.x,
                top: b.y,
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
                fontSize: p.size,
                color: p.color,
                textShadow: p.glow,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
              animate={{
                x: [0, p.dx * 0.8, p.dx],
                y: [0, p.dy, p.dy + 45],
                opacity: [1, 1, 0],
                scale: [0.4, 1.1, 0.9],
                rotate: p.rot,
              }}
              transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
            >
              {p.char}
            </motion.span>
          )))}
        </div>,
        document.body
      )}
    </Card>
  );
}