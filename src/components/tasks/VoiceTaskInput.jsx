import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function VoiceTaskInput({ onTranscription, theme, inline = true }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      console.log('[VOICE INPUT] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      console.log('[VOICE INPUT] Microphone access granted');
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg;codecs=opus';
      }
      
      console.log('[VOICE INPUT] Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('[VOICE INPUT] Received audio chunk:', event.data.size, 'bytes');
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[VOICE INPUT] Recording stopped, processing...');
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        console.log('[VOICE INPUT] Audio blob created:', audioBlob.size, 'bytes');
        
        stream.getTracks().forEach(track => track.stop());
        
        if (audioBlob.size === 0) {
          console.error('[VOICE INPUT] No audio data recorded');
          alert("No audio was recorded. Please try again.");
          return;
        }
        
        await transcribeAudio(audioBlob, mimeType);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('[VOICE INPUT] Recording started');
    } catch (error) {
      console.error('[VOICE INPUT] Error accessing microphone:', error);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    console.log('[VOICE INPUT] Stopping recording...');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob, mimeType) => {
    setIsProcessing(true);

    try {
      console.log('[VOICE INPUT] Uploading audio file...');
      
      // Convert Blob to File with proper name and type
      let extension = 'webm';
      if (mimeType.includes('mp4')) extension = 'mp4';
      if (mimeType.includes('ogg')) extension = 'ogg';
      
      const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeType });
      
      console.log('[VOICE INPUT] Created File object:', audioFile.name, audioFile.size, 'bytes');
      
      // Upload the audio file to get a URL
      const uploadResult = await base44.integrations.Core.UploadFile({
        file: audioFile
      });

      if (!uploadResult?.file_url) {
        throw new Error('Failed to upload audio file');
      }

      console.log('[VOICE INPUT] Audio uploaded, file_url:', uploadResult.file_url);

      // Send the file URL to transcription function
      const result = await base44.functions.invoke('transcribeAudio', {
        file_url: uploadResult.file_url
      });

      console.log('[VOICE INPUT] Transcription response:', result);

      // CRITICAL FIX: result.data, not result directly
      if (result?.data?.success && result?.data?.transcription) {
        console.log('[VOICE INPUT] Transcription successful:', result.data.transcription);
        onTranscription(result.data.transcription);
      } else {
        console.error('[VOICE INPUT] Transcription failed:', result);
        const errorMsg = result?.data?.error || "Failed to transcribe audio. Please try again.";
        alert(errorMsg);
      }
    } catch (error) {
      console.error('[VOICE INPUT] Error transcribing audio:', error);
      const errorMsg = error.message || "Failed to transcribe audio. Please try again.";
      alert(errorMsg);
    }

    setIsProcessing(false);
  };

  if (inline) {
    return (
      <Button
        type="button"
        size="icon"
        variant={isRecording ? "destructive" : "outline"}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className="flex-shrink-0"
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isRecording ? (
          <Square className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      variant={isRecording ? "destructive" : "default"}
      onClick={isRecording ? stopRecording : startRecording}
      disabled={isProcessing}
      className={`w-full ${
        theme === 'minimalist'
          ? 'bg-purple-600 hover:bg-purple-700'
          : theme === 'dark'
            ? 'bg-purple-600 hover:bg-purple-700'
            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
      }`}
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Processing...
        </>
      ) : isRecording ? (
        <>
          <Square className="w-5 h-5 mr-2" />
          Stop Recording
        </>
      ) : (
        <>
          <Mic className="w-5 h-5 mr-2" />
          Tap to Speak
        </>
      )}
    </Button>
  );
}