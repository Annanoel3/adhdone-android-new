import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StPatricksMode() {
  const [clovers, setClovers] = useState([]);

  useEffect(() => {
    const cloverInterval = setInterval(() => {
      const newClover = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🍀', '☘️'][Math.floor(Math.random() * 2)]
      };
      setClovers(prev => [...prev.slice(-3), newClover]);
    }, 2800);

    return () => {
      clearInterval(cloverInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .stpatricks-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #2e7d2e !important;
          box-shadow: 0 4px 20px rgba(46, 125, 46, 0.3) !important;
        }
        
        .stpatricks-card * {
          color: #1a4d1a !important;
        }
        
        .stpatricks-card h1,
        .stpatricks-card h2,
        .stpatricks-card h3,
        .stpatricks-card h4 {
          color: #2e7d2e !important;
        }
      `}</style>

      <AnimatePresence>
        {clovers.map(clover => (
          <motion.div
            key={clover.id}
            initial={{ y: -20, x: clover.x, opacity: 0.8, rotate: 0 }}
            animate={{ 
              y: window.innerHeight + 20, 
              x: clover.x + (Math.random() - 0.5) * 100,
              rotate: 360,
              opacity: [0.8, 1, 0.8, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 3 + 4, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {clover.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}