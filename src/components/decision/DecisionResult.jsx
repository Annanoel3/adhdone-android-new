import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function DecisionResult({ winner }) {
  if (!winner) return null;

  return (
    <motion.div
      key={winner}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-6 text-center"
    >
      <div className="flex items-center justify-center gap-2 text-purple-600 text-sm font-medium mb-2">
        <Sparkles className="w-4 h-4" />
        Decision made
      </div>
      <p className="text-3xl font-bold text-gray-900 break-words">{winner}</p>
      <p className="text-sm text-gray-600 mt-3">That's the one. Go with it.</p>
    </motion.div>
  );
}