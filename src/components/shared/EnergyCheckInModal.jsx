import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { generateSmartTipForUser, clearTodaysTip } from "../utils/dailyTipGenerator";
import { Loader2, Sparkles, Zap, Flame, ArrowRight } from "lucide-react";

const MOODS = [
  {
    value: 'not_great',
    label: 'Not great',
    emoji: '😔',
    energy: 'low',
    color: 'border-red-300 hover:bg-red-50',
    darkColor: 'border-red-700 hover:bg-red-900/20',
  },
  {
    value: 'feeling_ok',
    label: 'Feeling ok',
    emoji: '😐',
    energy: 'medium',
    color: 'border-amber-300 hover:bg-amber-50',
    darkColor: 'border-amber-700 hover:bg-amber-900/20',
  },
  {
    value: 'good',
    label: 'Good',
    emoji: '🙂',
    energy: 'high',
    color: 'border-blue-300 hover:bg-blue-50',
    darkColor: 'border-blue-700 hover:bg-blue-900/20',
  },
  {
    value: 'lets_go',
    label: "Let's Go!",
    emoji: '🚀',
    energy: 'high',
    color: 'border-green-300 hover:bg-green-50',
    darkColor: 'border-green-700 hover:bg-green-900/20',
  },
];

const ENERGY_RANK = { low: 0, medium: 1, high: 2 };
const URGENCY_RANK = { low: 0, medium: 1, high: 2, urgent: 3 };

const URGENCY_LABEL = {
  low: { text: 'Low priority', cls: 'bg-gray-100 text-gray-600' },
  medium: { text: 'Medium priority', cls: 'bg-blue-100 text-blue-700' },
  high: { text: 'High priority', cls: 'bg-amber-100 text-amber-700' },
  urgent: { text: 'Urgent', cls: 'bg-red-100 text-red-700' },
};

const ENERGY_LABEL = {
  low: { text: 'Low energy', cls: 'bg-green-100 text-green-700' },
  medium: { text: 'Medium energy', cls: 'bg-yellow-100 text-yellow-700' },
  high: { text: 'High energy', cls: 'bg-orange-100 text-orange-700' },
};

// Score a task against the user's current energy, factoring in urgency + overdue.
// Higher total = better fit to start right now.
function scoreTask(task, userEnergy) {
  const te = ENERGY_RANK[task.energy_required] ?? 1;
  const ue = ENERGY_RANK[userEnergy] ?? 1;
  const energyDiff = Math.abs(te - ue);
  const energyMatch = energyDiff === 0 ? 3 : energyDiff === 1 ? 1 : 0;
  const urgency = (URGENCY_RANK[task.urgency] ?? 1) + 1; // 1..4
  const overdue = task.due_date && new Date(task.due_date) < new Date() ? 2 : 0;

  let total;
  if (userEnergy === 'low') {
    // Protect a drained battery: strongly prefer gentle tasks, but still
    // let urgency/overdue bubble something important up (with a penalty on
    // heavy lifting so we don't set them up to fail).
    total = energyMatch * 2.5 + urgency + overdue - (te === 2 ? 2 : 0);
  } else if (userEnergy === 'high') {
    // Plenty of fuel — tackle the big and/or urgent stuff while it lasts.
    total = urgency * 1.5 + (te === 2 ? 2 : 0) + energyMatch + overdue;
  } else {
    total = energyMatch * 1.5 + urgency + overdue;
  }
  return total;
}

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function EnergyCheckInModal({ isOpen, onClose, theme, title }) {
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState('choose'); // choose | generating | done
  const [tipText, setTipText] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [userEnergy, setUserEnergy] = useState('medium');
  const navigate = useNavigate();

  const handleSelect = async (mood) => {
    setSelected(mood.value);
    setUserEnergy(mood.energy);
    setStage('generating');

    const energyLevel = mood.energy;

    // Save to EnergyLog
    await base44.entities.EnergyLog.create({
      energy_level: energyLevel,
      mood_note: mood.value,
      logged_at: new Date().toISOString(),
    });

    // Store mood + energy so the rest of the app (and the tip generator) can use it
    localStorage.setItem('today_mood', mood.value);
    localStorage.setItem('today_mood_date', getLocalDateString());
    localStorage.setItem('today_energy', energyLevel);

    // Pull the user's active tasks and rank them by energy-fit + priority
    try {
      const allTasks = await base44.entities.Task.list('-updated_date', 100);
      const now = new Date();
      const todayStr = now.toDateString();
      // Only suggest tasks that are actually owed today — due today/overdue,
      // or with a reminder that lands on today or already passed. Future-dated
      // items (e.g. a doctor's appointment next week) must NOT be suggested.
      const isOwedToday = (t) => {
        if (t.due_date) {
          const dd = new Date(t.due_date);
          return dd.toDateString() === todayStr || dd.getTime() < now.getTime();
        }
        if (t.next_reminder) {
          const nr = new Date(t.next_reminder);
          return nr.toDateString() === todayStr || nr.getTime() < now.getTime();
        }
        return false;
      };
      const candidates = allTasks.filter(
        (t) => t.status === 'active' && !t.parent_task_id && !t.birthday_person && isOwedToday(t)
      );
      const ranked = candidates
        .map((t) => ({ task: t, score: scoreTask(t, energyLevel) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.task);
      setSuggestions(ranked);
    } catch (e) {
      console.error('Error loading energy suggestions:', e);
      setSuggestions([]);
    }

    // Generate a fresh daily tip reflecting the new mood
    try {
      const today = getLocalDateString();
      await clearTodaysTip(today);
      const newTip = await generateSmartTipForUser(today);
      setTipText(newTip?.tip_text || null);
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
    setSuggestions([]);
    onClose();
  };

  const isDark = theme === 'dark';
  const moodLabel = MOODS.find((m) => m.value === selected)?.label;

  const suggestionIntro =
    userEnergy === 'low'
      ? "You're running on fumes — here's something gentle to start with:"
      : userEnergy === 'high'
        ? "You've got fuel to burn — knock out something big or urgent:"
        : "Steady energy — here's a good place to start:";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${isDark ? 'bg-gray-900 border-gray-700' : ''}`}>
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
            <p className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Matching tasks to your energy…</p>
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

            {suggestions.length > 0 && (
              <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
                <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {suggestionIntro}
                </p>
                <div className="space-y-2">
                  {suggestions.map((task) => {
                    const u = URGENCY_LABEL[task.urgency] || URGENCY_LABEL.medium;
                    const e = ENERGY_LABEL[task.energy_required] || ENERGY_LABEL.medium;
                    const overdue = task.due_date && new Date(task.due_date) < new Date();
                    return (
                      <button
                        key={task.id}
                        onClick={() => { handleClose(); navigate('/Tasks'); }}
                        className={`w-full text-left rounded-lg p-3 transition flex items-center gap-3 ${
                          isDark ? 'bg-gray-700/60 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${u.cls}`}>
                              <Flame className="w-3 h-3" /> {u.text}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${e.cls}`}>
                              <Zap className="w-3 h-3" /> {e.text}
                            </span>
                            {overdue && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                Overdue
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                      </button>
                    );
                  })}
                </div>
                {moodLabel && (
                  <p className={`text-[11px] mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Ranked by what fits "{moodLabel}" energy + how urgent it is.
                  </p>
                )}
              </div>
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