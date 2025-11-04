import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ValentinesMode() {
  const [hearts, setHearts] = useState([]);

  useEffect(() => {
    const heartInterval = setInterval(() => {
      const newHeart = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['💕', '💖', '💗', '💓', '💞', '💝', '❤️', '🩷'][Math.floor(Math.random() * 8)]
      };
      setHearts(prev => [...prev.slice(-2), newHeart]);
    }, 3200);

    return () => {
      clearInterval(heartInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .valentines-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #ff69b4 !important;
          box-shadow: 0 4px 20px rgba(255, 105, 180, 0.3) !important;
        }
        
        .valentines-card * {
          color: #8b0045 !important;
        }
        
        .valentines-card h1,
        .valentines-card h2,
        .valentines-card h3,
        .valentines-card h4 {
          color: #ff1493 !important;
        }
      `}</style>

      <AnimatePresence>
        {hearts.map(heart => (
          <motion.div
            key={heart.id}
            initial={{ y: window.innerHeight, x: heart.x, opacity: 0, scale: 0 }}
            animate={{ 
              y: -100, 
              opacity: [0, 1, 1, 0], 
              scale: [0, 1.2, 1, 0.8],
              rotate: [0, 360]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 6, ease: "easeOut" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {heart.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}