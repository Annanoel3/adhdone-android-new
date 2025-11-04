import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
      <style>{`
        .halloween-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #FF6600 !important;
          box-shadow: 0 4px 20px rgba(255, 102, 0, 0.3) !important;
        }
        
        .halloween-card * {
          color: #4B0082 !important;
        }
        
        .halloween-card h1,
        .halloween-card h2,
        .halloween-card h3,
        .halloween-card h4 {
          color: #FF6600 !important;
        }

        .halloween-title {
          color: #FF6600 !important;
        }

        .halloween-text {
          color: #4B0082 !important;
        }
      `}</style>

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