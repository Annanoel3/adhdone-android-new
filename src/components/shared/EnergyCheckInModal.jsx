import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { generateSmartTipForUser, clearTodaysTip } from "../utils/dailyTipGenerator";
import { Loader2, Sparkles } from "lucide-react";

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

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function EnergyCheckInModal({ isOpen, onClose, theme, title }) {
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState('choose'); // choose | generating | done
  const [tipText, setTipText] = useState(null);

  const handleSelect = async (mood) => {
    setSelected(mood.value);
    setStage('generating');

    // Save to EnergyLog
    await base44.entities.EnergyLog.create({
      energy_level: mood.value === 'lets_go' || mood.value === 'good' ? 'high' : mood.value === 'feeling_ok' ? 'medium' : 'low',
      mood_note: mood.value,
      logged_at: new Date().toISOString(),
    });

    // Store mood so the shared tip generator can use it
    localStorage.setItem('today_mood', mood.value);
    localStorage.setItem('today_mood_date', getLocalDateString());

    // Generate a fresh daily tip reflecting the new mood
    try {
      const today = getLocalDateString();
      await clearTodaysTip(today);
      const newTip = await generateSmartTipForUser(today);
      setTipText(newTip?.tip_text || null);
      // Tell the Home card to reload the newly-saved tip
      window.dispatchEvent(new CustomEvent('daily-tip-regenerated'));
    } catch (e) {
      console.error('Error generating daily tip from check-in:', e);
      setTipText(null);
    }
    setStage('done');
  };

  const handleClose = () => {
    setSelected(null);
    setStage('choose');
    setTipText(null);
    onClose();
  };

  const isDark = theme === 'dark';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${isDark ? 'bg-gray-900 border-gray-700' : ''}`}>
        <DialogHeader>
          <DialogTitle className={`text-xl text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {stage === 'done'
              ? "Here's your tip ✨"
              : title || 'How are you feeling about the day ahead?'}
          </DialogTitle>
        </DialogHeader>

        {stage === 'choose' && (
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
        )}

        {stage === 'generating' && (
          <div className="py-8 text-center">
            <div className="text-4xl mb-3">{MOODS.find(m => m.value === selected)?.emoji}</div>
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-amber-500 mb-3" />
            <p className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Generating your daily tip…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="py-4 space-y-4">
            {tipText ? (
              <div className={`rounded-xl p-4 ${isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                  <span className={`text-xs font-semibold uppercase ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Today's Tip</span>
                </div>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{tipText}</p>
              </div>
            ) : (
              <p className={`text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Your tip is ready on the home screen ✨
              </p>
            )}
            <Button onClick={handleClose} className="w-full">
              {tipText ? 'Got it' : 'Close'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}