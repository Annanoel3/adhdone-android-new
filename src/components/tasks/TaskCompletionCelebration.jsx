import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

// Confetti is drawn on our OWN canvas with useWorker:false. The library's
// default global instance renders in an OffscreenCanvas worker, which on
// Android WebView paints a blank white full-screen layer instead of confetti.
export default function TaskCompletionCelebration({ theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const fire = confetti.create(canvasRef.current, { resize: true, useWorker: false });
    const colors =
      theme === 'minimalist'
        ? ['#10b981', '#3b82f6', '#8b5cf6']
        : ['#a855f7', '#ec4899', '#f97316', '#06b6d4'];

    fire({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors });
    const t1 = setTimeout(
      () => fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors }),
      150
    );
    const t2 = setTimeout(
      () => fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors }),
      300
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      fire.reset();
    };
  }, [theme]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ background: 'transparent' }}
      />
      <motion.div
        className={`relative px-5 py-2.5 rounded-full font-bold text-white shadow-lg ${
          theme === 'minimalist'
            ? 'bg-green-600'
            : 'bg-gradient-to-r from-purple-600 to-orange-600'
        }`}
        initial={{ scale: 0, y: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], y: [0, -20, -40], opacity: [0, 1, 0] }}
        transition={{ duration: 1.5, times: [0, 0.3, 1] }}
      >
        Nice. That's done. 🎉
      </motion.div>
    </div>
  );
}