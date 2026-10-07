import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Coffee, Sparkles, Music, Volume2, VolumeX, Info, Bell, PartyPopper, Clock, Timer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { usePomodoro } from "@/context/PomodoroContext";
import RoyaltyFreeMusicPlayer from "@/components/focus/RoyaltyFreeMusicPlayer";
import { base44 } from "@/api/base44Client";
import { persistOnboardingFlag } from "@/components/onboarding/onboardingSync";

export default function FocusTimer() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  const wakeLockRef = useRef(null);
  const [viewMode, setViewMode] = useState('pomodoro');
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const stopwatchRef = useRef(null);

  const {
    workDuration, breakDuration, timeLeft, isActive, mode, sessionCount,
    completionSound, setCompletionSound, selectedPlaylist, setSelectedPlaylist,
    completionSounds, toggleTimer, resetTimer,
    handleWorkDurationChange, handleBreakDurationChange,
  } = usePomodoro();

  // Hear the chosen completion sound before a session ends on it.
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef(null);
  const stopPreview = () => {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }
    setPreviewing(false);
  };
  const togglePreview = () => {
    if (previewRef.current) {
      stopPreview();
      return;
    }
    const url = completionSounds?.[completionSound]?.url;
    if (!url) return;
    const audio = new Audio(url);
    audio.onended = stopPreview;
    audio.onerror = stopPreview;
    previewRef.current = audio;
    setPreviewing(true);
    audio.play().catch(stopPreview);
  };
  // A new pick stops the old preview; leaving the page stops it too.
  useEffect(() => { stopPreview(); }, [completionSound]);
  useEffect(() => () => { if (previewRef.current) previewRef.current.pause(); }, []);

  const playlists = {
    none: { name: "No Music" },
    ghibli: { name: "Ghibli Music" },
    lofi_bossa: { name: "Lofi Bossa Nova Jazz Mix" },
    dark_ocean_house: { name: "Dark Ocean House Hustle" },
    dark_jungle_house: { name: "Dark Jungle House Hustle" },
    lofi: { name: "Lo-Fi Beats" },
    jazz: { name: "Jazz & Smooth" },
    ambient: { name: "Ambient Sounds" },
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Stopwatch interval
  useEffect(() => {
    if (stopwatchRunning) {
      stopwatchRef.current = setInterval(() => {
        setStopwatchElapsed(prev => prev + 100);
      }, 100);
      return () => clearInterval(stopwatchRef.current);
    }
  }, [stopwatchRunning]);

  // Wake Lock management
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) {}
    };
    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch (err) {}
      }
    };
    if (isActive) requestWakeLock();
    else releaseWakeLock();
    return () => releaseWakeLock();
  }, [isActive]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
        try {
          if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive]);


  const formatStopwatchTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  };

  const toggleStopwatch = () => {
    setStopwatchRunning(prev => !prev);
  };

  const resetStopwatch = () => {
    setStopwatchRunning(false);
    setStopwatchElapsed(0);
  };

  // The seasonal-theme secret used to live here as a permanent "what's this?"
  // button. It wanders now — one page a day until it's found (see Layout).


  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalSeconds = mode === 'work' ? workDuration * 60 : breakDuration * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  const getCardBaseClasses = (currentSpecialMode, currentTheme, currentMode, isMainTimerCard = false, isMusicCard = false, isTitleCard = false) => {
    let classes = "border-none shadow-lg";
    // Phone spacing is tight on purpose: every card on this page fits on one
    // screen with no scrolling (Anna, Oct 7 2026). md: keeps the roomier
    // spacing on a desktop.
    if (!isMainTimerCard) classes += " mb-3 md:mb-6";
    else classes += " overflow-hidden";

    if (currentSpecialMode !== 'normal') {
      const specificSpecialModeClass = currentSpecialMode === 'halloween' ? 'halloween-card' : `${currentSpecialMode}-card`;
      classes += ` ${specificSpecialModeClass} bg-white/70 backdrop-blur-md border border-purple-400/30`;
    } else {
      if (currentTheme === 'minimalist') classes += ' bg-white/80 backdrop-blur-md';
      else if (currentTheme === 'dark') classes += ' bg-gray-800/80 backdrop-blur-md';
      else if (currentTheme === 'spicybrains') classes += ' bg-white/80 backdrop-blur-md';
      else {
        if (isMainTimerCard) {
          classes += currentMode === 'work'
            ? ' bg-gradient-to-br from-purple-200/80 via-pink-200/80 to-orange-200/80 backdrop-blur-md'
            : ' bg-gradient-to-br from-teal-200/80 via-blue-200/80 to-cyan-200/80 backdrop-blur-md';
        } else if (isMusicCard) {
          classes += currentMode === 'work'
            ? ' bg-gradient-to-br from-purple-100/80 to-pink-100/80 backdrop-blur-md'
            : ' bg-gradient-to-br from-teal-100/80 to-blue-100/80 backdrop-blur-md';
        } else if (isTitleCard) {
          classes += ' bg-gradient-to-br from-purple-50/80 to-pink-50/80 backdrop-blur-md';
        } else {
          classes += ' bg-gradient-to-br from-blue-100/80 to-purple-100/80 backdrop-blur-md';
        }
      }
    }
    return classes;
  };

  return (
    <div className={`min-h-screen p-3 md:p-8 ${
      theme === 'spicybrains'
        ? 'bg-gradient-to-br from-blue-300 via-blue-400 to-blue-500'
        : theme === 'dark'
          ? 'bg-gray-900'
          : ''
    }`}>
      {/* Title Card */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, false, false, true)}>
        <CardContent className="p-4 md:p-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-1">
              <h1 className={`text-2xl md:text-3xl font-bold ${
                specialMode !== 'normal' ? `${specialMode}-title` :
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>Pomodoro Timer</h1>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full"><Info className="w-5 h-5" /></Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>What's a Pomodoro Timer?</DialogTitle>
                    <DialogDescription className="space-y-3 pt-2">
                      <p>The Pomodoro Technique is a time management method that uses a timer to break work into focused intervals.</p>
                      <div className={`p-4 rounded-lg ${theme === 'minimalist' ? 'bg-green-50' : theme === 'dark' ? 'bg-green-900/20' : 'bg-gradient-to-br from-purple-50 to-orange-50'}`}>
                        <p className="font-semibold mb-2">How it works:</p>
                        <ul className="space-y-1 text-sm">
                          <li>🎯 Work for 25 minutes (1 Pomodoro)</li>
                          <li>☕ Take a 5-minute break</li>
                          <li>🔁 Repeat 4 times</li>
                          <li>🏖️ Take a longer 15-minute break</li>
                        </ul>
                      </div>
                      <p className="text-sm">This technique helps ADHD brains by creating clear work boundaries and regular breaks to prevent burnout!</p>
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
            <p className={specialMode !== 'normal' ? `${specialMode}-text` : theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              {viewMode === 'stopwatch' ? 'Stopwatch - Track your time!' : mode === 'work' ? 'Focus session - Time to work!' : 'Break time - Relax for a moment'}
            </p>
            <div className="flex justify-center gap-2 mt-3">
              <Button
                size="sm"
                variant={viewMode === 'pomodoro' ? 'default' : 'outline'}
                onClick={() => setViewMode('pomodoro')}
                className={viewMode === 'pomodoro' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              >
                <Timer className="w-4 h-4 mr-1" /> Pomodoro
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'stopwatch' ? 'default' : 'outline'}
                onClick={() => setViewMode('stopwatch')}
                className={viewMode === 'stopwatch' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              >
                <Clock className="w-4 h-4 mr-1" /> Stopwatch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {viewMode === 'pomodoro' ? (
      <>
      {/* Timer Duration Settings */}
      <Card className={getCardBaseClasses(specialMode, theme, mode)}>
        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-sm font-medium mb-1 block ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Work Duration</label>
              <Select value={workDuration.toString()} onValueChange={handleWorkDurationChange} disabled={isActive}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="25">25 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`text-sm font-medium mb-1 block ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Break Duration</label>
              <Select value={breakDuration.toString()} onValueChange={handleBreakDurationChange} disabled={isActive}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Completion Sound Selector */}
      <Card className={getCardBaseClasses(specialMode, theme, mode)}>
        <CardContent className="p-3 md:p-6">
          <div className="flex items-center gap-4">
            <Bell className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
            <Select value={completionSound} onValueChange={setCompletionSound}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(completionSounds).map(([key, sound]) => (
                  <SelectItem key={key} value={key}>{sound.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={togglePreview} className="flex-shrink-0">
              {previewing ? 'Stop' : 'Play'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Music Selector */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, false, true)}>
        <CardContent className="p-3 md:p-6">
          {/* The gap under the picker is only there when the player is showing. */}
          <div className={`flex items-center gap-4 ${showMusicPlayer ? 'mb-4' : ''}`}>
            <Music className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
            <Select value={selectedPlaylist} onValueChange={(value) => {
              setSelectedPlaylist(value);
              setShowMusicPlayer(value !== 'none');
            }}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(playlists).map(([key, playlist]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      {key === 'none' ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      {playlist.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AnimatePresence>
            {showMusicPlayer && (
              <RoyaltyFreeMusicPlayer selectedPlaylist={selectedPlaylist} theme={theme} />
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Timer Card */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, true)}>
        <CardContent className="p-5 md:p-12">
          {/* A plain bar, not a giant ring: the time, which block this is, and
              how far through it you are. */}
          <div className="flex flex-col items-center">
            <div
              className={`text-5xl md:text-6xl font-bold tabular-nums ${theme === 'dark' || theme === 'spicybrains' ? 'text-white' : 'text-gray-900'}`}
              style={{ textShadow: theme === 'colorful' || theme === 'spicybrains' ? '0 2px 20px rgba(255,255,255,0.5)' : 'none' }}
            >
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>

            <motion.div animate={isActive ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 2, repeat: Infinity }}
              className={`mt-2 text-lg font-medium flex items-center gap-2 ${
                mode === 'work'
                  ? theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : theme === 'spicybrains' ? 'text-yellow-300' : 'text-purple-900'
                  : theme === 'minimalist' ? 'text-blue-600' : theme === 'dark' ? 'text-blue-400' : theme === 'spicybrains' ? 'text-blue-300' : 'text-teal-900'
              }`}
            >
              {mode === 'work' ? <><Sparkles className="w-5 h-5" />Focus Time</> : <><Coffee className="w-5 h-5" />Break Time</>}
            </motion.div>

            <div
              className="w-full h-3 rounded-full overflow-hidden mt-4 md:mt-6"
              style={{ backgroundColor: theme === 'minimalist' ? '#e5e7eb' : theme === 'dark' ? '#374151' : '#ffffff80' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: theme === 'minimalist' ? (mode === 'work' ? '#16a34a' : '#3b82f6') : theme === 'dark' ? (mode === 'work' ? '#22c55e' : '#3b82f6') : theme === 'spicybrains' ? (mode === 'work' ? '#fde047' : '#93c5fd') : '#ffffff' }}
                initial={false}
                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>

            {sessionCount > 0 && (
              <div className={`text-sm mt-3 font-medium ${theme === 'dark' || theme === 'spicybrains' ? 'text-gray-200' : 'text-gray-600'}`}>
                🍅 {sessionCount} pomodoro{sessionCount !== 1 ? 's' : ''} completed
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4 mt-5 md:mt-8">
            <Button size="lg" onClick={toggleTimer} className={`w-36 ${
              theme === 'minimalist' ? (mode === 'work' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700')
              : theme === 'dark' ? (mode === 'work' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700')
              : theme === 'spicybrains' ? (mode === 'work' ? 'bg-yellow-400 text-blue-900 hover:bg-yellow-300' : 'bg-blue-400 text-white hover:bg-blue-300')
              : 'bg-white/90 text-gray-900 hover:bg-white shadow-lg backdrop-blur-sm'
            }`}>
              {isActive ? <><Pause className="w-5 h-5 mr-2" />Pause</> : <><Play className="w-5 h-5 mr-2" />Start</>}
            </Button>
            <Button size="lg" variant={theme === 'colorful' || theme === 'spicybrains' ? 'secondary' : 'outline'} onClick={resetTimer}
              className={`w-36 ${theme === 'colorful' ? 'bg-white/70 hover:bg-white/90 backdrop-blur-sm' : theme === 'spicybrains' ? 'bg-blue-200 text-blue-800 hover:bg-blue-100 backdrop-blur-sm' : ''}`}>
              <RotateCcw className="w-5 h-5 mr-2" />Reset
            </Button>
          </div>
        </CardContent>
      </Card>
      </>
      ) : (
      <Card className={getCardBaseClasses(specialMode, theme, mode, true)}>
        <CardContent className="p-5 md:p-12">
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={stopwatchRunning ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className={`w-48 h-48 rounded-full ${
                  theme === 'minimalist' ? 'bg-green-100' :
                  theme === 'dark' ? 'bg-gray-700' :
                  theme === 'spicybrains' ? 'bg-yellow-200' :
                  'bg-white/50 backdrop-blur-sm'
                }`}
              />
            </div>

            <div className="relative z-10 flex flex-col items-center justify-center py-10 md:py-12">
              <div className={`text-6xl md:text-7xl font-bold mb-4 tabular-nums ${
                theme === 'dark' || theme === 'spicybrains' ? 'text-white' : 'text-gray-900'
              }`}>
                {formatStopwatchTime(stopwatchElapsed)}
              </div>

              <div className={`text-lg font-medium flex items-center gap-2 ${
                stopwatchRunning
                  ? theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : theme === 'spicybrains' ? 'text-yellow-300' : 'text-purple-900'
                  : theme === 'dark' ? 'text-gray-400' : theme === 'spicybrains' ? 'text-blue-300' : 'text-gray-600'
              }`}>
                {stopwatchRunning ? <><Sparkles className="w-5 h-5" />Running</> : <><Clock className="w-5 h-5" />Ready</>}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-5 md:mt-8">
            <Button size="lg" onClick={toggleStopwatch} className={`w-36 ${
              theme === 'minimalist' ? 'bg-green-600 hover:bg-green-700'
              : theme === 'dark' ? 'bg-green-600 hover:bg-green-700'
              : theme === 'spicybrains' ? 'bg-yellow-400 text-blue-900 hover:bg-yellow-300'
              : 'bg-white/90 text-gray-900 hover:bg-white shadow-lg backdrop-blur-sm'
            }`}>
              {stopwatchRunning ? <><Pause className="w-5 h-5 mr-2" />Pause</> : <><Play className="w-5 h-5 mr-2" />Start</>}
            </Button>
            <Button size="lg" variant={theme === 'colorful' || theme === 'spicybrains' ? 'secondary' : 'outline'} onClick={resetStopwatch}
              className={`w-36 ${theme === 'colorful' ? 'bg-white/70 hover:bg-white/90 backdrop-blur-sm' : theme === 'spicybrains' ? 'bg-blue-200 text-blue-800 hover:bg-blue-100 backdrop-blur-sm' : ''}`}>
              <RotateCcw className="w-5 h-5 mr-2" />Reset
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* The secret theme button used to sit here; it wanders now (Layout). */}    </div>
  );
}