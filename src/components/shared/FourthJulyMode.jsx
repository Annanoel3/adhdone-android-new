import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DarkSeasonGlass } from './HalloweenMode';

export default function FourthJulyMode() {
  const [fireworks, setFireworks] = useState([]);

  useEffect(() => {
    const fireworkInterval = setInterval(() => {
      const newFirework = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        y: 100 + Math.random() * 200,
        emoji: ['🎆', '✨', '⭐', '💫'][Math.floor(Math.random() * 4)]
      };
      setFireworks(prev => [...prev.slice(-1), newFirework]);
    }, 6000);

    return () => {
      clearInterval(fireworkInterval);
    };
  }, []);

  return (
    <>
      {/* A night-time wallpaper: the same dark glass as Halloween, in this
          season's colours, instead of the old white cards (Anna, Oct 3 2026:
          "in all dark seasonal modes the cards should be darker than the
          background, not lighter"). */}
      <DarkSeasonGlass palette={{ mode: 'fourthjuly', text: '#f4f6ff', muted: 'rgba(244, 246, 255, 0.72)', title: '#ffb3b3', base: '8, 12, 30' }} />

      <AnimatePresence>
        {fireworks.map(fw => (
          <motion.div
            key={fw.id}
            initial={{ scale: 0, x: fw.x, y: fw.y, opacity: 0 }}
            animate={{ 
              scale: [0, 2, 1.5, 0],
              opacity: [0, 1, 0.8, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            style={{
              position: 'fixed',
              fontSize: '40px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {fw.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}