import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Plus } from "lucide-react";
import { Task } from "@/entities/Task";
import TaskDecompositionModal from "./TaskDecompositionModal";

// Break a task into steps straight from the expanded card — no need to open
// Task Details first. Manual only: nothing here runs unless the user taps it.
export default function SubtaskQuickAdd({ task, theme, subtaskCount = 0, onRefresh }) {
  const [showAI, setShowAI] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    const titles = text.split(',').map(s => s.trim()).filter(Boolean);
    if (titles.length === 0) return;
    setText('');
    setShowInput(false);
    try {
      await Task.bulkCreate(titles.map((title, i) => ({
        title,
        parent_task_id: task.id,
        subtask_order: subtaskCount + i + 1,
        urgency: task.urgency,
        energy_required: task.energy_required,
        // Steps are a checklist — the parent task does all the reminding.
        reminder_interval: 'once',
        reminder_count: 0,
        status: 'active',
      })));
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error adding steps:', error);
    }
  };

  return (
    <div className={`pt-2 border-t space-y-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setShowAI(true); }}
          className={`h-8 gap-1.5 ${
            theme === 'dark'
              ? 'bg-gray-700 text-purple-300 border-purple-800 hover:bg-gray-600'
              : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {subtaskCount > 0 ? 'Suggest more steps' : 'Break into steps'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setShowInput(v => !v); }}
          className={`h-8 gap-1.5 ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <Plus className="w-4 h-4" />
          Add a step
        </Button>
      </div>

      {showInput && (
        <form onSubmit={handleAdd} className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a step..."
            autoFocus
            className="flex-1 h-9"
          />
          <Button type="submit" size="icon" className="h-9 w-9 flex-shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </form>
      )}

      <TaskDecompositionModal
        task={task}
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        onUpdate={() => { if (onRefresh) onRefresh(); }}
        theme={theme}
      />
    </div>
  );
}