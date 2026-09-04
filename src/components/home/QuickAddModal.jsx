import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Keyboard } from "lucide-react";
import VoiceTaskInput from "../tasks/VoiceTaskInput";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { enqueueCapture } from "@/lib/pendingCaptures";

export default function QuickAddModal({ isOpen, onClose, theme }) {
  const [mode, setMode] = useState('voice');
  const navigate = useNavigate();

  // Quick Add owns no parsing of its own — it hands the raw transcript to the
  // shared background capture pipeline, exactly like Add Task and the voice
  // assistant do. One parser, one set of rules, everywhere.
  const handleVoiceInput = (transcription) => {
    enqueueCapture({ text: transcription });
    onClose();
    navigate(createPageUrl("Home"), { state: { reload: true } });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-6 space-y-6">
          <div className="text-center">
            <h3 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              What's on your mind?
            </h3>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Tap the mic and speak your task or idea
            </p>
          </div>

          {mode === 'voice' ? (
            <div className="space-y-4">
              <VoiceTaskInput
                onTranscription={handleVoiceInput}
                theme={theme}
                inline={false}
              />
              <Button
                variant="ghost"
                onClick={() => setMode('text')}
                className="w-full flex items-center justify-center gap-2 text-sm"
              >
                <Keyboard className="w-4 h-4" />
                Or type instead
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={() => navigate(createPageUrl("AddTask"))}
                className={`w-full ${
                  theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : theme === 'dark'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'
                }`}
              >
                Add Task
              </Button>
              <Button
                onClick={() => navigate(createPageUrl("ParkingLot"))}
                className={`w-full ${
                  theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                Save Idea
              </Button>
              <Button
                variant="ghost"
                onClick={() => setMode('voice')}
                className="w-full flex items-center justify-center gap-2 text-sm"
              >
                <Mic className="w-4 h-4" />
                Or use voice
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}