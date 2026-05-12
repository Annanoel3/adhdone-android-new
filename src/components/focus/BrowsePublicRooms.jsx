import React, { useState, useEffect } from "react";
import { FocusRoom } from "@/entities/FocusRoom";
import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, ChevronRight } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function BrowsePublicRooms({ theme, onJoinRoom }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [publicRooms, setPublicRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [participantCounts, setParticipantCounts] = useState({});

  useEffect(() => {
    loadPublicRooms();
  }, []);

  const loadPublicRooms = async () => {
    setLoading(true);
    try {
      const rooms = await FocusRoom.filter({ 
        is_active: true, 
        is_private: false 
      }, '-created_date');
      
      setPublicRooms(rooms);

      // Get participant counts
      const counts = {};
      for (const room of rooms) {
        const participants = await FocusRoomParticipant.filter({ room_id: room.id });
        counts[room.id] = participants.length;
      }
      setParticipantCounts(counts);
    } catch (error) {
      console.error("Error loading public rooms:", error);
    }
    setLoading(false);
  };

  const filteredRooms = publicRooms.filter(room =>
    room.room_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`rounded-lg p-4 border ${
      theme === 'dark'
        ? 'bg-gray-800 border-gray-700'
        : 'bg-white border-gray-200'
    }`}>
      <div className="mb-4">
        <Input
          placeholder="Search focus rooms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : filteredRooms.length === 0 ? (
        <p className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {searchQuery ? "No rooms found" : "No public rooms available"}
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredRooms.map(room => (
            <button
              key={room.id}
              onClick={() => onJoinRoom(room.room_code)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-gray-700'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {room.room_name}
                  </h3>
                  <div className={`text-sm flex items-center gap-1 mt-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <Users className="w-3 h-3" />
                    {participantCounts[room.id] || 0} working
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}