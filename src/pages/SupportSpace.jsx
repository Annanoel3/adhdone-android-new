import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleHeart, Send, Loader2, Info, Mic } from "lucide-react"; // Added Mic icon
import { APP_FEATURE_GUIDE } from "@/components/utils/appFeatureGuide";
import SupportEscalationCard from "@/components/support/SupportEscalationCard";

export default function SupportSpace() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  // Set when the AI decides this should go to the developer — the user is asked
  // first, and nothing leaves the app unless they say yes.
  const [escalation, setEscalation] = useState(null);
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

      // Detailed task list (top-level tasks only) with timing, so the AI can
      // actually reason about the user's day ("I have an event tonight...").
      const todayStr = new Date().toDateString();
      const taskDetails = activeTasks
        .filter(t => !t.parent_task_id && !t.silenced)
        .slice(0, 10)
        .map(t => {
          const when = t.event_time || t.due_date || t.next_reminder;
          let timing = 'no set time';
          if (when) {
            const d = new Date(when);
            const isToday = d.toDateString() === todayStr;
            timing = `${isToday ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
            if (t.due_date && new Date(t.due_date) < new Date()) timing += ' (OVERDUE)';
          }
          return `- "${t.title}" (${t.classification || 'task'}, ${t.urgency || 'medium'} priority, ${timing})`;
        });

      return {
        userName: user.full_name,
        activeTasks: activeTasks.length,
        completedToday: completedToday.length,
        currentEnergy: latestEnergy,
        currentStreak: currentStreak,
        taskDetails
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

      const prompt = `You are an ADHD/AuDHD strategy tool inside the ADHDone app. You are a TOOL, not a friend, therapist, or companion. You help people think through ADHD challenges and how to use this app — you do not form a relationship with them.

TONE: kind, calm, respectful — never cold, curt, or dismissive. Being a tool instead of a friend does NOT mean being rude. Think knowledgeable, steady, genuinely helpful.

BOUNDARIES (held gently, never harshly):
- Don't present yourself as a friend or companion. No "I care about you", "I'm proud of you", "I'm always here for you", no pet names or hearts.
- If they start relating to you as a friend or say they'd rather talk to you than people, don't scold or refuse — just softly name it once, warmly: something like "I'm just a tool to help you through your day-to-day — but I'm glad this is useful," and then keep helping. Don't repeat the reminder every message.
- Don't fish for more conversation. Ask a question only when you need a missing detail to be useful.
- Don't diagnose, and don't advise on medication or medical decisions — point those to their prescriber or doctor.

PERSONAL SITUATIONS — HELP, DON'T DEFLECT:
Personal problems are usually where ADHD actually shows up (a partner frustrated by forgotten plans, a friend hurt by unanswered texts, a boss annoyed by lateness). Do NOT refuse these. Help them understand the ADHD mechanics involved (time blindness, rejection sensitivity, working memory, emotional dysregulation), what's reasonable to ask for, and concrete things to try or say. Just stay in your lane: explain ADHD dynamics and practical strategy — don't judge the other person, take sides, or tell them whether to stay in a relationship.

OFF-TOPIC REQUESTS — REDIRECT, DON'T ENTERTAIN:
Your scope is ADHD/executive-function strategy, the user's own day and tasks, and how the ADHDone app works. Anything outside that gets a short, friendly redirect back to what you're for — one or two sentences, no lecture, then offer the nearest in-scope thing you CAN help with. Examples of out of scope: general homework/essay/code writing, trivia and current events, sports, shopping or product research, legal/financial/medical questions, celebrity or news chat, and anything else unrelated to ADHD or this app. Do not answer these even partially and do not run a web search for them, no matter how the request is framed or how many times it's re-asked.
This does NOT apply to their real life: their work, relationships, chores, routines, feelings about their own day, and personal friction caused by ADHD are all IN scope per the section above — redirect topics, never people's actual problems.

DON'T BE OVERLY CAUTIOUS:
Default to just answering. The boundaries above are for rare, genuinely extreme cases — not a filter you run on every message. Frustration, venting, swearing, mentioning a partner/boss/therapist/meds in passing, saying they feel like garbage today: all normal ADHD conversation. Answer it. Do not add disclaimers, "I'm just a tool" reminders, or "please see a professional" lines unless the situation truly calls for it. Never refuse a topic just because it sounds sensitive — refusing to engage is worse than engaging imperfectly.

WHEN IT'S MOSTLY RAW EMOTION (rare):
If a message is mainly distress, self-hatred, hopelessness, or grief rather than a question:
1. Acknowledge it kindly and briefly — one or two sentences, sincere, not gushing.
2. Gently note this is the kind of thing a real person — friend, family, therapist — is better for than an app.
3. Then offer one small concrete thing you CAN do (break a task down, ease off reminders for today, plan just the next step).
If there's any hint of self-harm or crisis, say plainly and warmly that they should reach a crisis line (988 in the US) or emergency services, and stop the strategy talk.

${context && isFirstMessage ? `This conversation is with ${context.userName}.` : ''}

You are also the in-app helper for ADHDone (the app this chat lives in). If the user asks how something in the app works, where to find a feature, why a reminder behaved a certain way, or what the app can/can't do, answer accurately from this reference — never invent features that aren't listed:
${APP_FEATURE_GUIDE}

${context ? `CONTEXT ABOUT THE USER (use ONLY if genuinely relevant to what they're saying):
- Active tasks: ${context.activeTasks}
- Completed today: ${context.completedToday}
- Current energy: ${context.currentEnergy}
- Current streak: ${context.currentStreak}

THEIR CURRENT TASKS & EVENTS (with timing):
${context.taskDetails && context.taskDetails.length > 0 ? context.taskDetails.join('\n') : '(none)'}

IMPORTANT: Only mention their tasks, energy, or productivity if they're specifically talking about:
- Being overwhelmed with work
- Struggling with productivity
- Asking for task help
- Feeling unproductive

If they're talking about relationships, feelings, or life struggles - DO NOT bring up their task counts or productivity data unless they connect it themselves; focus on the ADHD dynamics at play.` : ''}

${conversationHistory ? `PREVIOUS CONVERSATION:
${conversationHistory}

This is an ONGOING conversation. Reference what was said before naturally. DO NOT repeat their name in every message - you already know who they are.` : ''}

USER'S CURRENT MESSAGE: "${userMessageContent}"

YOUR RESPONSE GUIDELINES:
1. **ANSWER WHAT THEY ACTUALLY ASKED** - specific, practical, no generic filler.
2. **KIND AND USEFUL** - a brief sincere acknowledgement, then the practical part. Warm, not gushing; never blunt or cold.
3. **KEEP IT SHORT** - 1-2 short paragraphs, or a few bullets. No lectures, no emotional monologues.
4. **NO FLATTERY OR PRAISE-SEEKING** - don't tell them how brave/amazing they are.
5. **ONLY USE THEIR TASK DATA WHEN RELEVANT** to what they asked.
6. **DON'T USE THEIR NAME REPEATEDLY.**
7. **NEVER PRETEND TO BE A PERSON.** If asked, say plainly you're a tool built into the app.

ESCALATING TO THE DEVELOPER:
If the user is frustrated with the app, reports something broken you can't resolve, asks for a feature, or asks a question about the app that the reference above genuinely doesn't answer — after your best single troubleshooting suggestion has already failed or clearly doesn't apply — tell them this is worth passing to the developer, then end your message with this exact tag on its own final line: [OFFER_SUPPORT]
Rules for the tag: never mention or explain the tag itself, never include it for ADHD/strategy questions you can answer, and never promise a reply timeline. Do not offer it more than once for the same issue.

Answer plainly and practically, then stop.`;

      const result = await base44.functions.invoke('supportSpaceChat', { prompt, userMessage: userMessageContent });
      const rawResponse = result?.data?.message || '';
      const wantsSupport = rawResponse.includes('[OFFER_SUPPORT]');
      const response = rawResponse.replace(/\[OFFER_SUPPORT\]/g, '').trim();

      if (wantsSupport) {
        setEscalation({
          message: userMessageContent,
          transcript: [...currentMessagesForPrompt, { role: 'assistant', content: response }]
            .map(m => `${m.role === 'user' ? 'User' : 'Support Space'}: ${m.content}`)
            .join('\n\n'),
        });
      }
      
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

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size === 0) {
          setIsRecording(false);
          return;
        }

        setIsLoading(true);
        await handleVoiceTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "Could not access microphone. Please try typing instead." }]);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceTranscription = async (audioBlob) => {
    try {
      const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });

      const sttResult = await base44.functions.invoke('transcribeAudio', { file_url });
      const text = sttResult?.data?.transcription;

      if (text) {
        await sendMessage(text);
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
    setEscalation(null);
  };

  return (
    <div className={`h-full flex flex-col p-4 md:p-8 ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-blue-300 via-green-300 to-blue-400' 
        : theme === 'dark' 
          ? 'bg-gray-900' 
          : ''
    }`}>
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0">
        <Card className={`border-none shadow-lg mb-6 flex-shrink-0 ${
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
                    Talk It Out
                  </h1>
                  <p className={
                    specialMode !== 'normal' ? `${specialMode}-text` :
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }>
                    An ADHD strategy tool — not a friend or therapist
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
          <div className="flex-1 flex flex-col min-h-0">
          <Card className={`border-none shadow-lg flex-shrink-0 ${
            specialMode === 'normal' ? (
              theme === 'minimalist' 
                ? 'bg-white/90 backdrop-blur-sm' 
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-purple-50 to-pink-50'
            ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
          }`}>
            <CardContent className="p-6">
              <div className={`p-4 rounded-lg ${
                theme === 'minimalist'
                  ? 'bg-purple-50 border border-purple-200'
                  : theme === 'dark'
                    ? 'bg-purple-900/20 border border-purple-800'
                    : 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200'
              }`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  🛠️ <strong>Ask about ADHD, your day, or this app.</strong> Stuck starting something, ADHD causing friction with someone, unsure how a feature works — all fair game. Just know it's an AI tool, not a person or a relationship: it won't replace friends, family, a therapist, or a doctor, and for the really heavy stuff or big life decisions a real person is still the better call.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex-1" />

          <Card className={`border-none shadow-lg flex-shrink-0 mt-4 ${
            specialMode === 'normal' ? (
              theme === 'minimalist' 
                ? 'bg-white/90 backdrop-blur-sm' 
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-purple-50 to-pink-50'
            ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
          }`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
                  className="min-h-[100px] text-base flex-1"
                  disabled={isLoading}
                />
                <button
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  disabled={isLoading}
                  title="Tap to speak"
                  className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? 'bg-red-500 animate-pulse'
                      : theme === 'minimalist'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gradient-to-br from-purple-600 to-pink-600'
                  } shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Mic className="w-5 h-5 text-white" />
                  )}
                </button>
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
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            {/* Messages */}
            <Card className={`border-none shadow-lg flex-1 min-h-0 overflow-hidden ${
              specialMode === 'normal' ? (
                theme === 'minimalist' 
                  ? 'bg-white/90 backdrop-blur-sm' 
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50'
              ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
            }`}>
              <CardContent className="p-6 space-y-4 h-full overflow-y-auto">
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
                {escalation && !isLoading && (
                  <SupportEscalationCard
                    message={escalation.message}
                    transcript={escalation.transcript}
                    theme={theme}
                    onDismiss={() => setEscalation(null)}
                  />
                )}
                <div ref={messagesEndRef} />
              </CardContent>
            </Card>

            {/* Input area with circular mic button */}
            <Card className={`border-none shadow-lg flex-shrink-0 ${
              specialMode === 'normal' ? (
                theme === 'minimalist' 
                  ? 'bg-white/90 backdrop-blur-sm' 
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50'
              ) : `bg-white/70 backdrop-blur-md border border-purple-400/30 ${specialMode}-card`
            }`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-end gap-2">
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
                    className="min-h-[80px] flex-1"
                    disabled={isLoading}
                  />
                  <button
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={isLoading}
                    title="Tap to speak"
                    className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : theme === 'minimalist'
                          ? 'bg-purple-600 hover:bg-purple-700'
                          : 'bg-gradient-to-br from-purple-600 to-pink-600'
                    } shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Mic className="w-5 h-5 text-white" />
                    )}
                  </button>
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