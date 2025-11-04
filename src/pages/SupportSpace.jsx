
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleHeart, Send, Loader2, Info } from "lucide-react";
import VoiceTaskInput from "../components/tasks/VoiceTaskInput";

export default function SupportSpace() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const specialMode = localStorage.getItem('special_mode') || 'normal';

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

  const handleVoiceTranscription = (text) => {
    setCurrentInput(prev => prev ? `${prev} ${text}` : text);
  };

  const handleSend = async () => {
    if (!currentInput.trim()) return;
    
    const userMessage = currentInput.trim();
    setCurrentInput("");
    
    // Add user message to chat
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const context = await gatherUserContext();
      
      // Build conversation history for context
      const conversationHistory = messages.map(m => 
        `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`
      ).join('\n\n');

      // Check if this is the first message (no previous messages)
      const isFirstMessage = messages.length === 0;

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

USER'S CURRENT MESSAGE: "${userMessage}"

YOUR RESPONSE GUIDELINES:
1. **ACTUALLY READ AND RESPOND TO WHAT THEY JUST SAID** - Don't give generic advice. Address their specific situation, question, or feeling.
2. **VALIDATE FIRST** - Acknowledge their feelings. People with ADHD/AuDHD constantly question themselves and need to hear "your feelings make sense" or "that's completely valid"
3. **UNDERSTAND THE CONTEXT** - Are they venting? Asking for advice? Seeking validation? Respond accordingly
4. **BE A FRIEND, NOT A COACH** - Unless they're specifically asking for productivity help, don't make this about tasks or optimization
5. **KEEP IT CONVERSATIONAL** - 2-3 short paragraphs. Write like you're texting a friend, not giving a lecture
6. **ASK FOLLOW-UP QUESTIONS** - Show you're engaged and want to understand more
7. **USE THEIR CONTEXT WISELY** - Only reference tasks/productivity data if it's actually relevant to what they said
8. **DON'T USE THEIR NAME IN EVERY MESSAGE** - Only use their name in the first message or when specifically appropriate

Examples of GOOD responses:
- If they say "I feel like I'm failing at everything": Validate their overwhelm, DON'T immediately list their completed tasks. Ask what's making them feel that way.
- If they say "My partner doesn't understand me": Focus on the relationship, NOT their productivity stats
- If they say "I can't get anything done": NOW you can reference their tasks/energy, because it's relevant
- If they ask a specific question: ANSWER THAT QUESTION. Don't deflect to generic advice.

Respond naturally, warmly, and like you genuinely care about understanding them. Most importantly: READ what they actually said and respond to THAT.`;

      const response = await base44.integrations.Core.InvokeLLM({ prompt });
      
      // Add AI response to chat
      setMessages(prev => [...prev, { role: "assistant", content: response }]);

      // Save to database (create new conversation or update existing)
      if (!conversationId) {
        const newConv = await base44.entities.SupportConversation.create({
          user_message: userMessage,
          ai_response: response,
          conversation_date: new Date().toISOString(),
          tags: ["ongoing_conversation"]
        });
        setConversationId(newConv.id);
      } else {
        // Update existing conversation with full history
        const fullHistory = [...messages, 
          { role: "user", content: userMessage },
          { role: "assistant", content: response }
        ];
        
        await base44.entities.SupportConversation.update(conversationId, {
          user_message: fullHistory.filter(m => m.role === 'user').map(m => m.content).join('\n---\n'),
          ai_response: fullHistory.filter(m => m.role === 'assistant').map(m => m.content).join('\n---\n')
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
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setCurrentInput("");
  };

  return (
    <div className="p-4 md:p-8 w-full">
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
            <CardContent className="p-6 space-y-4">
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

              <div className="flex gap-2 mb-3">
                <VoiceTaskInput
                  onTranscription={handleVoiceTranscription}
                  theme={theme}
                  inline={false}
                />
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
                placeholder="What's on your mind? (Press Enter to send, Shift+Enter for new line)"
                className="min-h-[120px] text-base"
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
                    This is AI-generated support for understanding and validation. Not a substitute for professional mental health care.
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

            {/* Input area */}
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
                <div className="flex gap-2">
                  <VoiceTaskInput
                    onTranscription={handleVoiceTranscription}
                    theme={theme}
                    inline={false}
                  />
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
