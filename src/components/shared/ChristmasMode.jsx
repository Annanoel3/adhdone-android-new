import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DarkSeasonGlass } from './HalloweenMode';

export default function ChristmasMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🎄', '🎅', '🎁', '⛄', '🔔', '🦌', '🍪'][Math.floor(Math.random() * 7)]
      };
      setItems(prev => [...prev.slice(-1), newItem]);
    }, 4000);

    return () => {
      clearInterval(itemInterval);
    };
  }, []);

  return (
    <>
      {/* A night-time wallpaper: the same dark glass as Halloween, in this
          season's colours, instead of the old white cards (Anna, Oct 3 2026:
          "in all dark seasonal modes the cards should be darker than the
          background, not lighter"). */}
      <DarkSeasonGlass palette={{ mode: 'christmas', text: '#f2f7f1', muted: 'rgba(242, 247, 241, 0.72)', title: '#ffa3a3', base: '8, 22, 14' }} />

      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 0.8, rotate: 0 }}
            animate={{ 
              y: window.innerHeight + 20, 
              x: item.x + (Math.random() - 0.5) * 100,
              rotate: 360,
              opacity: [0.8, 1, 0.8, 0]
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