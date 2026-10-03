import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DarkSeasonGlass } from './HalloweenMode';

export default function NewYearsMode() {
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    const confettiInterval = setInterval(() => {
      const colors = ['#FFD700', '#FF6347', '#4169E1', '#32CD32', '#FF69B4', '#FFA500'];
      const newConfetti = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🎉', '🎊', '✨', '🥳', '🍾', '⭐'][Math.floor(Math.random() * 6)],
        color: colors[Math.floor(Math.random() * colors.length)]
      };
      setConfetti(prev => [...prev.slice(-1), newConfetti]);
    }, 3200);

    return () => {
      clearInterval(confettiInterval);
    };
  }, []);

  return (
    <>
      {/* A night-time wallpaper: the same dark glass as Halloween, in this
          season's colours, instead of the old white cards (Anna, Oct 3 2026:
          "in all dark seasonal modes the cards should be darker than the
          background, not lighter"). */}
      <DarkSeasonGlass palette={{ mode: 'newyears', text: '#f5f3ff', muted: 'rgba(245, 243, 255, 0.72)', title: '#ffd700', base: '10, 10, 22' }} />

      <AnimatePresence>
        {confetti.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 1, rotate: 0 }}
            animate={{ 
              y: window.innerHeight + 20,
              x: item.x + (Math.random() - 0.5) * 200,
              rotate: 720,
              opacity: [1, 1, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 2 + 3, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
              pointerEvents: 'none',
              zIndex: 9999,
              color: item.color
            }}
          >
            {item.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}