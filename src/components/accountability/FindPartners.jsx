import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Mail, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { User } from "@/entities/User";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function FindPartners({ theme, user, onUpdate }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [existingConnections, setExistingConnections] = useState([]);

  useEffect(() => {
    loadExistingConnections();
  }, [user]);

  const loadExistingConnections = async () => {
    if (!user?.email) return;
    
    try {
      const connections = await base44.entities.AccountabilityConnection.list();
      setExistingConnections(connections);
    } catch (error) {
      console.error("Error loading connections:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      console.log('[FindPartners] Searching for:', searchQuery);
      
      const response = await base44.functions.invoke('searchUsers', { 
        query: searchQuery.trim() 
      });
      
      console.log('[FindPartners] Search response:', response);
      
      const results = response.data?.users || [];
      
      console.log('[FindPartners] Results:', results);
      
      // Filter out current user (extra safety check)
      const filteredResults = results.filter(u => u.email !== user.email);
      setSearchResults(filteredResults);
    } catch (error) {
      console.error("[FindPartners] Error searching users:", error);
      alert("Failed to search users. Please try again.");
    }
    setIsSearching(false);
  };

  const getConnectionStatus = (targetEmail) => {
    if (!user?.email || !targetEmail) return { status: 'none', connection: null };
    
    const connection = existingConnections.find(c =>
      (c.requester_email === user.email && c.recipient_email === targetEmail) ||
      (c.recipient_email === user.email && c.requester_email === targetEmail)
    );

    if (!connection) return { status: 'none', connection: null };
    if (connection.status === 'accepted') return { status: 'connected', connection };
    if (connection.requester_email === user.email) return { status: 'sent', connection };
    return { status: 'received', connection };
  };

  const handleCancelRequest = async (connection) => {
    if (!connection) return;
    
    const confirmed = confirm("Cancel this connection request?");
    if (!confirmed) return;

    try {
      await base44.entities.AccountabilityConnection.delete(connection.id);
      await loadExistingConnections();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error canceling request:", error);
      alert("Failed to cancel request. Please try again.");
    }
  };

  const handleSendRequest = async () => {
    if (!selectedUser || !user?.email) {
      alert("Missing user information. Please try again.");
      return;
    }

    // Check if a connection already exists
    const existingConnection = existingConnections.find(c =>
      (c.requester_email === user.email && c.recipient_email === selectedUser.email) ||
      (c.recipient_email === user.email && c.requester_email === selectedUser.email)
    );

    if (existingConnection) {
      alert("A connection request already exists with this user!");
      setSelectedUser(null);
      setRequestMessage("");
      return;
    }

    setIsSending(true);
    try {
      console.log('[FindPartners] Creating connection request...');
      console.log('[FindPartners] Requester:', user.email);
      console.log('[FindPartners] Recipient:', selectedUser.email);
      
      // Make sure we have all required fields
      const connectionData = {
        requester_email: user.email,
        requester_name: user.display_name || user.full_name || 'Anonymous',
        requester_picture: user.profile_picture_url || '',
        recipient_email: selectedUser.email,
        recipient_name: selectedUser.display_name || selectedUser.full_name || 'Anonymous',
        recipient_picture: selectedUser.profile_picture_url || '',
        status: 'pending',
        message: requestMessage.trim() || ''
      };

      console.log('[FindPartners] Connection data:', connectionData);

      const connection = await base44.entities.AccountabilityConnection.create(connectionData);
      
      console.log('[FindPartners] Connection created successfully:', connection);

      setSelectedUser(null);
      setRequestMessage("");
      await loadExistingConnections();
      if (onUpdate) onUpdate();
      
      alert("Request sent successfully!");
    } catch (error) {
      console.error("[FindPartners] Error sending request:", error);
      console.error("[FindPartners] Error details:", error.message);
      console.error("[FindPartners] Error stack:", error.stack);
      alert("Failed to send request. Please try again.");
    }
    setIsSending(false);
  };

  return (
    <div className="space-y-6">
      <Card className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white/80 backdrop-blur-sm'} border-none shadow-md`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Find Accountability Partners
          </CardTitle>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Connect with other ADHDone users who are also looking for accountability partners
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              className="flex-1"
            />
            <Button 
              onClick={handleSearch}
              disabled={isSearching}
              className={
                theme === 'minimalist'
                  ? 'bg-green-600 hover:bg-green-700'
                  : theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }
            >
              <Search className="w-4 h-4 mr-2" />
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              <h3 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Search Results
              </h3>
              {searchResults.map((foundUser) => {
                const { status, connection } = getConnectionStatus(foundUser.email);
                
                return (
                  <div
                    key={foundUser.email}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      theme === 'dark' 
                        ? 'bg-gray-900/50 border-gray-700' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={foundUser.profile_picture_url} />
                        <AvatarFallback className={
                          theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                        }>
                          {(foundUser.display_name || foundUser.email)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {foundUser.display_name || 'Anonymous User'}
                        </p>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {foundUser.email}
                        </p>
                        {foundUser.looking_for_accountability && (
                          <Badge className="mt-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Looking for partners
                          </Badge>
                        )}
                      </div>
                    </div>

                    {status === 'none' && (
                      <Button
                        onClick={() => setSelectedUser(foundUser)}
                        size="sm"
                        className={
                          theme === 'minimalist'
                            ? 'bg-green-600 hover:bg-green-700'
                            : theme === 'dark'
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
                        }
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Connect
                      </Button>
                    )}

                    {status === 'sent' && (
                      <button
                        onClick={() => handleCancelRequest(connection)}
                        className="group"
                      >
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center gap-1">
                          Request Sent
                          <X className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Badge>
                      </button>
                    )}

                    {status === 'received' && (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        Pending Your Response
                      </Badge>
                    )}

                    {status === 'connected' && (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        Connected
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isSearching && searchQuery && searchResults.length === 0 && (
            <div className="text-center py-8">
              <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                No users found. Try a different search term.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Connection Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedUser && (
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={selectedUser.profile_picture_url} />
                  <AvatarFallback className="bg-purple-100 text-purple-700">
                    {(selectedUser.display_name || selectedUser.email)[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.display_name || 'Anonymous User'}</p>
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">
                Add a personal message (optional)
              </label>
              <Textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Hi! I'd love to be accountability partners..."
                className="min-h-[100px]"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedUser(null);
                  setRequestMessage("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendRequest}
                disabled={isSending}
                className={`flex-1 ${
                  theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : theme === 'dark'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
                }`}
              >
                <Mail className="w-4 h-4 mr-2" />
                {isSending ? 'Sending...' : 'Send Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}