
import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserX, Loader2, Ban, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AccountabilityPartners({ theme, user }) {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingPartner, setRemovingPartner] = useState(null);
  const [blockingPartner, setBlockingPartner] = useState(null);

  useEffect(() => {
    if (user) {
      loadPartners();
    }
  }, [user]);

  const loadPartners = async () => {
    try {
      const connections = await base44.entities.AccountabilityConnection.filter({
        status: 'accepted'
      });

      const myConnections = connections.filter(c =>
        c.requester_email === user.email || c.recipient_email === user.email
      );

      const partnersList = myConnections.map(connection => {
        const isRequester = connection.requester_email === user.email;
        return {
          connection_id: connection.id,
          email: isRequester ? connection.recipient_email : connection.requester_email,
          display_name: isRequester ? (connection.recipient_name || 'Unknown') : (connection.requester_name || 'Unknown'),
          profile_picture_url: isRequester ? connection.recipient_picture : connection.requester_picture,
          partner_streak: connection.partner_streak || 0,
        };
      });

      setPartners(partnersList);
    } catch (error) {
      console.error("Error loading partners:", error);
    }
    setIsLoading(false);
  };

  const handleRemovePartner = async (partner) => {
    try {
      await base44.entities.AccountabilityConnection.delete(partner.connection_id);
      setPartners(prev => prev.filter(p => p.connection_id !== partner.connection_id));
      setRemovingPartner(null);
    } catch (error) {
      console.error("Error removing partner:", error);
      alert("Failed to remove partner. Please try again.");
    }
  };

  const handleBlockPartner = async () => {
    if (!blockingPartner) return;

    try {
      // Create block record
      await base44.entities.BlockedUser.create({
        blocker_email: user.email,
        blocked_email: blockingPartner.email,
        blocked_name: blockingPartner.display_name,
        blocked_picture: blockingPartner.profile_picture_url
      });

      // Remove connection
      await base44.entities.AccountabilityConnection.delete(blockingPartner.connection_id);

      setPartners(prev => prev.filter(p => p.connection_id !== blockingPartner.connection_id));
      setBlockingPartner(null);
    } catch (error) {
      console.error("Error blocking partner:", error);
      alert("Failed to block partner. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <Card className={`border-none shadow-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-purple-600" />
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Loading partners...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (partners.length === 0) {
    return (
      <Card className={`border-none shadow-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <CardContent className="p-12 text-center">
          <p className={`mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            You don't have any accountability partners yet.
          </p>
          <Button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('tab', 'find');
              window.history.pushState({}, '', url);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className={theme === 'minimalist'
              ? 'bg-green-600 hover:bg-green-700'
              : theme === 'dark'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }
          >
            Find Partners
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={`border-none shadow-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <CardContent className="p-6 space-y-3">
          {partners.map((partner) => (
            <div
              key={partner.connection_id}
              className={`flex items-center gap-4 p-4 rounded-lg border ${
                theme === 'dark'
                  ? 'border-gray-700 bg-gray-900/50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <Link to={createPageUrl("UserProfile") + `?email=${partner.email}`} className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="w-12 h-12 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage src={partner.profile_picture_url} className="object-cover" />
                  <AvatarFallback className={
                    theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                  }>
                    {partner.display_name?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold truncate hover:underline ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    {partner.display_name}
                  </h3>
                  <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {partner.email}
                  </p>
                  {partner.partner_streak > 0 && (
                    <Badge variant="outline" className="text-xs mt-1">
                      🔥 {partner.partner_streak} day streak
                    </Badge>
                  )}
                </div>
              </Link>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(createPageUrl("Chat") + `?partner=${partner.email}`)}
                >
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Chat
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemovingPartner(partner)}
                  className="text-gray-600 hover:text-gray-700 hover:bg-gray-100"
                >
                  <UserX className="w-4 h-4" />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBlockingPartner(partner)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!removingPartner} onOpenChange={() => setRemovingPartner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Partner</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removingPartner?.display_name} as an accountability partner? You can always reconnect later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingPartner(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleRemovePartner(removingPartner)}
              variant="destructive"
            >
              <UserX className="w-4 h-4 mr-2" />
              Remove Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockingPartner} onOpenChange={() => setBlockingPartner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Partner</DialogTitle>
            <DialogDescription>
              Are you sure you want to block {blockingPartner?.display_name}? This will remove them as a partner and prevent them from contacting you or seeing your profile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockingPartner(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleBlockPartner}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Ban className="w-4 h-4 mr-2" />
              Block User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
