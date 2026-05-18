import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, CheckCircle } from "lucide-react";
import { VoiceRecorder } from 'capacitor-voice-recorder';

export default function MicrophonePermissionCheck({ theme }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('checking');

  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  const checkMicrophonePermission = async () => {
    const hasAsked = localStorage.getItem('microphone_permission_asked');
    if (hasAsked) return;

    try {
      const { value: hasPermission } = await VoiceRecorder.hasAudioRecordingPermission();
      if (hasPermission) {
        localStorage.setItem('microphone_permission_asked', 'granted');
        return;
      }
    } catch (e) {
      return;
    }

    setTimeout(() => {
      setPermissionStatus('prompt');
      setShowPrompt(true);
    }, 5000);
  };

  const requestPermission = async () => {
    try {
      const { value: granted } = await VoiceRecorder.requestAudioRecordingPermission();
      if (granted) {
        localStorage.setItem('microphone_permission_asked', 'granted');
        setPermissionStatus('granted');
        setTimeout(() => setShowPrompt(false), 1500);
      } else {
        localStorage.setItem('microphone_permission_asked', 'denied');
        setShowPrompt(false);
      }
    } catch (error) {
      console.error("Microphone permission error:", error);
      localStorage.setItem('microphone_permission_asked', 'denied');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('microphone_permission_asked', 'dismissed');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5" />
            {permissionStatus === 'granted' ? 'Microphone Enabled!' : 'Enable Voice Features'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {permissionStatus === 'prompt' && (
            <>
              <div className={`p-4 rounded-lg ${
                theme === 'minimalist'
                  ? 'bg-purple-50 border border-purple-200'
                  : theme === 'dark'
                    ? 'bg-purple-900/20 border border-purple-800'
                    : 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200'
              }`}>
                <p className={`text-sm mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  🎤 <strong>ADHDone works best with voice!</strong>
                </p>
                <ul className={`text-sm space-y-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  <li>• Quickly add tasks by speaking</li>
                  <li>• Brain dump your thoughts naturally</li>
                  <li>• Set reminders hands-free</li>
                </ul>
              </div>

              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                When you tap "Enable Microphone", your device will ask for permission.
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={requestPermission}
                  className={`flex-1 ${
                    theme === 'minimalist' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : theme === 'dark'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`}
                >
                  <Mic className="w-4 h-4 mr-2" />
                  Enable Microphone
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="outline"
                  className="flex-1"
                >
                  Maybe Later
                </Button>
              </div>
            </>
          )}

          {permissionStatus === 'granted' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                All set! 🎉
              </h3>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                You can now use voice features
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}