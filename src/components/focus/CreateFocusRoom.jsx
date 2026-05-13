import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Lock, Music, Bell } from "lucide-react";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";
import { base44 } from "@/api/base44Client";

export default function CreateFocusRoom({ user, theme, onRoomCreated }) {
  const [roomName, setRoomName] = useState("");
  const [timerDuration, setTimerDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [currentTask, setCurrentTask] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState('none');
  const [completionSound, setCompletionSound] = useState('joyful_melody');
  const [isCreating, setIsCreating] = useState(false);

  const playlists = {
    none: { name: "No Music" },
    lofi: { name: "Lo-Fi Beats" },
    jazz: { name: "Jazz & Smooth" },
    ambient: { name: "Ambient Sounds" }
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

  const handleTestSound = () => {
    const audio = new Audio();
    audio.src = completionSounds[completionSound].url;
    audio.play().catch(err => console.log("Audio play failed:", err));
  };

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreate = async () => {
    if (!roomName.trim() || !user) return;
    
    setIsCreating(true);
    
    try {
      const roomCode = generateRoomCode();
      
      const room = await FocusRoom.create({
        room_name: roomName,
        room_code: roomCode,
        host_email: user.email,
        is_active: true,
        is_private: isPrivate,
        timer_duration: timerDuration,
        break_duration: breakDuration,
        timer_mode: 'work',
        selected_playlist: selectedPlaylist,
        completion_sound: completionSound,
        timer_started_at: new Date().toISOString()
      });

      await FocusRoomParticipant.create({
        room_id: room.id,
        user_email: user.email,
        display_name: user.display_name || user.full_name,
        profile_picture_url: user.profile_picture_url,
        current_task: currentTask,
        last_seen: new Date().toISOString(),
        emoji_status: "💪"
      });

      onRoomCreated(room);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room. Please try again.");
    }
    
    setIsCreating(false);
  };

  return (
    <Card className={`border-none shadow-xl ${
      theme === 'minimalist' 
        ? 'bg-white/90 backdrop-blur-sm' 
        : theme === 'dark'
          ? 'bg-gray-800/90 backdrop-blur-sm'
          : 'bg-gradient-to-br from-blue-50 to-cyan-50'
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
          <Sparkles className="w-5 h-5" />
          Create Focus Room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Room Name *</Label>
          <Input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Morning Focus Sprint, Study Session, etc."
            className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}
          />
        </div>

        <div className="space-y-2">
          <Label className={theme === 'dark' ? 'text-gray-200' : ''}>What are you working on?</Label>
          <Input
            value={currentTask}
            onChange={(e) => setCurrentTask(e.target.value)}
            placeholder="Writing essays, coding, cleaning..."
            className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Work Time</Label>
            <Select value={String(timerDuration)} onValueChange={(val) => setTimerDuration(Number(val))}>
              <SelectTrigger className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}>
                <SelectValue />
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

          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Break Time</Label>
            <Select value={String(breakDuration)} onValueChange={(val) => setBreakDuration(Number(val))}>
              <SelectTrigger className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}>
                <SelectValue />
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

        <div className="space-y-2">
          <Label className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>
            <Music className="w-4 h-4" />
            Background Music
          </Label>
          
          <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist}>
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(playlists).map(([key, playlist]) => (
                <SelectItem key={key} value={key}>{playlist.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-200' : ''}`}>
            <Bell className="w-4 h-4" />
            Completion Sound
          </Label>
          <Select value={completionSound} onValueChange={setCompletionSound}>
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(completionSounds).map(([key, sound]) => (
                <SelectItem key={key} value={key}>{sound.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="private" 
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
          <Label 
            htmlFor="private" 
            className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-gray-200' : ''}`}
          >
            <Lock className="w-4 h-4" />
            Make room private (only accessible with code)
          </Label>
        </div>

        <Button
          onClick={handleCreate}
          disabled={!roomName.trim() || isCreating}
          className={`w-full ${
            theme === 'minimalist' 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : theme === 'dark'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
          }`}
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Room...
            </>
          ) : (
            "Create & Start Focus Session"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}