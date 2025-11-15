import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { UserPlus, Check, X, Loader2, Clock, RefreshCw } from "lucide-react";

export default function ConnectionRequests({ theme, user }) {
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user]);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const allConnections = await AccountabilityConnection.list('-created_date');
      
      const received = allConnections.filter(c => 
        c.recipient_email === user.email && c.status === 'pending'
      );
      setRequests(received);

      const sent = allConnections.filter(c => 
        c.requester_email === user.email && c.status === 'pending'
      );
      setSentRequests(sent);
    } catch (error) {
      console.error("Error loading requests:", error);
    }
    setIsLoading(false);
  };

  const handleAccept = async (requestId) => {
    try {
      await AccountabilityConnection.update(requestId, { status: 'accepted' });
      await loadRequests();
    } catch (error) {
      console.error("Error accepting request:", error);
      alert("Failed to accept request");
    }
  };

  const handleDecline = async (requestId) => {
    try {
      await AccountabilityConnection.delete(requestId);
      await loadRequests();
    } catch (error) {
      console.error("Error declining request:", error);
      alert("Failed to decline request");
    }
  };

  if (isLoading) {
    return (
      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-purple-600" />
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Loading requests...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
              <UserPlus className="w-5 h-5" />
              Received Requests ({requests.length})
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={loadRequests}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8">
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                No pending connection requests
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div key={request.id} className={`p-4 rounded-lg border ${
                  theme === 'dark' ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'
                }`}>
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="w-12 h-12 flex-shrink-0">
                      {request.requester_picture ? (
                        <AvatarImage src={request.requester_picture} />
                      ) : (
                        <AvatarFallback className={
                          theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                        }>
                          {(request.requester_name || request.requester_email)[0].toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-semibold mb-1 break-words ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {request.requester_name || request.requester_email.split('@')[0]}
                      </h4>
                      <p className={`text-sm break-words ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {request.requester_email}
                      </p>
                      {request.message && (
                        <p className={`text-sm mt-2 italic break-words ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          "{request.message}"
                        </p>
                      )}
                      <Badge variant="outline" className="text-xs mt-2">
                        {new Date(request.created_date).toLocaleDateString()}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(request.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecline(request.id)}
                      className={`text-red-600 hover:text-red-700 ${
                        theme === 'dark' ? 'border-gray-600 hover:bg-red-900/20' : 'hover:bg-red-50'
                      }`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
            <Clock className="w-5 h-5" />
            Sent Requests ({sentRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sentRequests.length === 0 ? (
            <div className="text-center py-8">
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                No pending sent requests
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sentRequests.map((request) => (
                <div key={request.id} className={`p-4 rounded-lg border ${
                  theme === 'dark' ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-semibold mb-1 break-words ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {request.recipient_name || request.recipient_email.split('@')[0]}
                      </h4>
                      <p className={`text-sm break-words ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {request.recipient_email}
                      </p>
                      <Badge variant="outline" className="text-xs mt-2">
                        Sent {new Date(request.created_date).toLocaleDateString()}
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDecline(request.id)}
                      className={theme === 'dark' ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-600'}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}