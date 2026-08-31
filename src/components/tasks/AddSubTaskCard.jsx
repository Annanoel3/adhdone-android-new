import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Keyboard, Mic, Sparkles } from "lucide-react";
import VoiceTaskInput from "./VoiceTaskInput";

// One card for adding steps to a task: type them, speak them, or let AI break
// the task down. Previously these were two separate cards separated by an "OR".
export default function AddSubTaskCard({
  theme,
  boxed = true,
  mode,
  setMode,
  newSubTask,
  setNewSubTask,
  onSubmit,
  onVoice,
  isProcessingVoice,
  onAIBreakdown,
  aiLabel = 'AI Break Down Task',
}) {
  const wrapperClass = boxed
    ? `p-4 rounded-lg border-2 ${
        theme === 'minimalist'
          ? 'border-green-200 bg-green-50/30'
          : theme === 'dark'
            ? 'border-green-800 bg-green-900/20'
            : 'border-green-300 bg-green-100/30'
      }`
    : 'pt-2';

  return (
    <div className={wrapperClass}>
      {boxed && (
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-5 h-5 text-green-600" />
          <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Add Sub-Tasks</h4>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <Button
          variant={mode === 'text' ? 'default' : boxed ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setMode('text')}
          className="flex-1"
        >
          <Keyboard className="w-3 h-3 mr-1" />
          Type
        </Button>
        <Button
          variant={mode === 'voice' ? 'default' : boxed ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setMode('voice')}
          className="flex-1"
        >
          <Mic className="w-3 h-3 mr-1" />
          Voice
        </Button>
        {onAIBreakdown && (
          <Button
            variant={boxed ? 'outline' : 'ghost'}
            size="sm"
            onClick={onAIBreakdown}
            className={`flex-1 ${theme === 'dark' ? 'border-purple-700 text-purple-300' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}`}
          >
            <Sparkles className="w-3 h-3 mr-1" />
            AI
          </Button>
        )}
      </div>

      {mode === 'text' ? (
        <div className="space-y-2">
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              value={newSubTask}
              onChange={(e) => setNewSubTask(e.target.value)}
              placeholder="Add a new sub-task..."
              className="flex-1"
            />
            <Button type="submit" size="icon" className="flex-shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </form>
          <p className="text-xs text-gray-500">💡 Tip: Separate multiple sub-tasks with commas</p>
          {onAIBreakdown && (
            <p className="text-xs text-gray-500">✨ Feeling overwhelmed? Tap AI to break this task into steps.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 text-center">
            {isProcessingVoice ? "Processing..." : "Speak your subtasks (you can say multiple at once)"}
          </p>
          <div className="flex justify-center">
            <VoiceTaskInput onTranscription={onVoice} theme={theme} inline={false} />
          </div>
        </div>
      )}
    </div>
  );
}