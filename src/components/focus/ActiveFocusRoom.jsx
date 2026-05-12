import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  LogOut, 
  Play, 
  Pause, 
  RotateCcw, 
  Users as UsersIcon, 
  Send,
  Coffee,
  Sparkles,
  Sun,
  Moon,
  Palette,
  Trash2,
  UserPlus,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";
import { FocusRoomEmoji } from "@/entities/FocusRoomEmoji";
import { User } from "@/entities/User";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { validateContent } from "../utils/contentModeration";
import ParticipantCard from "./ParticipantCard";

export default function ActiveFocusRoom({ room, onLeave }) {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [user, setUser] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(room);
  const [mode, setMode] = useState(room.timer_mode || 'work');
  const [theme, setTheme] = useState('colorful'); // Default to colorful for focus rooms
  const [isHost, setIsHost] = useState(false);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);
  const timerCompleteHandledRef = useRef(false);
  const wakeLockRef = useRef(null);

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
      url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification%203.mp3"
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

  const breakEndSound = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/three_dings.mp3";

  const playlists = {
    study: "37i9dQZF1DWZeKCadgRdKQ",
    lofi: "37i9dQZF1DWWQRwui0ExPn",
    slowjazz: "37i9dQZF1DWV7EzJMK2FUI",
    cleaning: "37i9dQZF1DX3rxVfibe1L0",
    ambient: "37i9dQZF1DX3Ogo9pFvBkY",
    classical: "37i9dQZF1DWWEJlAGA9gs0"
  };

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [user, currentRoom.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'colorful';
      setTheme(newTheme);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Wake Lock management
  useEffect(() => {
    const requestWakeLock = async () => {
      if (!currentRoom.timer_started_at) return;
      
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

    if (currentRoom.timer_started_at) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [currentRoom.timer_started_at]);

  // Re-acquire wake lock when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && currentRoom.timer_started_at && !wakeLockRef.current) {
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
  }, [currentRoom.timer_started_at]);

  // REMOVED auto-scroll effect

  useEffect(() => {
    if (!currentRoom.timer_started_at) {
      setTimeLeft(0);
      timerCompleteHandledRef.current = false;
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(currentRoom.timer_started_at).getTime();
      const duration = (mode === 'work' ? currentRoom.timer_duration : currentRoom.break_duration) * 60 * 1000;
      const now = Date.now();
      const elapsed = now - startTime;
      const remaining = Math.max(0, duration - elapsed);
      
      setTimeLeft(Math.floor(remaining / 1000));
      
      if (remaining === 0 && isHost && !timerCompleteHandledRef.current) {
        timerCompleteHandledRef.current = true;
        handleTimerComplete();
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [currentRoom.timer_started_at, currentRoom.timer_duration, currentRoom.break_duration, mode, isHost]);

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      setIsHost(currentUser.email === room.host_email);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const loadData = async () => {
    try {
      const allParticipants = await FocusRoomParticipant.filter({ room_id: currentRoom.id });
      // Get all active participants (include current user regardless of last_seen)
      const activeParticipants = allParticipants.filter(p => {
        if (user && p.user_email === user.email) return true; // Always include current user
        const lastSeen = new Date(p.last_seen);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        return lastSeen > fiveMinutesAgo;
      });
      
      setParticipants(activeParticipants);
      
      if (user) {
        const mine = activeParticipants.find(p => p.user_email === user.email);
        if (mine) {
          await FocusRoomParticipant.update(mine.id, {
            last_seen: new Date().toISOString()
          });
        }
      }

      const allMessages = await FocusRoomEmoji.filter({ room_id: currentRoom.id }, 'timestamp', 100);
      // Deduplicate messages by ID to prevent duplicates
      const uniqueMessages = Array.from(new Map(allMessages.map(msg => [msg.id, msg])).values());
      setMessages(uniqueMessages);

      const rooms = await FocusRoom.filter({ id: currentRoom.id });
      if (rooms.length > 0) {
        const updatedRoom = rooms[0];
        setCurrentRoom(updatedRoom);
        setMode(updatedRoom.timer_mode || 'work');
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const handleTimerComplete = async () => {
    if (!isHost || timerCompleteHandledRef.current) return;
    timerCompleteHandledRef.current = true;
    
    try {
      const newMode = mode === 'work' ? 'break' : 'work';
      
      // Play completion sound immediately
      const soundUrl = mode === 'work' 
        ? completionSounds[currentRoom.completion_sound || 'joyful_melody']?.url || completionSounds['joyful_melody'].url
        : breakEndSound;
      
      const audio = new Audio(soundUrl);
      audio.volume = 0.8;
      audio.play().catch(err => console.log("Audio play failed:", err));
      
      await FocusRoom.update(currentRoom.id, {
        timer_mode: newMode,
        timer_started_at: new Date().toISOString()
      });

      const encouragement = newMode === 'break' 
        ? "Great work! Time for a break! ☕"
        : "Break's over! Let's get back to work! 💪";

      await FocusRoomEmoji.create({
        room_id: currentRoom.id,
        sender_email: "ai@adhdone.app",
        sender_name: "ADHDone Coach",
        emoji: encouragement,
        timestamp: new Date().toISOString()
      });

      setTimeout(() => {
        loadData();
      }, 500);
    } catch (error) {
      console.error("Error completing timer:", error);
      timerCompleteHandledRef.current = false;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    // MODERATION: Check for inappropriate content
    const validationResult = await validateContent(newMessage.trim(), 'message');
    if (!validationResult.valid) {
      alert(validationResult.message);
      setNewMessage("");
      return;
    }
    
    try {
      await FocusRoomEmoji.create({
        room_id: currentRoom.id,
        sender_email: user.email,
        sender_name: user.display_name || user.full_name,
        emoji: newMessage,
        timestamp: new Date().toISOString()
      });
      
      setNewMessage("");
      setTimeout(() => {
        loadData();
        // Scroll to bottom only when YOU send a message
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
          }
        }, 100);
      }, 500);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleToggleTimer = async () => {
    if (!isHost) return;
    
    try {
      if (currentRoom.timer_started_at) {
        await FocusRoom.update(currentRoom.id, {
          timer_started_at: null
        });
      } else {
        await FocusRoom.update(currentRoom.id, {
          timer_started_at: new Date().toISOString()
        });
      }
      timerCompleteHandledRef.current = false;
      setTimeout(loadData, 500);
    } catch (error) {
      console.error("Error toggling timer:", error);
    }
  };

  const handleResetTimer = async () => {
    if (!isHost) return;
    
    try {
      await FocusRoom.update(currentRoom.id, {
        timer_started_at: new Date().toISOString(),
        timer_mode: 'work'
      });
      timerCompleteHandledRef.current = false;
      setTimeout(loadData, 500);
    } catch (error) {
      console.error("Error resetting timer:", error);
    }
  };

  const handleViewProfile = (participant) => {
    navigate(createPageUrl("UserProfile") + `?email=${participant.user_email}`);
  };

  const handleRequestConnect = async (participantEmail) => {
    if (!user) return;
    
    try {
      // Check if connection already exists
      const existing = await AccountabilityConnection.filter({
        requester_email: user.email,
        recipient_email: participantEmail
      });
      
      if (existing.length > 0) {
        alert("You've already sent a request to this person");
        return;
      }
      
      // Create connection request
      await AccountabilityConnection.create({
        requester_email: user.email,
        requester_name: user.full_name,
        requester_picture: user.profile_picture_url || "",
        recipient_email: participantEmail,
        status: 'pending'
      });
      
      alert("Connection request sent! They'll see it in their notifications.");
    } catch (error) {
      console.error("Error sending connection request:", error);
      alert("Failed to send request. Please try again.");
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'minimalist' ? 'colorful' : theme === 'colorful' ? 'dark' : 'minimalist';
    localStorage.setItem('adhd_theme', newTheme);
    setTheme(newTheme);
  };

  const handleDeleteRoom = async () => {
    if (!isHost) return;
    
    try {
      // Delete all participants
      const allParticipants = await FocusRoomParticipant.filter({ room_id: currentRoom.id });
      for (const participant of allParticipants) {
        await FocusRoomParticipant.delete(participant.id);
      }
      
      // Delete all messages
      const allMessages = await FocusRoomEmoji.filter({ room_id: currentRoom.id });
      for (const message of allMessages) {
        await FocusRoomEmoji.delete(message.id);
      }
      
      // Delete the room
      await FocusRoom.delete(currentRoom.id);
      
      // Navigate back
      navigate(createPageUrl("FocusRooms"));
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room. Please try again.");
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isTimerRunning = currentRoom.timer_started_at !== null;

  const getBackgroundClass = () => {
    if (theme === 'dark') return 'bg-gray-900';
    if (theme === 'minimalist') return 'bg-white';
    return 'bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50';
  };

  const getPlaylistEmbed = () => {
    if (currentRoom.selected_playlist === 'none') return null;
    
    // Check if it's a Spotify playlist ID
    let playlistId = currentRoom.selected_playlist;
    if (currentRoom.selected_playlist && currentRoom.selected_playlist.startsWith('spotify:')) {
      playlistId = currentRoom.selected_playlist.replace('spotify:', '');
    } else if (playlists[currentRoom.selected_playlist]) {
      playlistId = playlists[currentRoom.selected_playlist];
    } else {
        // If it's neither a spotify: URI nor a known key, assume it's a raw playlist ID
        // Or handle cases where it's an invalid ID
        // For robustness, could validate the playlistId format (e.g., regex for Spotify IDs)
    }
    
    return `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading room...</p>
        </div>
      </div>
    );
  }

  const playlistEmbed = getPlaylistEmbed();

  return (
    <div className={`min-h-screen ${getBackgroundClass()}`}>
      <audio ref={audioRef} />

      {/* Compact Header */}
      <div className={`p-3 border-b ${
        theme === 'dark'
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white/80 backdrop-blur-sm border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto">
          {/* Back button and room name */}
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("FocusRooms"))}
              className={theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
            >
              ← Back
            </Button>
            
            <div className="border-l h-6 border-gray-300 dark:border-gray-600"></div>
            
            <h1 className={`font-bold text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {currentRoom.room_name}
            </h1>
          </div>

          {/* Centered action buttons */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Palette className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === 'minimalist' ? (
                    <>
                      <Palette className="w-4 h-4 mr-2" />
                      Colorful Mode
                    </>
                  ) : theme === 'colorful' ? (
                    <>
                      <Moon className="w-4 h-4 mr-2" />
                      Dark Mode
                    </>
                  ) : (
                    <>
                      <Sun className="w-4 h-4 mr-2" />
                      Minimalist Mode
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet>
               <SheetTrigger asChild>
                 <Button variant="outline" size="sm">
                   <UsersIcon className="w-4 h-4 mr-2" />
                   {participants.length + 1}
                 </Button>
               </SheetTrigger>
               <SheetContent className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                 <SheetHeader>
                   <SheetTitle className={theme === 'dark' ? 'text-white' : ''}>
                     Participants ({participants.length + 1})
                   </SheetTitle>
                 </SheetHeader>
                <div className="mt-6 space-y-3">
                  {/* Current user */}
                  {user && (
                    <div className={`p-3 rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600'
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.profile_picture_url} />
                          <AvatarFallback>{user.full_name?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {user.full_name} (Me)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Other participants */}
                  {participants.map((participant) => (
                    <ParticipantCard
                      key={participant.id}
                      participant={participant}
                      user={user}
                      currentRoom={currentRoom}
                      theme={theme}
                      onConnect={handleRequestConnect}
                      onViewProfile={handleViewProfile}
                    />
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            
            {isHost && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Focus Room?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will end the session for everyone and permanently delete this room. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteRoom} className="bg-red-600 hover:bg-red-700">
                      Delete Room
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={onLeave}
            >
              <LogOut className="w-4 h-4 mr-1" />
              Leave
            </Button>
          </div>
        </div>
      </div>

      {/* Compact Grid Layout */}
      <div className="max-w-7xl mx-auto p-4">
        {/* Room Code Info */}
        <div className={`mb-4 p-3 rounded-lg border text-center ${
          theme === 'minimalist'
            ? 'bg-blue-50 border-blue-200'
            : theme === 'dark'
              ? 'bg-gray-800 border-gray-700'
              : 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200'
        }`}>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Room Code: <span className="font-mono font-bold text-lg ml-2">{currentRoom.room_code}</span>
          </p>
          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Share this code with others to invite them
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timer - Compact */}
          <div className={`rounded-xl p-6 shadow-lg ${
            theme === 'minimalist'
              ? 'bg-white'
              : theme === 'dark'
                ? 'bg-gray-800'
                : mode === 'work'
                  ? 'bg-gradient-to-br from-purple-100 to-pink-100'
                  : 'bg-gradient-to-br from-teal-100 to-blue-100'
          }`}>
            <div className="text-center">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-sm ${
                theme === 'minimalist'
                  ? mode === 'work' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  : theme === 'dark'
                    ? mode === 'work' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                    : mode === 'work' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white'
              }`}>
                {mode === 'work' ? <Sparkles className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
                <span className="font-medium">
                  {mode === 'work' ? 'Focus Time' : 'Break Time'}
                </span>
              </div>
              
              <div className={`text-5xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>

              {isHost && (
                <div className="flex justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleToggleTimer}
                    className={theme === 'minimalist'
                      ? 'bg-green-600 hover:bg-green-700'
                      : theme === 'dark'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-purple-600 hover:bg-purple-700'
                    }
                  >
                    {isTimerRunning ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    {isTimerRunning ? 'Pause' : 'Start'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetTimer}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {!isHost && (
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {isTimerRunning ? '⏱️ Running...' : '⏸️ Paused'}
                </p>
              )}
            </div>
          </div>

          {/* Chat - Compact */}
          <div className={`rounded-xl p-4 shadow-lg ${
            theme === 'minimalist'
              ? 'bg-white'
              : theme === 'dark'
                ? 'bg-gray-800'
                : 'bg-white/80'
          }`}>
            <h2 className={`text-sm font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              💬 Chat
            </h2>
            
            <div className="h-40 overflow-y-auto mb-2 space-y-2 flex flex-col">
              <AnimatePresence>
                {messages.map((message) => {
                   const isMe = message.sender_email === user?.email;
                   const isAI = message.sender_email === "ai@adhdone.app";

                   return (
                     <motion.div
                       key={message.id}
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, y: -10 }}
                       className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                     >
                       <Avatar className="w-6 h-6 flex-shrink-0">
                         {isAI ? (
                           <AvatarFallback className="bg-amber-100">
                             <Sparkles className="w-3 h-3 text-amber-600" />
                           </AvatarFallback>
                         ) : (
                           <AvatarFallback className="text-xs">{message.sender_name[0].toUpperCase()}</AvatarFallback>
                         )}
                       </Avatar>

                       <div className={`max-w-[70%] px-2 py-1 rounded-lg text-xs ${
                         isAI
                           ? 'bg-amber-50 border border-amber-200 text-amber-800'
                           : isMe 
                             ? theme === 'minimalist'
                               ? 'bg-green-600 text-white'
                               : theme === 'dark'
                                 ? 'bg-green-700 text-white'
                                 : 'bg-purple-600 text-white'
                             : theme === 'dark'
                               ? 'bg-gray-700 text-white'
                               : 'bg-gray-100'
                       }`}>
                         <p className="font-medium opacity-80">{message.sender_name}</p>
                         <p>{message.emoji}</p>
                       </div>
                     </motion.div>
                   );
                 })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            <div className="mb-2 flex gap-1 flex-wrap text-xs">
              {["Everyone's doing so good!", "Not long to go!", "Let's do this together!", "You got this! 💪"].map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNewMessage(prompt);
                  }}
                  className={`py-1 px-2 h-auto text-xs ${
                    theme === 'minimalist'
                      ? 'border-green-300 hover:bg-green-50'
                      : theme === 'dark'
                        ? 'border-gray-600 hover:bg-gray-700'
                        : 'border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  {prompt}
                </Button>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value.slice(0, 60))}
                  maxLength="60"
                  placeholder="Message (60 chars)..."
                  className={`text-sm ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
                />
                <Button 
                  type="submit" 
                  size="sm"
                  disabled={!newMessage.trim()}
                  className={theme === 'minimalist' ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {newMessage.length}/60
              </p>
            </form>
          </div>

          {/* Music - Compact */}
          {playlistEmbed && (
            <div className={`rounded-xl p-3 shadow-lg ${
              theme === 'minimalist'
                ? 'bg-white'
                : theme === 'dark'
                  ? 'bg-gray-800'
                  : 'bg-white/80'
            }`}>
              <h2 className={`text-sm font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                🎵 Music
              </h2>
              <iframe
               src={playlistEmbed}
               width="100%"
               height="200"
               frameBorder="0"
               allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
               loading="lazy"
               className="rounded-lg"
              ></iframe>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}