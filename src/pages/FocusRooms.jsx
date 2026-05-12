import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";
import CreateFocusRoom from "../components/focus/CreateFocusRoom";
import JoinFocusRoom from "../components/focus/JoinFocusRoom";
import ActiveFocusRoom from "../components/focus/ActiveFocusRoom";
import BrowsePublicRooms from "../components/focus/BrowsePublicRooms";
import { Loader2, ArrowLeft, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card"; // Import Card and CardContent
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function FocusRooms() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [activeRoom, setActiveRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [browseExpanded, setBrowseExpanded] = useState(false);

  useEffect(() => {
    loadUser();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const timeoutEmptyRooms = async () => {
    try {
      // Get all active rooms
      const allActiveRooms = await FocusRoom.filter({ is_active: true });
      
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      for (const room of allActiveRooms) {
        // Get participants for this room
        const participants = await FocusRoomParticipant.filter({ room_id: room.id });
        
        // Check if any participants are still active
        const activeParticipants = participants.filter(p => {
          const lastSeen = new Date(p.last_seen);
          return lastSeen > thirtyMinutesAgo;
        });
        
        // If no active participants, deactivate the room
        if (activeParticipants.length === 0) {
          await FocusRoom.update(room.id, { is_active: false });
          console.log(`Timed out empty room: ${room.room_name}`);
        }
      }
    } catch (error) {
      console.error("Error timing out rooms:", error);
    }
  };

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      
      // Clean up empty rooms first
      await timeoutEmptyRooms();
      
      // Check if user is in any active room
      const myParticipations = await FocusRoomParticipant.filter({ 
        user_email: currentUser.email 
      }, '-created_date', 1);
      
      if (myParticipations.length > 0) {
        const rooms = await FocusRoom.filter({ 
          id: myParticipations[0].room_id,
          is_active: true
        });
        
        if (rooms.length > 0) {
          setActiveRoom(rooms[0]);
        }
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
    setLoading(false);
  };

  const handleRoomCreated = (room) => {
    setActiveRoom(room);
  };

  const handleRoomJoined = (room) => {
    setActiveRoom(room);
  };

  const handleLeaveRoom = async () => {
    if (activeRoom && user) {
      // Remove participant
      const myParticipations = await FocusRoomParticipant.filter({ 
        room_id: activeRoom.id,
        user_email: user.email 
      });
      
      if (myParticipations.length > 0) {
        await FocusRoomParticipant.delete(myParticipations[0].id);
      }
      
      // If host, deactivate room
      if (user.email === activeRoom.host_email) {
        await FocusRoom.update(activeRoom.id, { is_active: false });
      }
    }
    
    setActiveRoom(null);
  };

  const handleJoinFromBrowse = (roomCode) => {
    setBrowseExpanded(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-green-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (activeRoom) {
    return <ActiveFocusRoom room={activeRoom} onLeave={handleLeaveRoom} />;
  }

  return (
    <div className="p-4 md:p-8 w-full">
      <div className="max-w-6xl mx-auto">
        <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("Accountability"))}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Community
        </Button>
        <Card className={`border-none shadow-lg mb-6 cursor-pointer transition-all ${
          theme === 'minimalist'
            ? 'bg-white/90 backdrop-blur-sm'
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-br from-blue-50 to-purple-50'
        }`}>
          <CardContent className="p-6">
            <button
              onClick={() => setBrowseExpanded(!browseExpanded)}
              className="w-full text-left"
            >
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Focus Rooms
                  </h1>
                  <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className={`p-1 rounded-full hover:bg-gray-100 transition-colors ${
                        theme === 'dark' ? 'hover:bg-gray-700' : ''
                      }`}>
                        <Info className={`w-5 h-5 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="font-semibold">About Focus Rooms</h4>
                        <p className="text-sm text-gray-600">
                          Join virtual co-working sessions with others. Create or join a focus room to work alongside people, stay motivated, and keep each other accountable in real-time.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  Work together, stay accountable
                </p>
                <div className="flex items-center justify-center mt-3 gap-2">
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {browseExpanded ? "Hide" : "Browse or search"} for a room
                  </span>
                  {browseExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
            </button>

            {browseExpanded && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <BrowsePublicRooms 
                  theme={theme} 
                  onJoinRoom={handleJoinFromBrowse}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-8">
          <CreateFocusRoom 
            user={user} 
            theme={theme} 
            onRoomCreated={handleRoomCreated}
          />
        </div>
        {/* Android Navigation Button Spacer */}
        <div style={{ height: '120px' }} aria-hidden="true"></div>
      </div>
    </div>
  );
}