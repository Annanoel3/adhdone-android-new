
import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, Loader2, ArrowLeft, Info } from "lucide-react";
import { User } from "@/entities/User";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { ChatMessage } from "@/entities/ChatMessage";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { sendAccountabilityMessage } from "../components/utils/notificationHelper";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function Chat() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const pollingIntervalRef = useRef(null);
  const messagesEndRef = useRef(null); // RE-INTRODUCED useRef for scrolling

  useEffect(() => {
    initChat();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => {
      clearInterval(interval);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Removed the useEffect that scrolled to the bottom on messages change. (As per original comment)

  const initChat = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);

      // Get partner email from URL if specified
      const urlParams = new URLSearchParams(window.location.search);
      const partnerEmail = urlParams.get('partner');

      // Get all accepted connections
      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      const myConnections = connections.filter(c =>
        c.requester_email === currentUser.email || c.recipient_email === currentUser.email
      );

      // Build conversations list
      const convos = await Promise.all(myConnections.map(async (connection) => {
        const isRequester = connection.requester_email === currentUser.email;
        const partnerInfo = {
          email: isRequester ? connection.recipient_email : connection.requester_email,
          display_name: isRequester ? connection.recipient_name : connection.requester_name,
          profile_picture_url: isRequester ? connection.recipient_picture : connection.requester_picture,
          connection: connection
        };

        // Get unread count
        const allMessages = await ChatMessage.filter({ connection_id: connection.id });
        const unreadCount = allMessages.filter(m =>
          m.sender_email === partnerInfo.email &&
          m.recipient_email === currentUser.email &&
          !m.read_by_recipient
        ).length;

        // Get last message
        const sortedMessages = allMessages.sort((a, b) =>
          new Date(b.created_date) - new Date(a.created_date)
        );
        const lastMessage = sortedMessages[0];

        return {
          ...partnerInfo,
          unreadCount,
          lastMessage: lastMessage ? {
            text: lastMessage.message_text,
            time: lastMessage.created_date,
            fromMe: lastMessage.sender_email === currentUser.email
          } : null
        };
      }));

      // Sort by most recent message
      convos.sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0;
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.time) - new Date(a.lastMessage.time);
      });

      setConversations(convos);

      // If partner email specified, open that chat
      if (partnerEmail) {
        const targetConvo = convos.find(c => c.email === partnerEmail);
        if (targetConvo) {
          openChat(targetConvo);
        }
      }

    } catch (error) {
      console.error("Error initializing chat:", error);
    }
    setIsLoading(false);
  };

  const openChat = async (partner) => {
    setSelectedPartner(partner);
    setSelectedConnection(partner.connection);
    await loadMessages(partner.connection.id);

    // Start polling for new messages
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = setInterval(() => {
      loadMessages(partner.connection.id, false);
    }, 3000);
  };

  const closeChat = () => {
    setSelectedPartner(null);
    setSelectedConnection(null);
    setMessages([]);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    initChat(); // Refresh conversation list
  };

  const loadMessages = async (connectionId, showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);

      const allMessages = await ChatMessage.filter({
        connection_id: connectionId
      }, 'created_date', 100);

      setMessages(allMessages);

      // Mark messages as read
      const unreadMessages = allMessages.filter(m =>
        m.sender_email !== user?.email && !m.read_by_recipient
      );

      for (const msg of unreadMessages) {
        await ChatMessage.update(msg.id, { read_by_recipient: true });
      }

      if (showLoading) setIsLoading(false);
    } catch (error) {
      console.error("Error loading messages:", error);
      if (showLoading) setIsLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConnection || isSending) return;

    setIsSending(true);

    try {
      const message = await ChatMessage.create({
        connection_id: selectedConnection.id,
        sender_email: user.email,
        recipient_email: selectedPartner.email,
        message_text: newMessage.trim(),
        read_by_recipient: false
      });

      setMessages(prev => [...prev, message]);
      setNewMessage("");

      // Send notification - using correct function name
      await sendAccountabilityMessage( // Changed function name here
        selectedPartner.email,
        user.display_name || user.full_name,
        newMessage.trim()
      );

      // Scroll to bottom after sending
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);

    } catch (error) {
      console.error("Error sending message:", error);
      // Removed alert as per outline implies
    }

    setIsSending(false);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-purple-600" />
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Loading chats...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show conversation list
  if (!selectedPartner) {
    return (
      <div className="p-4 md:p-8 w-full" style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
        <div className="max-w-6xl mx-auto">
          <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
            specialMode === 'normal' ? (
              theme === 'minimalist'
                ? 'bg-white/90 backdrop-blur-sm'
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-blue-50 to-purple-50'
            ) : ''
          }`}>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h1 className={`text-3xl font-bold ${
                    specialMode !== 'normal' ? `${specialMode}-title` :
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Chat
                  </h1>
                  <Popover>
                    <PopoverTrigger asChild>
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
                        <h4 className="font-semibold">About Chat</h4>
                        <p className="text-sm text-gray-600">
                          Message your accountability partners directly. Stay connected, share updates, and support each other on your productivity journey.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <p className={
                  specialMode !== 'normal' ? `${specialMode}-text` :
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }>
                  Message your accountability partners
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-none shadow-lg ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <CardContent className="p-6">
              {conversations.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className={`w-12 h-12 mx-auto mb-4 ${
                    theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                  }`} />
                  <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>
                    No conversations yet. Connect with accountability partners to start chatting!
                  </p>
                  <Button
                    onClick={() => navigate(createPageUrl("Accountability"))}
                    className={`mt-4 ${
                      theme === 'minimalist'
                        ? 'bg-green-600 hover:bg-green-700'
                        : theme === 'dark'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }`}
                  >
                    Find Partners
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((convo) => (
                    <button
                      key={convo.email}
                      onClick={() => openChat(convo)}
                      className={`w-full p-4 rounded-lg border transition-all text-left ${
                        theme === 'dark'
                          ? 'border-gray-700 hover:bg-gray-700/50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="w-12 h-12 flex-shrink-0">
                          <AvatarImage src={convo.profile_picture_url} className="object-cover" />
                          <AvatarFallback className={
                            theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                          }>
                            {convo.display_name?.[0]?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className={`font-semibold truncate ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                              {convo.display_name}
                            </h4>
                            {convo.lastMessage && (
                              <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                {new Date(convo.lastMessage.time).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {convo.lastMessage ? (
                            <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {convo.lastMessage.fromMe ? 'You: ' : ''}
                              {convo.lastMessage.text}
                            </p>
                          ) : (
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                              No messages yet
                            </p>
                          )}
                        </div>

                        {convo.unreadCount > 0 && (
                          <Badge className="bg-red-500 text-white">
                            {convo.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Android Navigation Button Spacer */}
          <div style={{ height: '120px' }} aria-hidden="true"></div>
        </div>
      </div>
    );
  }

  // Show individual chat
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Card className={`border-none shadow-lg h-[calc(100vh-200px)] flex flex-col ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardHeader className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={closeChat}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Avatar className="w-10 h-10">
              <AvatarImage src={selectedPartner?.profile_picture_url} className="object-cover" />
              <AvatarFallback className={
                theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
              }>
                {selectedPartner?.display_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className={theme === 'dark' ? 'text-gray-100' : ''}>
                {selectedPartner?.display_name}
              </CardTitle>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {selectedPartner?.email}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className={`w-12 h-12 mx-auto mb-4 ${
                theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
              }`} />
              <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender_email === user?.email ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] rounded-lg p-3 ${
                  message.sender_email === user?.email
                    ? theme === 'minimalist'
                      ? 'bg-green-600 text-white'
                      : theme === 'dark'
                        ? 'bg-green-700 text-white'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                    : theme === 'dark'
                      ? 'bg-gray-700 text-gray-100'
                      : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{message.message_text}</p>
                  <p className={`text-xs mt-1 ${
                    message.sender_email === user?.email ? 'text-white/70' : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} /> {/* RE-INTRODUCED messagesEndRef div */}
        </CardContent>

        <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              disabled={isSending}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              className={theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
      {/* Android Navigation Button Spacer */}
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
