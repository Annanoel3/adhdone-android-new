import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HarvestMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🌾', '🍁', '🍂', '🌰'][Math.floor(Math.random() * 4)]
      };
      setItems(prev => [...prev.slice(-1), newItem]);
    }, 2600);

    return () => {
      clearInterval(itemInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .harvest-card {
          background: rgba(255, 251, 240, 0.95) !important;
          border: 2px solid #B7791F !important;
          box-shadow: 0 4px 20px rgba(146, 64, 14, 0.25) !important;
        }

        .harvest-card * {
          color: #6B3410 !important;
        }

        .harvest-card h1,
        .harvest-card h2,
        .harvest-card h3,
        .harvest-card h4 {
          color: #9A3412 !important;
        }
      `}</style>

      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 0.8, scale: 0.8 }}
            animate={{
              y: window.innerHeight + 20,
              x: item.x + (Math.random() - 0.5) * 90,
              opacity: [0.8, 1, 0.8, 0],
              scale: [0.8, 1.15, 1, 0.8],
              rotate: [0, 160, 320]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 3 + 5, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: '26px',
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