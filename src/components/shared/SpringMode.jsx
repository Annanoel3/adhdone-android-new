import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SpringMode() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      const newItem = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🌸', '🌼', '🌷', '🦋', '🐝'][Math.floor(Math.random() * 5)]
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
        .spring-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #FFB6C1 !important;
          box-shadow: 0 4px 20px rgba(255, 182, 193, 0.3) !important;
        }
        
        .spring-card * {
          color: #2F4F2F !important;
        }
        
        .spring-card h1,
        .spring-card h2,
        .spring-card h3,
        .spring-card h4 {
          color: #FFB6C1 !important;
        }

        .spring-title {
          color: #FFB6C1 !important;
        }

        .spring-text {
          color: #2F4F2F !important;
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
              scale: [0, 1.2, 1, 0.8],
              rotate: [0, 180]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 3 + 5, ease: "easeInOut" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
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