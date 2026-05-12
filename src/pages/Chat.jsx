import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, Loader2, ArrowLeft, Info, Flag, MoreVertical, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { User } from "@/entities/User";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { ChatMessage } from "@/entities/ChatMessage";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { validateContent } from "../components/utils/contentModeration";
import { base44 } from "@/api/base44Client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ReportContentDialog from "../components/shared/ReportContentDialog";

export default function Chat() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPartner, setCurrentPartner] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [reportingUser, setReportingUser] = useState(null);
  const [showReportUserDialog, setShowReportUserDialog] = useState(false);
  const [reportingChatMessage, setReportingChatMessage] = useState(null);
  const [moderationWarning, setModerationWarning] = useState(null);
  const [pendingMessage, setPendingMessage] = useState(null);

  const pollingIntervalRef = useRef(null);
  const messagesEndRef = useRef(null);

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

  const initChat = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);

      const urlParams = new URLSearchParams(window.location.search);
      const partnerEmail = urlParams.get('partner');

      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      const myConnections = connections.filter(c =>
        c.requester_email === currentUser.email || c.recipient_email === currentUser.email
      );

      const convos = await Promise.all(myConnections.map(async (connection) => {
        const isRequester = connection.requester_email === currentUser.email;
        const partnerInfo = {
          email: isRequester ? connection.recipient_email : connection.requester_email,
          display_name: isRequester ? connection.recipient_name : connection.requester_name,
          profile_picture_url: isRequester ? connection.recipient_picture : connection.requester_picture,
          connection: connection
        };

        const allMessages = await ChatMessage.filter({ connection_id: connection.id });
        const unreadCount = allMessages.filter(m =>
          m.sender_email === partnerInfo.email &&
          m.recipient_email === currentUser.email &&
          !m.read_by_recipient
        ).length;

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

      convos.sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0;
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.time) - new Date(a.lastMessage.time);
      });

      setConversations(convos);

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
    setCurrentPartner(partner);
    setCurrentConversation(partner.connection);
    await loadMessages(partner.connection.id);

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = setInterval(() => {
      loadMessages(partner.connection.id, false);
    }, 3000);
  };

  const closeChat = () => {
    setCurrentPartner(null);
    setCurrentConversation(null);
    setMessages([]);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    initChat();
  };

  const loadMessages = async (connectionId, showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);

      const allMessages = await ChatMessage.filter({
        connection_id: connectionId
      }, 'created_date', 100);

      setMessages(allMessages);

      const unreadMessages = allMessages.filter(m =>
        m.sender_email !== user?.email && !m.read_by_recipient
      );

      for (const msg of unreadMessages) {
        await ChatMessage.update(msg.id, { read_by_recipient: true });
      }

      setConversations(prevConvos =>
        prevConvos.map(convo =>
          convo.connection.id === connectionId
            ? { ...convo, unreadCount: 0 }
            : convo
        )
      );

      if (showLoading) setIsLoading(false);
    } catch (error) {
      console.error("Error loading messages:", error);
      if (showLoading) setIsLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentConversation || isSending) return;

    setIsSending(true);

    // MODERATION: Check for inappropriate content
    const validationResult = await validateContent(newMessage.trim(), 'message');
    
    // Block inappropriate content (profanity, personal info, predatory behavior, etc.)
    if (!validationResult.valid && validationResult.requiresBlock) {
      alert(validationResult.message);
      setIsSending(false);
      return;
    }

    // Show warning for negative tone (but let user send anyway)
    if (validationResult.needsWarning && validationResult.warningMessage) {
      setPendingMessage(newMessage.trim());
      setModerationWarning({
        type: 'tone',
        message: validationResult.warningMessage,
        suggestion: validationResult.toneSuggestion
      });
      setIsSending(false);
      return;
    }

    // Send the message
    await sendChatMessage(newMessage.trim());
  };

  const sendChatMessage = async (messageText) => {
    setIsSending(true);
    setNewMessage("");
    setModerationWarning(null);
    setPendingMessage(null);

    try {
      const newMsg = await ChatMessage.create({
        connection_id: currentConversation.id,
        sender_email: user.email,
        recipient_email: currentPartner.email,
        message_text: messageText,
        read_by_recipient: false
      });

      setMessages(prev => [...prev, newMsg]);

      try {
        await base44.functions.invoke('notifySend', {
          toUserId: currentPartner.email,
          title: `💬 Message from ${user.display_name || user.full_name}`,
          body: messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText,
          screen: '/chat'
        });
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
      }

      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);

    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
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

  if (!currentPartner) {
    return (
      <div className="p-4 md:p-8 w-full" style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
        <div className="max-w-6xl mx-auto">
          <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
            specialMode === 'normal' ? (
              theme === 'minimalist'
                ? 'bg-white/90 backdrop-blur-sm'
                : theme === 'dark'
                  ? 'bg-gray-900/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-blue-50 to-purple-50'
            ) : ''
          }`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                
                {conversations.length > 0 && (
                  <Button
                    onClick={() => navigate(createPageUrl("Accountability") + "?tab=find")}
                    size="sm"
                    className={`${
                      theme === 'minimalist'
                        ? 'bg-green-600 hover:bg-green-700'
                        : theme === 'dark'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }`}
                  >
                    New Message
                  </Button>
                )}
              </div>
              <p className={`mt-2 ${
                specialMode !== 'normal' ? `${specialMode}-text` :
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Message your accountability partners
              </p>
            </CardContent>
          </Card>

          <Card className={`border-none shadow-lg ${
            theme === 'dark' ? 'bg-gray-900/90' : 'bg-white'
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

          <div style={{ height: '120px' }} aria-hidden="true"></div>
        </div>
      </div>
    );
  }

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
              <AvatarImage src={currentPartner?.profile_picture_url} className="object-cover" />
              <AvatarFallback className={
                theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
              }>
                {currentPartner?.display_name?.[0]?.toUpperCase() || currentPartner?.full_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className={theme === 'dark' ? 'text-gray-100' : ''}>
                {currentPartner?.display_name || currentPartner?.full_name}
              </CardTitle>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {currentPartner?.email}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setReportingUser(currentPartner);
                    setShowReportUserDialog(true);
                  }}
                  className="text-red-600"
                >
                  <Flag className="w-4 h-4 mr-2" />
                  Report User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                className={`flex ${message.sender_email === user?.email ? 'justify-end' : 'justify-start'} group`}
              >
                <div className="flex items-start gap-2">
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
                  {message.sender_email !== user?.email && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => setReportingChatMessage(message)}
                          className="text-red-600"
                        >
                          <Flag className="w-4 h-4 mr-2" />
                          Report Message
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
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

      <ReportContentDialog
        isOpen={showReportUserDialog}
        onClose={() => {
          setShowReportUserDialog(false);
          setReportingUser(null);
        }}
        contentType="user"
        reportedUserEmail={reportingUser?.email}
        reportedUserName={reportingUser?.display_name || reportingUser?.full_name}
        contentId={null}
        contentText={null}
        theme={theme}
      />

      <ReportContentDialog
        isOpen={!!reportingChatMessage}
        onClose={() => setReportingChatMessage(null)}
        contentType="message"
        reportedUserEmail={reportingChatMessage?.sender_email}
        reportedUserName={
          reportingChatMessage?.sender_email === user?.email
            ? user?.display_name || user?.full_name
            : currentPartner?.display_name || currentPartner?.full_name
        }
        contentId={reportingChatMessage?.id}
        contentText={reportingChatMessage?.message_text}
        theme={theme}
      />

      {/* Moderation Warning Dialog */}
      <Dialog open={!!moderationWarning} onOpenChange={() => setModerationWarning(null)}>
        <DialogContent className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <DialogTitle>Quick suggestion</DialogTitle>
            </div>
            <DialogDescription>
              You might want to edit this for positivity
            </DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-amber-50'} border ${theme === 'dark' ? 'border-gray-600' : 'border-amber-200'}`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              {moderationWarning?.suggestion}
            </p>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setModerationWarning(null)}
              className={theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : ''}
            >
              Edit
            </Button>
            <Button
              onClick={() => {
                if (pendingMessage) {
                  sendChatMessage(pendingMessage);
                }
              }}
              className={`${
                theme === 'minimalist'
                  ? 'bg-green-600 hover:bg-green-700'
                  : theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              Send Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}