
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
  Trash2 // New import
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
  AlertDialog, // New import
  AlertDialogAction, // New import
  AlertDialogCancel, // New import
  AlertDialogContent, // New import
  AlertDialogDescription, // New import
  AlertDialogFooter, // New import
  AlertDialogHeader, // New import
  AlertDialogTitle, // New import
  AlertDialogTrigger, // New import
} from "@/components/ui/alert-dialog";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";
import { FocusRoomEmoji } from "@/entities/FocusRoomEmoji";
import { User } from "@/entities/User";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

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

  const completionSounds = {
    chime: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
    applause: "https://assets.mixkit.co/active_storage/sfx/3035/3035-preview.mp3",
    success: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
    ding: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
    trumpet: "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3"
  };

  const breakEndSound = "https://audio-previews.elements.envatousercontent.com/files/200532414/preview.mp3?response-content-disposition=attachment%3B+filename%3D%22TX6WF5K-reveal-asia.mp3%22";

  const playlists = {
    study: "37i9dQZF1DWZeKCadgRdKQ",
    lofi: "37i9dQZF1DWWQRwui0ExPn",
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
      const activeParticipants = allParticipants.filter(p => {
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

      const allMessages = await FocusRoomEmoji.filter({ room_id: currentRoom.id }, '-timestamp', 100);
      setMessages(allMessages);

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
    if (!isHost) return;
    
    try {
      const newMode = mode === 'work' ? 'break' : 'work';
      
      await FocusRoom.update(currentRoom.id, {
        timer_mode: newMode,
        timer_started_at: new Date().toISOString()
      });

      if (audioRef.current) {
        audioRef.current.src = mode === 'work' 
          ? completionSounds[currentRoom.completion_sound || 'chime']
          : breakEndSound;
        audioRef.current.play().catch(err => console.log("Audio play failed:", err));
      }

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
        timerCompleteHandledRef.current = false;
      }, 1000);
    } catch (error) {
      console.error("Error completing timer:", error);
      timerCompleteHandledRef.current = false;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
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
              onClick={() => navigate(createPageUrl("Accountability"))}
              className={theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
            >
              ← Community
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
                  {participants.length}
                </Button>
              </SheetTrigger>
              <SheetContent className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <SheetHeader>
                  <SheetTitle className={theme === 'dark' ? 'text-white' : ''}>
                    Participants ({participants.length})
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  {participants.map((participant) => (
                    <button
                      key={participant.id}
                      onClick={() => handleViewProfile(participant)}
                      className={`w-full p-3 rounded-lg border transition-colors text-left ${
                        theme === 'dark'
                          ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={participant.profile_picture_url} />
                          <AvatarFallback>{participant.display_name[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {participant.display_name}
                            {participant.user_email === currentRoom.host_email && ' 👑'}
                          </p>
                          {participant.current_task && (
                            <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {participant.current_task}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
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

        <div className="grid lg:grid-cols-3 gap-4">
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
            
            <div className="h-48 overflow-y-auto mb-3 space-y-2">
              <AnimatePresence>
                {messages.map((message) => {
                  const isMe = message.sender_email === user?.email;
                  const isAI = message.sender_email === "ai@adhdone.app";
                  const participant = participants.find(p => p.user_email === message.sender_email);
                  
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
                          <>
                            <AvatarImage src={participant?.profile_picture_url} />
                            <AvatarFallback className="text-xs">{message.sender_name[0].toUpperCase()}</AvatarFallback>
                          </>
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

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Message..."
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
            </form>
          </div>

          {/* Music - Compact */}
          {playlistEmbed && (
            <div className={`rounded-xl p-4 shadow-lg ${
              theme === 'minimalist'
                ? 'bg-white'
                : theme === 'dark'
                  ? 'bg-gray-800'
                  : 'bg-white/80'
            }`}>
              <h2 className={`text-sm font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                🎵 Music
              </h2>
              <iframe
                src={playlistEmbed}
                width="100%"
                height="240"
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
