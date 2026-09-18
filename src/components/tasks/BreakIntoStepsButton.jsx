import React, { useState } from 'react';
import { Sparkles } from "lucide-react";
import TaskDecompositionModal from "./TaskDecompositionModal";

// Compact "break into steps" entry point for list rows that have no steps yet.
// Sits in the same spot the subtask dropdown occupies once steps exist.
export default function BreakIntoStepsButton({ task, theme, onDone }) {
  const [showAI, setShowAI] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowAI(true); }}
        className={`flex items-center gap-2 text-sm p-2 rounded transition-colors ${
          theme === 'dark'
            ? 'text-purple-300 hover:bg-purple-900/30'
            : 'text-purple-600 hover:bg-purple-50'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span>Break into steps</span>
      </button>

      <TaskDecompositionModal
        task={task}
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        onUpdate={() => {
          if (onDone) onDone();
          window.dispatchEvent(new Event('tasks-changed'));
        }}
        theme={theme}
      />
    </>
  );
}