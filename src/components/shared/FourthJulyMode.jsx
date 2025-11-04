import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FourthJulyMode() {
  const [fireworks, setFireworks] = useState([]);

  useEffect(() => {
    const fireworkInterval = setInterval(() => {
      const newFirework = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        y: 100 + Math.random() * 200,
        emoji: ['🎆', '✨', '⭐', '💫'][Math.floor(Math.random() * 4)]
      };
      setFireworks(prev => [...prev.slice(-1), newFirework]);
    }, 6000);

    return () => {
      clearInterval(fireworkInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .fourthjuly-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #B22234 !important;
          box-shadow: 0 4px 20px rgba(178, 34, 52, 0.3) !important;
        }
        
        .fourthjuly-card * {
          color: #003366 !important;
        }
        
        .fourthjuly-card h1,
        .fourthjuly-card h2,
        .fourthjuly-card h3,
        .fourthjuly-card h4 {
          color: #B22234 !important;
        }
      `}</style>

      <AnimatePresence>
        {fireworks.map(fw => (
          <motion.div
            key={fw.id}
            initial={{ scale: 0, x: fw.x, y: fw.y, opacity: 0 }}
            animate={{ 
              scale: [0, 2, 1.5, 0],
              opacity: [0, 1, 0.8, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            style={{
              position: 'fixed',
              fontSize: '40px',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {fw.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}