import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Loader2, Ban, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function FindPartners({ theme, user, onUpdate }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [myConnections, setMyConnections] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockingMe, setBlockingMe] = useState([]);
  const [blockingUser, setBlockingUser] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  const [sentRequests, setSentRequests] = useState(new Set());

  useEffect(() => {
    if (user) {
      loadConnections();
      loadBlockedUsers();
    }
  }, [user]);

  const loadConnections = async () => {
    try {
      const connections = await base44.entities.AccountabilityConnection.list();
      setMyConnections(connections);
    } catch (error) {
      console.error("Error loading connections:", error);
    }
  };

  const loadBlockedUsers = async () => {
    try {
      // Users I've blocked
      const blocked = await base44.entities.BlockedUser.filter({
        blocker_email: user.email
      });
      setBlockedUsers(blocked);

      // Users who blocked me (using service role)
      const blockingMeList = await base44.asServiceRole.entities.BlockedUser.filter({
        blocked_email: user.email
      });
      setBlockingMe(blockingMeList);
    } catch (error) {
      console.error("Error loading blocked users:", error);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await base44.functions.invoke('searchUsers', {
        query: searchQuery.trim()
      });

      if (response?.data?.users) {
        // Filter out blocked users and users who blocked me
        const blockedEmails = new Set(blockedUsers.map(b => b.blocked_email));
        const blockingMeEmails = new Set(blockingMe.map(b => b.blocker_email));
        
        const filteredResults = response.data.users.filter(u => 
          u.email !== user.email && 
          !blockedEmails.has(u.email) &&
          !blockingMeEmails.has(u.email)
        );
        
        setSearchResults(filteredResults);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    }
    setIsSearching(false);
  };

  const handleSendRequest = async (targetUser) => {
    // Prevent self-connection
    if (targetUser.email === user.email) {
      toast.error("You cannot send a connection request to yourself.");
      return;
    }

    try {
      await base44.entities.AccountabilityConnection.create({
        requester_email: user.email,
        requester_name: user.display_name || user.full_name,
        requester_picture: user.profile_picture_url,
        recipient_email: targetUser.email,
        recipient_name: targetUser.display_name || targetUser.full_name,
        recipient_picture: targetUser.profile_picture_url,
        status: 'pending'
      });

      // Send push notification to recipient
      try {
        await base44.functions.invoke('notifySend', {
          toUserId: targetUser.email,
          title: '🤝 New Partner Request!',
          body: `${user.display_name || user.full_name} wants to be your accountability partner`,
          screen: '/accountability?tab=requests'
        });
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
      }

      setSentRequests(prev => new Set([...prev, targetUser.email]));
      if (onUpdate) onUpdate();
      } catch (error) {
      console.error("Error sending connection request:", error);
      toast.error("Failed to send request. Please try again.");
      }
      };

  const handleBlockUser = async () => {
    if (!blockingUser) return;

    try {
      await base44.entities.BlockedUser.create({
        blocker_email: user.email,
        blocked_email: blockingUser.email,
        blocked_name: blockingUser.display_name || blockingUser.full_name,
        blocked_picture: blockingUser.profile_picture_url,
        reason: blockReason.trim() || null
      });

      // Remove from search results
      setSearchResults(prev => prev.filter(u => u.email !== blockingUser.email));
      
      // Remove any existing connections
      const existingConnections = myConnections.filter(c =>
        (c.requester_email === blockingUser.email && c.recipient_email === user.email) ||
        (c.recipient_email === blockingUser.email && c.requester_email === user.email)
      );
      
      for (const conn of existingConnections) {
        await base44.entities.AccountabilityConnection.delete(conn.id);
      }

      await loadBlockedUsers();
      await loadConnections();
      setBlockingUser(null);
      setBlockReason("");
      if (onUpdate) onUpdate();
      } catch (error) {
      console.error("Error blocking user:", error);
      toast.error("Failed to block user. Please try again.");
      }
      };

  const hasConnection = (targetEmail) => {
    return myConnections.some(c =>
      ((c.requester_email === user.email && c.recipient_email === targetEmail) ||
      (c.recipient_email === user.email && c.requester_email === targetEmail)) &&
      c.status === 'accepted'
    );
  };

  const hasPendingRequest = (targetEmail) => {
    return myConnections.some(c =>
      ((c.requester_email === user.email && c.recipient_email === targetEmail) ||
      (c.recipient_email === user.email && c.requester_email === targetEmail)) &&
      c.status === 'pending'
    );
  };

  return (
    <div className="space-y-6">
      <Card className={`border-none shadow-md ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className={theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card className={`border-none shadow-md ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="p-6 space-y-3">
            {searchResults.map((result) => (
              <div
                key={result.email}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  theme === 'dark'
                    ? 'border-gray-700 bg-gray-900/50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <Link to={createPageUrl("UserProfile") + `?email=${result.email}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="w-12 h-12 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                    <AvatarImage src={result.profile_picture_url} className="object-cover" />
                    <AvatarFallback className={
                      theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                    }>
                      {result.display_name?.[0]?.toUpperCase() || result.full_name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold truncate hover:underline ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                      {result.display_name || result.full_name}
                    </h3>
                    <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {result.email}
                    </p>
                    {result.level && (
                      <Badge variant="outline" className="text-xs mt-1">
                        Level {result.level}
                      </Badge>
                    )}
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                  {hasConnection(result.email) ? (
                    <Badge variant="outline" className="text-xs">
                      Connected
                    </Badge>
                  ) : hasPendingRequest(result.email) || sentRequests.has(result.email) ? (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                      Request Sent
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleSendRequest(result)}
                      className={theme === 'minimalist'
                        ? 'bg-green-600 hover:bg-green-700'
                        : theme === 'dark'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                      }
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Connect
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBlockingUser(result)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {blockedUsers.length > 0 && (
        <Card className={`border-none shadow-md ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                Blocked Users ({blockedUsers.length})
              </h3>
            </div>
            <div className="space-y-2">
              {blockedUsers.map((blocked) => (
                <div
                  key={blocked.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    theme === 'dark'
                      ? 'border-gray-700 bg-gray-900/50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      <AvatarImage src={blocked.blocked_picture} className="object-cover" />
                      <AvatarFallback className="bg-red-100 text-red-700">
                        {blocked.blocked_name?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {blocked.blocked_name}
                      </p>
                      <p className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {blocked.blocked_email}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await base44.entities.BlockedUser.delete(blocked.id);
                      await loadBlockedUsers();
                      toast.success(`Unblocked ${blocked.blocked_name}`);
                    }}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!blockingUser} onOpenChange={() => {
        setBlockingUser(null);
        setBlockReason("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block User</DialogTitle>
            <DialogDescription>
              Are you sure you want to block {blockingUser?.display_name || blockingUser?.full_name}? They won't be able to send you connection requests or see your profile on the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Reason for blocking (optional)"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBlockingUser(null);
              setBlockReason("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleBlockUser}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Ban className="w-4 h-4 mr-2" />
              Block User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}