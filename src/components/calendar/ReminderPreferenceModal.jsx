import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Clock, CalendarDays, ChevronRight, Check } from 'lucide-react';

const REMINDER_OPTIONS = [
  { value: '10min', label: '10 minutes before', desc: 'Quick heads-up' },
  { value: '30min', label: '30 minutes before', desc: 'Enough time to prep' },
  { value: '1hour', label: '1 hour before', desc: 'Comfortable buffer' },
  { value: 'daily', label: 'Day of (morning)', desc: 'Reminder when you wake up' },
  { value: 'every_other_day', label: 'Day before', desc: 'Plan ahead' },
  { value: '2hours', label: 'Every 2 hours (urgent)', desc: 'For high-stakes events' },
];

export default function ReminderPreferenceModal({ events, onDone, isDark }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState({});
  const [saving, setSaving] = useState(false);

  if (!events || events.length === 0) return null;

  const current = events[currentIndex];
  const isLast = currentIndex === events.length - 1;

  const handleSelect = async (value) => {
    const newChoices = { ...choices, [current.task_id]: value };
    setChoices(newChoices);

    if (isLast) {
      // Save all choices
      setSaving(true);
      try {
        for (const [taskId, interval] of Object.entries(newChoices)) {
          await base44.entities.Task.update(taskId, { reminder_interval: interval });
        }
      } catch (e) {
        console.error('Failed to save reminder preferences', e);
      } finally {
        setSaving(false);
        onDone();
      }
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSkip = () => {
    if (isLast) {
      // Save whatever was already chosen
      setSaving(true);
      Promise.all(
        Object.entries(choices).map(([taskId, interval]) =>
          base44.entities.Task.update(taskId, { reminder_interval: interval })
        )
      ).finally(() => {
        setSaving(false);
        onDone();
      });
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl ${cardBg} overflow-hidden`}>
        {/* Header */}
        <div className="bg-blue-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">
                Set reminder · {currentIndex + 1} of {events.length}
              </p>
              <h2 className="text-white font-bold text-lg leading-tight">{current.title}</h2>
            </div>
          </div>
          {events.length > 1 && (
            <div className="mt-3 flex gap-1">
              {events.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= currentIndex ? 'bg-white' : 'bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Question */}
        <div className="px-6 pt-4 pb-2">
          <p className={`text-sm font-medium ${textSecondary}`}>How often should we remind you?</p>
        </div>

        {/* Options */}
        <div className="px-4 pb-4 space-y-2">
          {REMINDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${
                isDark
                  ? 'border-gray-700 hover:bg-blue-900/30 hover:border-blue-500'
                  : 'border-gray-100 hover:bg-blue-50 hover:border-blue-200'
              }`}
            >
              <div>
                <p className={`font-medium text-sm ${textPrimary}`}>{opt.label}</p>
                <p className={`text-xs ${textSecondary}`}>{opt.desc}</p>
              </div>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 ${textSecondary}`} />
            </button>
          ))}
        </div>

        {/* Skip */}
        <div className="px-6 pb-5">
          <button
            onClick={handleSkip}
            disabled={saving}
            className={`text-sm ${textSecondary} hover:underline`}
          >
            {isLast ? 'Keep AI suggestion & finish' : 'Keep AI suggestion & next →'}
          </button>
        </div>
      </div>
    </div>
  );
}