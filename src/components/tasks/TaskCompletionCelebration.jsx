import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function TaskCompletionCelebration({ theme }) {
  const confettiColors = theme === 'minimalist' 
    ? ['#10b981', '#3b82f6', '#8b5cf6']
    : ['#a855f7', '#ec4899', '#f97316', '#06b6d4'];

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden rounded-xl">
      {/* Confetti particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            backgroundColor: confettiColors[i % confettiColors.length],
            left: `${Math.random() * 100}%`,
            top: '50%',
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{
            y: [0, -100 - Math.random() * 100],
            x: [0, (Math.random() - 0.5) * 200],
            scale: [0, 1, 0.5],
            opacity: [1, 1, 0],
            rotate: [0, Math.random() * 360],
          }}
          transition={{
            duration: 1 + Math.random() * 0.5,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Center sparkle burst */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 2, 0], opacity: [1, 0.8, 0] }}
        transition={{ duration: 0.8 }}
      >
        <Sparkles className={`w-12 h-12 ${
          theme === 'minimalist' ? 'text-green-500' : 'text-purple-500'
        }`} />
      </motion.div>

      {/* Points popup */}
      <motion.div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 rounded-full font-bold text-white shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-green-600' 
            : 'bg-gradient-to-r from-purple-600 to-orange-600'
        }`}
        initial={{ scale: 0, y: 0, opacity: 0 }}
        animate={{ 
          scale: [0, 1.2, 1], 
          y: [0, -20, -40],
          opacity: [0, 1, 0]
        }}
        transition={{ duration: 1.5, times: [0, 0.3, 1] }}
      >
        +10 Points!
      </motion.div>
    </div>
  );
}