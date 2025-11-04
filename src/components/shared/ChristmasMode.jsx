import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
      <style>{`
        .christmas-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #c41e3a !important;
          box-shadow: 0 4px 20px rgba(196, 30, 58, 0.3) !important;
        }
        
        .christmas-card * {
          color: #1a472a !important;
        }
        
        .christmas-card h1,
        .christmas-card h2,
        .christmas-card h3,
        .christmas-card h4 {
          color: #c41e3a !important;
        }
      `}</style>

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