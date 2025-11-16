import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, Sparkles } from "lucide-react";

export default function MomentumCelebration({ completedCount, remainingCount, theme }) {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState(null);
  const [lastShownCount, setLastShownCount] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem('last_momentum_celebration');
    
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Reset daily - allow celebrations again each day
        if (data.date === today) {
          return data.count;
        }
      } catch (e) {
        console.error('Error parsing momentum celebration data:', e);
      }
    }
    
    return 0;
  });

  useEffect(() => {
    console.log('🎉 [MOMENTUM] Checking celebration:', { completedCount, lastShownCount });
    
    // CRITICAL FIX: Only show if count is valid and increased
    if (completedCount === 0) {
      console.log('🎉 [MOMENTUM] No tasks completed yet');
      return;
    }
    
    if (completedCount <= lastShownCount) {
      console.log('🎉 [MOMENTUM] Count did not increase:', completedCount, 'vs', lastShownCount);
      return;
    }
    
    if (completedCount > 50) {
      console.log('🎉 [MOMENTUM] Count suspiciously high, skipping');
      return;
    }
    
    // Only show on milestones: 1, 3, 5, 8, 10, etc.
    const milestones = [1, 3, 5, 8, 10, 15, 20];
    if (!milestones.includes(completedCount) && completedCount % 5 !== 0) {
      console.log('🎉 [MOMENTUM] Not a milestone, skipping');
      return;
    }

    console.log('🎉 [MOMENTUM] SHOWING CELEBRATION!', completedCount);

    // Determine message and icon based on progress
    let newMessage = "";
    let newIcon = null;
    
    if (completedCount >= 10) {
      newMessage = `🔥 You're on fire! ${completedCount} tasks down${remainingCount > 0 ? `, ${remainingCount} to go!` : '!'}`;
      newIcon = Flame;
    } else if (completedCount >= 5) {
      newMessage = `⚡ Keep the momentum! ${completedCount} tasks down${remainingCount > 0 ? `, ${remainingCount} to go!` : '!'}`;
      newIcon = Zap;
    } else if (completedCount >= 3) {
      newMessage = `✨ Great progress! ${completedCount} done${remainingCount > 0 ? `, ${remainingCount} to go!` : '!'}`;
      newIcon = Sparkles;
    } else if (completedCount === 1) {
      newMessage = `✨ First one down! Momentum is building!`;
      newIcon = Sparkles;
    }

    if (newMessage && newIcon) {
      setMessage(newMessage);
      setIcon(newIcon);
      setShow(true);
      
      // Save to localStorage with today's date
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('last_momentum_celebration', JSON.stringify({
        count: completedCount,
        date: today
      }));
      
      setLastShownCount(completedCount);
    }
  }, [completedCount, remainingCount, lastShownCount]);

  // Separate effect for auto-dismiss timer
  useEffect(() => {
    if (!show) return;
    
    const timer = setTimeout(() => {
      setShow(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [show]);

  const Icon = icon;

  return (
    <AnimatePresence>
      {show && Icon && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.8 }}
          className="fixed top-20 left-4 right-4 z-[200] flex justify-center pointer-events-none"
          style={{ maxWidth: 'calc(100vw - 2rem)', margin: '0 auto' }}
        >
          <div className={`p-4 rounded-2xl shadow-2xl border-2 max-w-md w-full ${
            theme === 'minimalist'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-600'
              : theme === 'dark'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 border-green-700'
                : 'bg-gradient-to-r from-orange-500 to-pink-500 border-orange-600'
          }`}>
            <div className="flex items-center gap-3 text-white">
              <Icon className="w-6 h-6 animate-pulse flex-shrink-0" />
              <p className="font-bold text-sm sm:text-base flex-1 break-words">{message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}