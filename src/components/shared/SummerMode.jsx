import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SummerMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['☀️', '🏖️', '🍉', '🌴', '🐚'][Math.floor(Math.random() * 5)]
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
        .summer-card {
          background: rgba(255, 255, 255, 0.92) !important;
          border: 2px solid #FFD700 !important;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3) !important;
        }
        
        .summer-card * {
          color: #008B8B !important;
        }
        
        .summer-card h1,
        .summer-card h2,
        .summer-card h3,
        .summer-card h4 {
          color: #008B8B !important;
        }

        .summer-title {
          color: #008B8B !important;
        }

        .summer-text {
          color: #008B8B !important;
        }
      `}</style>

      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -50, x: item.x, opacity: 0, scale: 0, rotate: -45 }}
            animate={{ 
              y: window.innerHeight + 50, 
              opacity: [0, 1, 1, 0], 
              scale: [0, 1.2, 1, 0.8],
              rotate: 45
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 8, ease: "easeInOut" }}
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