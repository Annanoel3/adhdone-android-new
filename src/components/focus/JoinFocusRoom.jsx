
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Clock, Search, Lock, Music } from "lucide-react";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";

export default function JoinFocusRoom({ user, theme, onRoomJoined }) {
  const [roomCode, setRoomCode] = useState("");
  const [currentTask, setCurrentTask] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]); // Renamed from activeRooms
  const [isLoading, setIsLoading] = useState(true); // Renamed from isLoadingRooms

  useEffect(() => {
    loadRooms(); // Renamed from loadActiveRooms
    const interval = setInterval(loadRooms, 10000); // Renamed from loadActiveRooms
    return () => clearInterval(interval);
  }, []);

  const loadRooms = async () => { // Renamed from loadActiveRooms
    setIsLoading(true); // Renamed from setIsLoadingRooms
    try {
      // Get all active rooms, filter out private ones
      const allRooms = await FocusRoom.filter({ is_active: true }, '-created_date', 20);
      
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      const roomsWithCounts = await Promise.all(
        allRooms.map(async (room) => {
          const participants = await FocusRoomParticipant.filter({ room_id: room.id });
          const activeParticipants = participants.filter(p => {
            const lastSeen = new Date(p.last_seen);
            return lastSeen > thirtyMinutesAgo;
          });
          
          // If no active participants, mark room as inactive
          if (activeParticipants.length === 0) {
            await FocusRoom.update(room.id, { is_active: false });
            return null; // Filter this out
          }
          
          return {
            ...room,
            participant_count: activeParticipants.length
          };
        })
      );
      
      // Filter out null (timed out) rooms and private rooms
      const publicRooms = roomsWithCounts.filter(r => r !== null && !r.is_private);
      
      setAvailableRooms(publicRooms.filter(r => r.participant_count < (r.max_participants || 10))); // Renamed from activeRooms, using participant_count
    } catch (error) {
      console.error("Error loading rooms:", error);
    }
    setIsLoading(false); // Renamed from setIsLoadingRooms
  };

  const handleJoin = async (room) => { // Kept name handleJoin
    if (!user) return;
    
    setIsJoining(true);
    
    try {
      const existing = await FocusRoomParticipant.filter({ 
        room_id: room.id,
        user_email: user.email
      });

      if (existing.length > 0) {
        await FocusRoomParticipant.update(existing[0].id, {
          current_task: currentTask,
          last_seen: new Date().toISOString(),
          emoji_status: "💪"
        });
      } else {
        await FocusRoomParticipant.create({
          room_id: room.id,
          user_email: user.email,
          display_name: user.display_name || user.full_name,
          profile_picture_url: user.profile_picture_url,
          current_task: currentTask,
          last_seen: new Date().toISOString(),
          emoji_status: "💪"
        });
      }

      onRoomJoined(room);
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Failed to join room. Please try again.");
    }
    
    setIsJoining(false);
  };

  const handleJoinByCode = async () => {
    if (!roomCode.trim() || !user) return;
    
    setIsJoining(true);
    
    try {
      const rooms = await FocusRoom.filter({ 
        room_code: roomCode.toUpperCase(),
        is_active: true
      });

      if (rooms.length === 0) {
        alert("Room not found. Please check the code and try again.");
        setIsJoining(false);
        return;
      }

      await handleJoin(rooms[0]);
    } catch (error) {
      console.error("Error joining by code:", error);
      alert("Failed to join room. Please try again.");
    }
    
    setIsJoining(false);
  };

  const playlists = {
    none: "No Music",
    study: "Deep Focus",
    lofi: "Lo-Fi Beats",
    cleaning: "Energy Music",
    ambient: "Ambient",
    classical: "Classical"
  };

  return (
    <Card className={`border-none shadow-xl ${
      theme === 'minimalist' 
        ? 'bg-white/90 backdrop-blur-sm' 
        : theme === 'dark'
          ? 'bg-gray-800/90 backdrop-blur-sm'
          : 'bg-gradient-to-br from-blue-50 to-cyan-50' // Updated theme classes for the single card
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
          <Users className="w-5 h-5" /> {/* Using existing Users icon */}
          Join Focus Room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Room code input section */}
        <div className="space-y-4">
          <h3 className={`font-semibold ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
            Join with Room Code
          </h3>
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Room Code</Label>
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="ABC123"
              className={`uppercase ${theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}`}
            />
          </div>

          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>What are you working on?</Label>
            <Input
              value={currentTask}
              onChange={(e) => setCurrentTask(e.target.value)}
              placeholder="Writing essays, coding..."
              className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}
            />
          </div>

          <Button
            onClick={handleJoinByCode}
            disabled={!roomCode.trim() || isJoining}
            className={`w-full ${
              theme === 'minimalist' 
                ? 'bg-cyan-600 hover:bg-cyan-700' 
                : theme === 'dark'
                  ? 'bg-cyan-600 hover:bg-cyan-700'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700'
            }`}
          >
            {isJoining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              "Join Focus Session"
            )}
          </Button>
        </div>

        {/* Public Focus Rooms section */}
        <div className="space-y-4">
          <h3 className={`font-semibold ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
            Available Public Rooms
          </h3>

          {isLoading ? ( // Using isLoading
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : availableRooms.length === 0 ? ( // Using availableRooms
            <div className="text-center py-8">
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                No public rooms right now. Create one or join with a code!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRooms.map((room) => ( // Using availableRooms
                <div
                  key={room.id}
                  className={`p-4 rounded-xl border transition-all hover:shadow-md ${
                    theme === 'dark' ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {room.room_name}
                      </h4>
                      <div className="flex gap-2 flex-wrap mb-2">
                        <Badge variant="outline" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {room.participant_count} active {/* Using participant_count */}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {room.timer_duration}m work / {room.break_duration}m break
                        </Badge>
                        {room.selected_playlist !== 'none' && (
                          <Badge variant="outline" className="text-xs">
                            <Music className="w-3 h-3 mr-1" />
                            {playlists[room.selected_playlist]}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        {room.room_code}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setRoomCode(room.room_code);
                        handleJoin(room);
                      }}
                      disabled={isJoining}
                      className={theme === 'minimalist' 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : theme === 'dark'
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-gradient-to-r from-blue-600 to-cyan-600'
                      }
                    >
                      Join
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
