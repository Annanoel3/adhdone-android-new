import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WinterMode() {
  const [snowflakes, setSnowflakes] = useState([]);

  useEffect(() => {
    const snowInterval = setInterval(() => {
      const newSnowflake = {
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        size: Math.random() * 20 + 10
      };
      setSnowflakes(prev => [...prev.slice(-1), newSnowflake]);
    }, 2000);

    return () => {
      clearInterval(snowInterval);
    };
  }, []);

  return (
    <>
      <style>{`
        .winter-card {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid #B0E0E6 !important;
          box-shadow: 0 4px 20px rgba(176, 224, 230, 0.3) !important;
        }
        
        .winter-card * {
          color: #4682B4 !important;
        }
        
        .winter-card h1,
        .winter-card h2,
        .winter-card h3,
        .winter-card h4 {
          color: #4682B4 !important;
        }
      `}</style>

      <AnimatePresence>
        {snowflakes.map(flake => (
          <motion.div
            key={flake.id}
            initial={{ y: -20, x: flake.x, opacity: 0.8, rotate: 0 }}
            animate={{ 
              y: window.innerHeight + 20, 
              x: flake.x + (Math.random() - 0.5) * 100,
              rotate: 360,
              opacity: [0.8, 1, 0.8, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: Math.random() * 3 + 5, ease: "linear" }}
            style={{
              position: 'fixed',
              fontSize: `${flake.size}px`,
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            ❄️
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}