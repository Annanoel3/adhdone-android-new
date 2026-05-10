import React from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Coffee, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useLocation } from 'react-router-dom';

export default function MiniPomodoroBar({ theme }) {
  const { timeLeft, isActive, mode, sessionCount, toggleTimer, resetTimer } = usePomodoro();
  const location = useLocation();

  const isOnFocusPage = location.pathname === createPageUrl('FocusTimer');

  // Only show when timer has been started (not at full duration) and user is NOT on FocusTimer page
  const totalSeconds = mode === 'work' ? 25 * 60 : 5 * 60;
  const hasStarted = isActive || timeLeft < totalSeconds;

  if (isOnFocusPage || !hasStarted) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isDark = theme === 'dark';
  const isWork = mode === 'work';

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 shadow-lg border-t ${
      isDark
        ? 'bg-gray-900 border-gray-700 text-white'
        : isWork
          ? 'bg-green-600 text-white border-green-700'
          : 'bg-blue-500 text-white border-blue-600'
    }`} style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <Link to={createPageUrl('FocusTimer')} className="flex items-center gap-2">
        {isWork
          ? <Sparkles className="w-4 h-4" />
          : <Coffee className="w-4 h-4" />
        }
        <span className="text-sm font-medium">{isWork ? 'Focus' : 'Break'}</span>
        {sessionCount > 0 && <span className="text-xs opacity-75">🍅×{sessionCount}</span>}
      </Link>

      <span className="text-xl font-bold tabular-nums">{timeStr}</span>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleTimer}
          className="text-white hover:bg-white/20 h-8 w-8 p-0"
        >
          {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={resetTimer}
          className="text-white hover:bg-white/20 h-8 w-8 p-0"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}