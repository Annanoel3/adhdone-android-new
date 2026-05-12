import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, MessageSquare } from "lucide-react";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ParticipantCard({ participant, user, currentRoom, theme, onConnect, onViewProfile }) {
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState('none'); // 'none', 'pending', 'connected'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        // Check if they're connected (accepted)
        const accepted = await AccountabilityConnection.filter({
          requester_email: user.email,
          recipient_email: participant.user_email,
          status: 'accepted'
        });
        
        if (accepted.length > 0) {
          setConnectionStatus('connected');
          setLoading(false);
          return;
        }

        // Check if there's a pending request
        const pending = await AccountabilityConnection.filter({
          requester_email: user.email,
          recipient_email: participant.user_email,
          status: 'pending'
        });
        
        if (pending.length > 0) {
          setConnectionStatus('pending');
          setLoading(false);
          return;
        }

        setConnectionStatus('none');
        setLoading(false);
      } catch (error) {
        console.error("Error checking connection:", error);
        setLoading(false);
      }
    };

    checkConnectionStatus();
  }, [participant.user_email, user.email]);

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        theme === 'dark'
          ? 'bg-gray-700 border-gray-600'
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      <button
        onClick={() => onViewProfile(participant)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3 mb-2">
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
      
      {loading ? (
        <Button
          size="sm"
          disabled
          variant="outline"
          className="w-full text-xs"
        >
          Loading...
        </Button>
      ) : connectionStatus === 'connected' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(createPageUrl("Chat"))}
          className="w-full text-xs"
        >
          <MessageSquare className="w-3 h-3 mr-1" />
          Send Message
        </Button>
      ) : connectionStatus === 'pending' ? (
        <Button
          size="sm"
          disabled
          variant="outline"
          className="w-full text-xs text-gray-500"
        >
          Request Pending...
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onConnect(participant.user_email)}
          className="w-full text-xs"
        >
          <UserPlus className="w-3 h-3 mr-1" />
          Request to Connect
        </Button>
      )}
    </div>
  );
}