import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Coffee, Sparkles, Music, Volume2, VolumeX, Info, Bell, PartyPopper } from "lucide-react";
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

export default function FocusTimer() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('work'); // 'work' or 'break'
  const [sessionCount, setSessionCount] = useState(0);
  const [selectedPlaylist, setSelectedPlaylist] = useState('none');
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [completionSound, setCompletionSound] = useState('joyful_melody'); // Changed initial state to match new sound list
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const wakeLockRef = useRef(null);

  const playlists = {
    none: { name: "No Music", embed: null },
    study: {
      name: "Deep Focus Study",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator"
    },
    lofi: {
      name: "Lo-Fi Beats",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator"
    },
    slowjazz: {
      name: "Slow Jazz",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DWV7EzJMK2FUI?utm_source=generator"
    },
    cleaning: {
      name: "Cleaning Energy",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator"
    },
    ambient: {
      name: "Ambient Sounds",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DX3Ogo9pFvBkY?utm_source=generator"
    },
    classical: {
      name: "Classical Focus",
      embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DWWEJlAGA9gs0?utm_source=generator"
    }
  };

  const completionSounds = {
    joyful_melody: {
      name: "Joyful Melody",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Joyful%20Melody.wav"
    },
    piano_melody: {
      name: "Piano Melody",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Piano%20Melody.mp3"
    },
    short_notification: {
      name: "Short Notification",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Short%20Notification.wav"
    },
    short_piano: {
      name: "Short Piano Notification",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Short%20Piano%20Notification.mp3"
    },
    applause: {
      name: "Applause",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Applause.wav"
    },
    jr_station: {
      name: "JR Station Notification",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification.mp3"
    },
    jr_station_3: {
      name: "JR Station Notification 3",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification%203.mp3"
    },
    jr_osaka_loop: {
      name: "JR Osaka Loop",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Osaka%20Loop%204.mp3"
    },
    jr_morning_tranquility: {
      name: "JR Morning Tranquility",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Morning%20Tranquility.mp3"
    },
    jr_flower_shop: {
      name: "JR Flower Shop",
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Flower%20Shop.mp3"
    }
  };

  const breakEndSound = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/TX6WF5K-reveal-asia.mp3";

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Wake Lock management
  useEffect(() => {
    const requestWakeLock = async () => {
      if (!isActive) return;
      
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock activated');
        }
      } catch (err) {
        console.log('Wake Lock error:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('Wake Lock released');
        } catch (err) {
          console.log('Wake Lock release error:', err);
        }
      }
    };

    if (isActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [isActive]);

  // Re-acquire wake lock when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            console.log('Wake Lock re-acquired');
          }
        } catch (err) {
          console.log('Wake Lock re-acquire error:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  const playCompletionSound = (isBreakEnd = false) => {
    const audio = audioRef.current || new Audio();
    audio.src = isBreakEnd ? breakEndSound : completionSounds[completionSound].url;
    audio.play().catch(err => console.log("Audio play failed:", err));
  };

  const handleTestSound = () => {
    playCompletionSound(false);
  };

  const handleTimerComplete = useCallback(() => {
    setIsActive(false);

    if (mode === 'work') {
      playCompletionSound(false);
      const newSessionCount = sessionCount + 1;
      setSessionCount(newSessionCount);

      // Switch to break mode
      setMode('break');
      setTimeLeft(breakDuration * 60);

      // Auto-start break timer
      setTimeout(() => {
        setIsActive(true);
      }, 1000);
    } else { // mode === 'break'
      // Break is over
      playCompletionSound(true);

      // Switch back to work mode
      setMode('work');
      setTimeLeft(workDuration * 60);

      // Auto-start work timer
      setTimeout(() => {
        setIsActive(true);
      }, 1000);
    }
  }, [mode, sessionCount, workDuration, breakDuration, completionSound]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleTimerComplete();
    }

    return () => clearInterval(intervalRef.current);
  }, [isActive, timeLeft, handleTimerComplete]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setMode('work');
    setTimeLeft(workDuration * 60);
    setSessionCount(0);
  };

  const handleWorkDurationChange = (value) => {
    const duration = parseInt(value, 10);
    setWorkDuration(duration);
    if (mode === 'work' && !isActive) {
      setTimeLeft(duration * 60);
    }
  };

  const handleBreakDurationChange = (value) => {
    const duration = parseInt(value, 10);
    setBreakDuration(duration);
    if (mode === 'break' && !isActive) {
      setTimeLeft(duration * 60);
    }
  };

  const getCurrentSeasonalTheme = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    if (month === 1 && day <= 2) return 'newyears';
    if ((month === 1 && day >= 3) || (month === 2 && day <= 7)) return 'winter';
    if (month === 2 && day >= 8 && day <= 14) return 'valentines';
    if ((month === 2 && day >= 15) || (month === 3 && day <= 16)) return 'winter';
    if (month === 3 && day === 17) return 'stpatricks';
    if ((month === 3 && day >= 18) || month === 4 || month === 5 || (month === 6 && day <= 21)) return 'spring';
    if ((month === 6 && day >= 22) || (month === 7 && day <= 3)) return 'summer';
    if (month === 7 && day === 4) return 'fourthjuly';
    if ((month === 7 && day >= 5) || (month === 8 && day <= 20)) return 'summer';
    if ((month === 8 && day >= 21) || month === 9) return 'fall';
    if (month === 10) return 'halloween';
    if (month === 11) return 'fall';
    if (month === 12 && day <= 25) return 'christmas';
    if (month === 12 && day >= 26 && day <= 30) return 'winter';
    if (month === 12 && day === 31) return 'newyears';
    
    return 'spring';
  };

  const handleEasterEgg = () => {
    const currentMode = localStorage.getItem('special_mode') || 'normal';
    const seasonalTheme = getCurrentSeasonalTheme();
    
    // Cycle between kawaii and current seasonal theme
    if (currentMode === 'normal' || currentMode === 'kawaii') {
      const nextMode = currentMode === 'kawaii' ? seasonalTheme : 'kawaii';
      localStorage.setItem('special_mode', nextMode);
      window.location.reload();
    } else {
      // If on a seasonal theme, go back to kawaii
      localStorage.setItem('special_mode', 'kawaii');
      window.location.reload();
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const getTotalSeconds = () => {
    return mode === 'work' ? workDuration * 60 : breakDuration * 60;
  };

  const progress = ((getTotalSeconds() - timeLeft) / getTotalSeconds()) * 100;

  // Helper function to generate consistent frosted card classes
  const getCardBaseClasses = (currentSpecialMode, currentTheme, currentMode, isMainTimerCard = false, isMusicCard = false, isTitleCard = false) => {
    let classes = "border-none shadow-lg";
    if (!isMainTimerCard) {
      classes += " mb-6";
    } else {
      classes += " overflow-hidden"; // Main timer card needs overflow-hidden
    }

    if (currentSpecialMode !== 'normal') {
      // For any special mode, apply the special mode class and a consistent frosted base
      const specificSpecialModeClass = currentSpecialMode === 'halloween' ? 'halloween-card' : `${currentSpecialMode}-card`;
      classes += ` ${specificSpecialModeClass} bg-white/70 backdrop-blur-md border border-purple-400/30`;
    } else {
      // Normal mode, apply theme-specific frosting
      if (currentTheme === 'minimalist') {
        classes += ' bg-white/80 backdrop-blur-md';
      } else if (currentTheme === 'dark') {
        classes += ' bg-gray-800/80 backdrop-blur-md';
      } else if (currentTheme === 'spicybrains') {
        classes += ' bg-white/80 backdrop-blur-md';
      }
      else { // colorful theme
        if (isMainTimerCard) {
          classes += currentMode === 'work'
            ? ' bg-gradient-to-br from-purple-200/80 via-pink-200/80 to-orange-200/80 backdrop-blur-md'
            : ' bg-gradient-to-br from-teal-200/80 via-blue-200/80 to-cyan-200/80 backdrop-blur-md';
        } else if (isMusicCard) {
            classes += currentMode === 'work'
              ? ' bg-gradient-to-br from-purple-100/80 to-pink-100/80 backdrop-blur-md'
              : ' bg-gradient-to-br from-teal-100/80 to-blue-100/80 backdrop-blur-md';
        } else if (isTitleCard) { // specific for the title card in colorful theme
          classes += ' bg-gradient-to-br from-purple-50/80 to-pink-50/80 backdrop-blur-md';
        } else { // default for other setting cards in colorful mode
          classes += ' bg-gradient-to-br from-blue-100/80 to-purple-100/80 backdrop-blur-md';
        }
      }
    }
    return classes;
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-blue-300 via-blue-400 to-blue-500' 
        : theme === 'dark' 
          ? 'bg-gray-900' 
          : ''
    }`}>
      <audio ref={audioRef} />

      {/* Title Card */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, false, false, true)}>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 className={`text-3xl font-bold ${
                specialMode !== 'normal' ? `${specialMode}-title` :
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Pomodoro Timer
              </h1>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Info className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>What's a Pomodoro Timer?</DialogTitle>
                    <DialogDescription className="space-y-3 pt-2">
                      <p>
                        The Pomodoro Technique is a time management method that uses a timer to break work into focused intervals.
                      </p>
                      <div className={`p-4 rounded-lg ${
                        theme === 'minimalist'
                          ? 'bg-green-50'
                          : theme === 'dark'
                            ? 'bg-green-900/20'
                            : 'bg-gradient-to-br from-purple-50 to-orange-50'
                      }`}>
                        <p className="font-semibold mb-2">How it works:</p>
                        <ul className="space-y-1 text-sm">
                          <li>🎯 Work for 25 minutes (1 Pomodoro)</li>
                          <li>☕ Take a 5-minute break</li>
                          <li>🔁 Repeat 4 times</li>
                          <li>🏖️ Take a longer 15-minute break</li>
                        </ul>
                      </div>
                      <p className="text-sm">
                        This technique helps ADHD brains by creating clear work boundaries and regular breaks to prevent burnout!
                      </p>
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
            <p className={
              specialMode !== 'normal' ? `${specialMode}-text` :
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }>
              {mode === 'work' ? 'Focus session - Time to work!' : 'Break time - Relax for a moment'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Timer Duration Settings */}
      <Card className={getCardBaseClasses(specialMode, theme, mode)}>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-sm font-medium mb-2 block ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Work Duration
              </label>
              <Select value={workDuration.toString()} onValueChange={handleWorkDurationChange} disabled={isActive}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work duration" />
                </SelectTrigger>
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
              <label className={`text-sm font-medium mb-2 block ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Break Duration
              </label>
              <Select value={breakDuration.toString()} onValueChange={handleBreakDurationChange} disabled={isActive}>
                <SelectTrigger>
                  <SelectValue placeholder="Select break duration" />
                </SelectTrigger>
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
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Bell className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
            <Select value={completionSound} onValueChange={setCompletionSound}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose completion sound" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(completionSounds).map(([key, sound]) => (
                  <SelectItem key={key} value={key}>
                    {sound.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Music Selector */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, false, true)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Music className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
            <Select value={selectedPlaylist} onValueChange={(value) => {
              setSelectedPlaylist(value);
              setShowMusicPlayer(value !== 'none');
            }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose background music" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(playlists).map(([key, playlist]) => (
                  <SelectItem key={key} value={key}>
                    {key === 'none' ? (
                      <span className="flex items-center gap-2">
                        <VolumeX className="w-4 h-4" />
                        {playlist.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4" />
                        {playlist.name}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {showMusicPlayer && playlists[selectedPlaylist].embed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <iframe
                  src={playlists[selectedPlaylist].embed}
                  width="100%"
                  height="152"
                  frameBorder="0"
                  allowFullScreen=""
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="rounded-lg"
                ></iframe>
                <p className={`text-xs mt-2 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  💡 Click play on the Spotify player above to start music
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Timer Card */}
      <Card className={getCardBaseClasses(specialMode, theme, mode, true)}>
        <CardContent className="p-8 md:p-12">
          <div className="relative">
            {theme === 'colorful' && (
              <div className="absolute inset-0 overflow-hidden rounded-full opacity-30">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 180, 360],
                  }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  className={`w-full h-full ${
                    mode === 'work'
                      ? 'bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400'
                      : 'bg-gradient-to-r from-teal-400 via-blue-400 to-cyan-400'
                  }`}
                  style={{ filter: 'blur(60px)' }}
                />
              </div>
            )}

            <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="90"
                stroke={theme === 'minimalist' ? '#e5e7eb' : theme === 'dark' ? '#374151' : theme === 'spicybrains' ? '#ffffff80' : '#ffffff80'}
                strokeWidth="12"
                fill="none"
              />
              <motion.circle
                cx="100"
                cy="100"
                r="90"
                stroke={
                  theme === 'minimalist'
                    ? mode === 'work' ? '#16a34a' : '#3b82f6'
                    : theme === 'dark'
                      ? mode === 'work' ? '#22c55e' : '#3b82f6'
                      : theme === 'spicybrains'
                        ? mode === 'work' ? '#fde047' : '#93c5fd'
                        : '#ffffff'
                }
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
                strokeLinecap="round"
                initial={{ strokeDashoffset: 2 * Math.PI * 90 }}
                animate={{
                  strokeDashoffset: 2 * Math.PI * 90 * (1 - progress / 100),
                  filter: theme === 'colorful' || theme === 'spicybrains' ? [
                    'drop-shadow(0 0 8px rgba(255,255,255,0.8))',
                    'drop-shadow(0 0 16px rgba(255,255,255,0.8))',
                    'drop-shadow(0 0 8px rgba(255,255,255,0.8))',
                  ] : 'none'
                }}
                transition={{
                  strokeDashoffset: { duration: 1 },
                  filter: { duration: 2, repeat: Infinity }
                }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${minutes}-${seconds}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.1, opacity: 0 }}
                  className={`text-6xl md:text-7xl font-bold mb-4 ${theme === 'dark' || theme === 'spicybrains' ? 'text-white' : 'text-gray-900'}`}
                  style={{
                    textShadow: theme === 'colorful' || theme === 'spicybrains'
                      ? '0 2px 20px rgba(255,255,255,0.5)'
                      : 'none'
                  }}
                >
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </motion.div>
              </AnimatePresence>

              <motion.div
                animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className={`text-lg font-medium flex items-center gap-2 ${
                  mode === 'work'
                    ? theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-40' : theme === 'spicybrains' ? 'text-yellow-300' : 'text-purple-900'
                    : theme === 'minimalist' ? 'text-blue-600' : theme === 'dark' ? 'text-blue-400' : theme === 'spicybrains' ? 'text-blue-300' : 'text-teal-900'
                }`}
              >
                {mode === 'work' ? (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Focus Time
                  </>
                ) : (
                  <>
                    <Coffee className="w-5 h-5" />
                    Break Time
                  </>
                )}
              </motion.div>

              {sessionCount > 0 && (
                <div className={`text-sm mt-2 font-medium ${theme === 'dark' || theme === 'spicybrains' ? 'text-gray-200' : 'text-gray-600'}`}>
                  🍅 {sessionCount} pomodoro{sessionCount !== 1 ? 's' : ''} completed
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <Button
              size="lg"
              onClick={toggleTimer}
              className={`w-36 ${
                theme === 'minimalist'
                  ? mode === 'work'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                  : theme === 'dark'
                    ? mode === 'work'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                    : theme === 'spicybrains'
                      ? mode === 'work'
                        ? 'bg-yellow-400 text-blue-900 hover:bg-yellow-300'
                        : 'bg-blue-400 text-white hover:bg-blue-300'
                      : 'bg-white/90 text-gray-900 hover:bg-white shadow-lg backdrop-blur-sm'
              }`}
            >
              {isActive ? (
                <>
                  <Pause className="w-5 h-5 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Start
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant={theme === 'colorful' || theme === 'spicybrains' ? 'secondary' : 'outline'}
              onClick={resetTimer}
              className={`w-36 ${
                theme === 'colorful' ? 'bg-white/70 hover:bg-white/90 backdrop-blur-sm' :
                theme === 'spicybrains' ? 'bg-blue-200 text-blue-800 hover:bg-blue-100 backdrop-blur-sm' : ''
              }`}
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Easter Egg Button */}
      <div className="mt-6 text-center" style={{ 
        marginBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' 
      }}>
        <Button
          onClick={handleEasterEgg}
          variant="ghost"
          className={`text-sm opacity-70 hover:opacity-100 ${
            theme === 'dark' || ['halloween', 'christmas', 'newyears', 'fourthjuly'].includes(specialMode)
              ? 'text-gray-500 hover:text-gray-400'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          what's this? 👀
        </Button>
      </div>
    </div>
  );
}