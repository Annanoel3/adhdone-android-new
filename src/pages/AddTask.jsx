import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Mic, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { enqueueCapture } from "@/lib/pendingCaptures";

export default function AddTask() {
  const navigate = useNavigate();
  const location = useLocation();
  const presetDate = location.state?.presetDate;
  const presetDueDateISO = (() => {
    if (!presetDate) return null;
    const [py, pm, pd] = presetDate.split('-').map(n => parseInt(n, 10));
    if (isNaN(py) || isNaN(pm) || isNaN(pd)) return null;
    return new Date(py, pm - 1, pd, 23, 59, 0, 0).toISOString();
  })();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [inputMode, setInputMode] = useState('voice');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTheme(localStorage.getItem('adhd_theme') || 'minimalist');
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Hands the input off to the background processor and returns the user Home
  // immediately — the new task shows there with a spinner until it's ready.
  const submitCapture = (text) => {
    enqueueCapture({ text, presetDate, presetDueDateISO });
    navigate(createPageUrl("Home"), { state: { reload: true } });
  };

  // Text shared from another app (or typed into the quick-capture notification)
  // arrives via navigation state — run it through the normal pipeline as if the
  // user typed it. sharedAt keys the effect so two shares in a row both fire.
  const sharedText = location.state?.sharedText;
  const sharedAt = location.state?.sharedAt;
  React.useEffect(() => {
    if (!sharedText) return;
    submitCapture(sharedText);
  }, [sharedAt]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/ogg;codecs=opus';

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        window.__microphoneActive = false;
        const audioBlob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());
        if (audioBlob.size === 0) {
          setIsRecording(false);
          return;
        }
        await handleVoiceTranscription(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      window.__microphoneActive = true;
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Could not access microphone");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceTranscription = async (audioBlob) => {
    setIsTranscribing(true);
    try {
      const audioBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const response = await base44.functions.invoke('transcribeAudio', {
        audio_base64: audioBase64,
        filename: `voice-${Date.now()}.webm`
      });

      if (!response?.data?.text) throw new Error('Failed to transcribe audio');
      submitCapture(response.data.text.trim());
    } catch (error) {
      console.error("Voice processing error:", error);
      alert("Failed to process voice input. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const input = textInput;
    setTextInput('');
    submitCapture(input);
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden p-3 md:p-4 ${
      theme === 'spicybrains'
        ? 'bg-gradient-to-br from-red-300 via-orange-300 to-yellow-400'
        : ''
    }`}>
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(createPageUrl("Home"));
              }
            }}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          {presetDate && (() => {
            const [y, m, d] = presetDate.split('-').map(n => parseInt(n, 10));
            const date = new Date(y, m - 1, d);
            return (
              <span className="text-sm text-gray-500 font-medium">
                📅 {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            );
          })()}
        </div>

        <Card className={`border-none shadow-2xl overflow-hidden flex-1 flex flex-col ${
          theme === 'dark'
            ? 'bg-gray-800'
            : theme === 'minimalist'
              ? 'bg-white'
              : theme === 'spicybrains'
                ? 'bg-gradient-to-br from-red-100 via-orange-100 to-yellow-100'
                : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
        }`}>
          <CardContent className="p-4 md:p-6 flex-1 flex flex-col min-h-0">
            <div className="flex justify-center gap-3 mb-4">
              <Button
                variant={inputMode === 'voice' ? 'default' : 'outline'}
                onClick={() => setInputMode('voice')}
                className={`px-5 h-10 ${
                  inputMode === 'voice' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'voice' && theme === 'spicybrains'
                      ? 'bg-gradient-to-r from-red-600 to-yellow-600'
                      : inputMode === 'voice' && theme !== 'dark'
                        ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                        : ''
                }`}
              >
                <Mic className="w-5 h-5 mr-2" />
                Voice
              </Button>
              <Button
                variant={inputMode === 'text' ? 'default' : 'outline'}
                onClick={() => setInputMode('text')}
                className={`px-5 h-10 ${
                  inputMode === 'text' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'text' && theme === 'spicybrains'
                      ? 'bg-gradient-to-r from-red-600 to-yellow-600'
                      : inputMode === 'text' && theme !== 'dark'
                        ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                        : ''
                }`}
              >
                Type
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {inputMode === 'voice' ? (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-2 min-h-0"
                >
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    theme === 'minimalist'
                      ? 'bg-purple-100'
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-br from-red-200 to-yellow-200'
                        : 'bg-gradient-to-br from-purple-100 to-pink-100'
                  }`}>
                    <Sparkles className={`w-10 h-10 ${
                      theme === 'minimalist' ? 'text-purple-600' : theme === 'spicybrains' ? 'text-orange-700' : 'text-purple-700'
                    }`} />
                  </div>
                  <div className="text-center space-y-3 max-w-md">
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {isTranscribing ? 'Got it...' : isRecording ? 'Listening...' : 'Ready to capture your tasks?'}
                    </h2>
                    <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      {isRecording
                        ? 'Tap to stop listening'
                        : 'Tap the mic and speak - say them one at a time or all at once'
                      }
                    </p>
                  </div>
                  <button
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={isTranscribing}
                    className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse'
                        : isTranscribing
                          ? 'bg-gray-400 cursor-not-allowed'
                          : theme === 'minimalist'
                            ? 'bg-purple-600 hover:bg-purple-700 hover:scale-110'
                            : theme === 'spicybrains'
                              ? 'bg-gradient-to-br from-red-600 to-yellow-600 hover:scale-110'
                              : 'bg-gradient-to-br from-purple-600 to-pink-600 hover:scale-110'
                    } shadow-2xl`}
                  >
                    {isTranscribing ? (
                      <Loader2 className="w-12 h-12 text-white animate-spin" />
                    ) : (
                      <Mic className="w-12 h-12 text-white" />
                    )}
                  </button>
                  <p className="text-sm text-gray-500 text-center">
                    {isTranscribing ? 'One sec...' : isRecording ? 'Tap to Stop' : 'Tap to Speak'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="text"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex-1 flex flex-col justify-center space-y-4 py-2 min-h-0"
                >
                  <div className="text-center space-y-2 max-w-md mx-auto mb-2">
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Type your tasks
                    </h2>
                    <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      Enter each task and press Enter to add - AI will organize it with smart reminders
                    </p>
                  </div>
                  <form onSubmit={handleTextSubmit} className="max-w-xl mx-auto">
                    <div className="flex gap-3">
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder='e.g., "Call dentist tomorrow at 2pm" or "Water plants every day"'
                        className="h-14 text-lg flex-1"
                        autoFocus
                      />
                      <Button
                        type="submit"
                        disabled={!textInput.trim()}
                        className={`h-14 px-8 ${
                          theme === 'minimalist'
                            ? 'bg-green-600 hover:bg-green-700'
                            : theme === 'spicybrains'
                              ? 'bg-gradient-to-r from-red-600 to-yellow-600'
                              : 'bg-gradient-to-r from-purple-600 to-orange-600'
                        }`}
                      >
                        Add
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}