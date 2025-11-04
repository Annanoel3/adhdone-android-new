import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function KawaiiMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🌸', '✨', '💖', '🎀', '🦄', '🌈', '⭐'][Math.floor(Math.random() * 7)]
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
        .kawaii-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #FF69B4 !important;
          box-shadow: 0 4px 20px rgba(255, 105, 180, 0.3) !important;
        }
        
        .kawaii-card * {
          color: #FF1493 !important;
        }
        
        .kawaii-card h1,
        .kawaii-card h2,
        .kawaii-card h3,
        .kawaii-card h4 {
          color: #FF69B4 !important;
        }
      `}</style>

      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 0, scale: 0 }}
            animate={{ 
              y: window.innerHeight + 20,
              opacity: [0, 1, 1, 0],
              scale: [0, 1.3, 1, 0.7],
              rotate: [0, 360]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 2 + 4, ease: "easeInOut" }}
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