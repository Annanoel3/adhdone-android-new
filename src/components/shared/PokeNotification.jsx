import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

export default function PokeNotification({ theme }) {
  const [poke, setPoke] = useState(null);

  useEffect(() => {
    const handlePoke = (event) => {
      if (event && event.detail && event.detail.senderName) {
        setPoke(event.detail.senderName);
        
        setTimeout(() => {
          setPoke(null);
        }, 3000);
      }
    };

    window.addEventListener('userPoked', handlePoke);
    return () => window.removeEventListener('userPoked', handlePoke);
  }, []);

  return (
    <AnimatePresence>
      {poke && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.3 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50"
        >
          <div className={`p-4 rounded-2xl shadow-2xl border-2 ${
            theme === 'minimalist'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-purple-600'
              : theme === 'dark'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-700'
                : 'bg-gradient-to-r from-purple-400 to-pink-400 border-purple-500'
          }`}>
            <div className="flex items-center gap-3 text-white">
              <motion.div
                animate={{ 
                  rotate: [0, -10, 10, -10, 10, 0],
                  scale: [1, 1.2, 1, 1.2, 1]
                }}
                transition={{ duration: 0.5 }}
              >
                <Zap className="w-6 h-6" />
              </motion.div>
              <div>
                <p className="font-bold text-lg">👋 Poke!</p>
                <p className="text-sm opacity-90">{poke} is checking in on you</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}