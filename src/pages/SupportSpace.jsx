import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleHeart, Send, Loader2, Info, Mic } from "lucide-react"; // Added Mic icon

export default function SupportSpace() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const specialMode = localStorage.getItem('special_mode') || 'normal';

  // Ref to always get the latest 'messages' array in async operations
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const gatherUserContext = async () => {
    try {
      const user = await base44.auth.me();
      const tasks = await base44.entities.Task.list('-created_date', 20);
      const energyLogs = await base44.entities.EnergyLog.list('-logged_at', 5);
      const summaries = await base44.entities.DailySummary.list('-date', 7);

      const activeTasks = tasks.filter(t => t.status === 'active');
      const completedToday = tasks.filter(t => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const today = new Date().toISOString().split('T')[0];
        const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
        return completedDate === today;
      });

      const latestEnergy = energyLogs.length > 0 ? energyLogs[0].energy_level : 'unknown';
      const currentStreak = summaries.length > 0 ? summaries[0].streak_days || 0 : 0;

      return {
        userName: user.full_name,
        activeTasks: activeTasks.length,
        completedToday: completedToday.length,
        currentEnergy: latestEnergy,
        currentStreak: currentStreak,
        taskTitles: activeTasks.slice(0, 5).map(t => t.title)
      };
    } catch (error) {
      return null;
    }
  };

  // Centralized function to send messages (both text and voice)
  const sendMessage = useCallback(async (userMessageContent) => {
    if (!userMessageContent.trim()) return;

    const newUserMessage = { role: "user", content: userMessageContent.trim() };
    
    // Add user message to chat for immediate UI update
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const context = await gatherUserContext();
      
      // Use messagesRef.current to get the latest messages for prompt building
      // This includes messages that might have been added by previous async operations
      const currentMessagesForPrompt = [...messagesRef.current, newUserMessage];

      // Build conversation history for context
      const conversationHistory = currentMessagesForPrompt.map(m => 
        `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`
      ).join('\n\n');

      // Check if this is the first message (based on messagesRef.current before adding the new message)
      const isFirstMessage = messagesRef.current.length === 0;

      const prompt = `You are a supportive friend and advisor for someone with ADHD/AuDHD. Your PRIMARY goal is to make them feel heard, validated, and understood.

${context && isFirstMessage ? `This conversation is with ${context.userName}.` : ''}

${context ? `CONTEXT ABOUT THE USER (use ONLY if genuinely relevant to what they're saying):
- Active tasks: ${context.activeTasks}
- Completed today: ${context.completedToday}
- Current energy: ${context.currentEnergy}
- Current streak: ${context.currentStreak}

IMPORTANT: Only mention their tasks, energy, or productivity if they're specifically talking about:
- Being overwhelmed with work
- Struggling with productivity
- Asking for task help
- Feeling unproductive

If they're talking about relationships, feelings, life struggles, mental health, or anything non-productivity related - DO NOT bring up their tasks or data. Just be a supportive listener.` : ''}

${conversationHistory ? `PREVIOUS CONVERSATION:
${conversationHistory}

This is an ONGOING conversation. Reference what was said before naturally. DO NOT repeat their name in every message - you already know who they are.` : ''}

USER'S CURRENT MESSAGE: "${userMessageContent}"

YOUR RESPONSE GUIDELINES:
1. **ACTUALLY READ AND RESPOND TO WHAT THEY JUST SAID** - Don't give generic advice. Address their specific situation, question, or feeling.
2. **VALIDATE FIRST** - Acknowledge their feelings. People with ADHD/AuDHD constantly question themselves and need to hear "your feelings make sense" or "that's completely valid"
3. **UNDERSTAND THE CONTEXT** - Are they venting? Asking for advice? Seeking validation? Respond accordingly
4. **BE A FRIEND, NOT A COACH** - Unless they're specifically asking for productivity help, don't make this about tasks or optimization
5. **KEEP IT CONVERSATIONAL** - 2-3 short paragraphs. Write like you're texting a friend, not giving a lecture
6. **ASK FOLLOW-UP QUESTIONS** - Show you're engaged and want to understand more
7. **USE THEIR CONTEXT WISELY** - Only reference tasks/productivity data if it's actually relevant to what they said
8. **DON'T USE THEIR NAME IN EVERY MESSAGE** - Only use their name in the first message or when specifically appropriate

Respond naturally, warmly, and like you genuinely care about understanding them. Most importantly: READ what they actually said and respond to THAT.`;

      const result = await base44.functions.invoke('supportSpaceChat', { prompt });
      const response = result?.data?.message;
      
      // Add AI response to chat
      setMessages(prev => [...prev, { role: "assistant", content: response }]);

      // Save to database (create new conversation or update existing)
      const finalConversationForDb = [...currentMessagesForPrompt, { role: "assistant", content: response }];

      if (!conversationId) {
        const newConv = await base44.entities.SupportConversation.create({
          user_message: userMessageContent,
          ai_response: response,
          conversation_date: new Date().toISOString(),
          tags: ["ongoing_conversation"]
        });
        setConversationId(newConv.id);
      } else {
        await base44.entities.SupportConversation.update(conversationId, {
          user_message: finalConversationForDb.filter(m => m.role === 'user').map(m => m.content).join('\n---\n'),
          ai_response: finalConversationForDb.filter(m => m.role === 'assistant').map(m => m.content).join('\n---\n')
        });
      }
    } catch (error) {
      console.error("Error in conversation:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "I'm having trouble responding right now. Can you try again?" 
      }]);
    }
    
    setIsLoading(false);
  }, [conversationId, messagesRef]); // Depend on messagesRef.current to get latest messages state

  const handleSend = async () => {
    if (!currentInput.trim()) return;
    const userMessage = currentInput.trim();
    setCurrentInput(""); // Clear the input field after sending
    await sendMessage(userMessage);
  };

  const handleVoiceInput = async (file) => {
    if (!file) return;

    setIsLoading(true); // Indicate loading while transcribing
    try {
      const audioBase64 = await new Promise((resolve) => {
       const reader = new FileReader();
       reader.onloadend = () => resolve(reader.result.split(',')[1]);
       reader.readAsDataURL(file);
      });
      const sttResult = await base44.functions.invoke('transcribeAudio', { audio_base64: audioBase64, filename: file.name || 'audio.webm' });
      const transcription = sttResult?.data;
      if (transcription && transcription.text) {
        await sendMessage(transcription.text);
      } else {
        console.warn("No transcription received or transcription was empty.");
        setMessages(prev => [...prev, { role: "assistant", content: "I couldn't understand that. Could you please try again or type your message?" }]);
      }
    } catch (error) {
      console.error("Error during speech-to-text:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "There was an error processing your voice. Please try typing instead." }]);
    } finally {
      setIsLoading(false);
    }
  };


  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setCurrentInput("");
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-blue-300 via-green-300 to-blue-400' 
        : theme === 'dark' 
          ? 'bg-gray-900' 
          : ''
    }`}>
      <div className="max-w-4xl mx-auto">
        <Card className={`border-none shadow-lg mb-6 ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-purple-50 to-pink-50'
          ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
        }`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircleHeart className={`w-8 h-8 ${
                  specialMode !== 'normal' ? '' :
                  theme === 'minimalist' ? 'text-purple-600' : theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                }`} />
                <div>
                  <h1 className={`text-3xl font-bold ${
                    specialMode !== 'normal' ? `${specialMode}-title` :
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Support Space
                  </h1>
                  <p className={
                    specialMode !== 'normal' ? `${specialMode}-text` :
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }>
                    A safe space to talk about anything
                  </p>
                </div>
              </div>
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleNewConversation}
                  size="sm"
                >
                  New Conversation
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {messages.length === 0 ? (
          <Card className={`border-none shadow-lg ${
            specialMode === 'normal' ? (
              theme === 'minimalist' 
                ? 'bg-white/90 backdrop-blur-sm' 
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-purple-50 to-pink-50'
            ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
          }`}>
            <CardContent className="p-6 space-y-6">
              <div className={`p-4 rounded-lg ${
                theme === 'minimalist'
                  ? 'bg-purple-50 border border-purple-200'
                  : theme === 'dark'
                    ? 'bg-purple-900/20 border border-purple-800'
                    : 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200'
              }`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  💬 <strong>Talk about anything.</strong> Relationships, work, feelings, struggles - whatever's on your mind. This is a judgment-free zone.
                </p>
              </div>

              <div className="flex flex-col items-center gap-6">
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'audio/*';
                    input.capture = 'microphone';
                    input.onchange = async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      await handleVoiceInput(file);
                    };
                    input.click();
                  }}
                  disabled={isLoading}
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                    theme === 'minimalist'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-br from-purple-600 to-pink-600'
                  } shadow-2xl hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading ? (
                    <Loader2 className="w-16 h-16 text-white animate-spin" />
                  ) : (
                    <Mic className="w-16 h-16 text-white" />
                  )}
                </button>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Tap to Speak</p>
                <p className={`text-xs text-center max-w-md ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Speak naturally - your message will be transcribed and sent automatically
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className={`w-full border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`} />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className={`px-2 ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
                    Or type
                  </span>
                </div>
              </div>

              <Textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Or type your message here... (Press Enter to send, Shift+Enter for new line)"
                className="min-h-[100px] text-base"
                disabled={isLoading}
              />
              
              <div className={`p-4 rounded-lg ${
                theme === 'minimalist' 
                  ? 'bg-blue-50 border border-blue-100' 
                  : theme === 'dark'
                    ? 'bg-blue-900/20 border border-blue-800'
                    : 'bg-purple-100 border border-purple-200'
              }`}>
                <div className="flex items-start gap-2">
                  <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    This is AI-generated support for understanding and guidance. Not a substitute for professional mental health care.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSend}
                disabled={!currentInput.trim() || isLoading}
                className={`w-full ${
                  theme === 'minimalist' 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Messages */}
            <Card className={`border-none shadow-lg ${
              specialMode === 'normal' ? (
                theme === 'minimalist' 
                  ? 'bg-white/90 backdrop-blur-sm' 
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50'
              ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
            }`}>
              <CardContent className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? theme === 'minimalist'
                          ? 'bg-gray-100 ml-12'
                          : theme === 'dark'
                            ? 'bg-gray-700 ml-12'
                            : 'bg-purple-100 ml-12'
                        : theme === 'minimalist'
                          ? 'bg-purple-50 mr-12'
                          : theme === 'dark'
                            ? 'bg-purple-900/30 mr-12'
                            : 'bg-gradient-to-r from-purple-100 to-pink-100 mr-12'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {msg.role === 'assistant' && (
                        <div className={`p-2 rounded-full flex-shrink-0 ${
                          theme === 'minimalist' ? 'bg-purple-100' : theme === 'dark' ? 'bg-purple-900' : 'bg-purple-200'
                        }`}>
                          <MessageCircleHeart className={`w-4 h-4 ${
                            theme === 'minimalist' ? 'text-purple-600' : theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                          }`} />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className={`text-sm font-medium mb-1 ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                        }`}>
                          {msg.role === 'user' ? 'You' : 'Support'}
                        </p>
                        <p className={`leading-relaxed whitespace-pre-line ${
                          theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                        }`}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className={`p-4 rounded-lg mr-12 ${
                    theme === 'minimalist'
                      ? 'bg-purple-50'
                      : theme === 'dark'
                        ? 'bg-purple-900/30'
                        : 'bg-gradient-to-r from-purple-100 to-pink-100'
                  }`}>
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>Thinking...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </CardContent>
            </Card>

            {/* Input area with circular mic button */}
            <Card className={`border-none shadow-lg ${
              specialMode === 'normal' ? (
                theme === 'minimalist' 
                  ? 'bg-white/90 backdrop-blur-sm' 
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50'
              ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
            }`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'audio/*';
                      input.capture = 'microphone';
                      input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        await handleVoiceInput(file);
                      };
                      input.click();
                    }}
                    disabled={isLoading}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                      theme === 'minimalist'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gradient-to-br from-purple-600 to-pink-600'
                    } shadow-lg hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    ) : (
                      <Mic className="w-10 h-10 text-white" />
                    )}
                  </button>
                </div>
                <p className={`text-xs text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Tap to speak - message sends automatically</p>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className={`w-full border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`} />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className={`px-2 ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
                      Or type
                    </span>
                  </div>
                </div>

                <Textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Continue the conversation... (Press Enter to send)"
                  className="min-h-[80px]"
                  disabled={isLoading}
                />

                <Button
                  onClick={handleSend}
                  disabled={!currentInput.trim() || isLoading}
                  className={`w-full ${
                    theme === 'minimalist' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : theme === 'dark'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}