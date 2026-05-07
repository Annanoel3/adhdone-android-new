import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const MOODS = [
  {
    value: 'not_great',
    label: 'Not great',
    emoji: '😔',
    color: 'border-red-300 hover:bg-red-50',
    darkColor: 'border-red-700 hover:bg-red-900/20',
  },
  {
    value: 'feeling_ok',
    label: 'Feeling ok',
    emoji: '😐',
    color: 'border-amber-300 hover:bg-amber-50',
    darkColor: 'border-amber-700 hover:bg-amber-900/20',
  },
  {
    value: 'good',
    label: 'Good',
    emoji: '🙂',
    color: 'border-blue-300 hover:bg-blue-50',
    darkColor: 'border-blue-700 hover:bg-blue-900/20',
  },
  {
    value: 'lets_go',
    label: "Let's Go!",
    emoji: '🚀',
    color: 'border-green-300 hover:bg-green-50',
    darkColor: 'border-green-700 hover:bg-green-900/20',
  },
];

export default function EnergyCheckInModal({ isOpen, onClose, theme }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = async (mood) => {
    setSelected(mood.value);

    // Save to EnergyLog
    await base44.entities.EnergyLog.create({
      energy_level: mood.value === 'lets_go' || mood.value === 'good' ? 'high' : mood.value === 'feeling_ok' ? 'medium' : 'low',
      mood_note: mood.value,
      logged_at: new Date().toISOString(),
    });

    // Store mood for DailyTipCard to use
    localStorage.setItem('today_mood', mood.value);
    localStorage.setItem('today_mood_date', new Date().toISOString().split('T')[0]);

    setSubmitted(true);
    setTimeout(() => {
      setSelected(null);
      setSubmitted(false);
      onClose();
    }, 1200);
  };

  const isDark = theme === 'dark';

  return (
    <Dialog open={isOpen} onOpenChange={() => {
      setSelected(null);
      setSubmitted(false);
      onClose();
    }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${isDark ? 'bg-gray-900 border-gray-700' : ''}`}>
        <DialogHeader>
          <DialogTitle className={`text-xl text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
            How are you feeling about the day ahead?
          </DialogTitle>
        </DialogHeader>

        {!submitted ? (
          <div className="grid grid-cols-2 gap-3 py-4">
            {MOODS.map((mood) => (
              <button
                key={mood.value}
                onClick={() => handleSelect(mood)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-medium ${
                  isDark ? mood.darkColor + ' bg-gray-800 text-gray-100' : mood.color + ' bg-white text-gray-800'
                } ${selected === mood.value ? 'scale-95 opacity-70' : 'hover:scale-105'}`}
              >
                <span className="text-3xl">{mood.emoji}</span>
                <span className="text-sm">{mood.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="text-4xl mb-3">{MOODS.find(m => m.value === selected)?.emoji}</div>
            <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Got it! Your tip is ready ✨</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}