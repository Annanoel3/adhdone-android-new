import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NewYearsMode() {
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    const confettiInterval = setInterval(() => {
      const colors = ['#FFD700', '#FF6347', '#4169E1', '#32CD32', '#FF69B4', '#FFA500'];
      const newConfetti = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        emoji: ['🎉', '🎊', '✨', '🥳', '🍾', '⭐'][Math.floor(Math.random() * 6)],
        color: colors[Math.floor(Math.random() * colors.length)]
      };
      setConfetti(prev => [...prev.slice(-1), newConfetti]);
    }, 3200);

    return () => {
      clearInterval(confettiInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .newyears-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #FFD700 !important;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3) !important;
        }
        
        .newyears-card * {
          color: #003366 !important;
        }
        
        .newyears-card h1 {
          color: #FFD700 !important;
        }
        
        .newyears-card h2 {
          color: #FF6347 !important;
        }
        
        .newyears-card h3 {
          color: #4169E1 !important;
        }
        
        .newyears-card h4 {
          color: #32CD32 !important;
        }

        .newyears-title {
          color: #FFD700 !important;
        }

        .newyears-text {
          color: #003366 !important;
        }
      `}</style>

      <AnimatePresence>
        {confetti.map(item => (
          <motion.div
            key={item.id}
            initial={{ y: -20, x: item.x, opacity: 1, rotate: 0 }}
            animate={{ 
              y: window.innerHeight + 20,
              x: item.x + (Math.random() - 0.5) * 200,
              rotate: 720,
              opacity: [1, 1, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 2 + 3, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: '24px',
              pointerEvents: 'none',
              zIndex: 9999,
              color: item.color
            }}
          >
            {item.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}