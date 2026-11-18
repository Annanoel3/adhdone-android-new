import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Photo → text. The extracted sentence is handed to the SAME capture pipeline
// as typing or voice (onCaptureText), so a flyer is parsed and scheduled by the
// one parser rather than a photo-specific path.
export default function PhotoTaskInput({ theme, onCaptureText }) {
  const fileRef = useRef(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsReading(true);
    setError(null);
    try {
      const upload = await base44.integrations.Core.UploadFile({ file });
      if (!upload?.file_url) throw new Error('Upload failed');

      const res = await base44.functions.invoke('readImageCapture', { file_url: upload.file_url });
      const text = res?.data?.text;
      if (!text) {
        setError("No event or task found in that photo. Try one that shows the date and time.");
        return;
      }
      onCaptureText(text);
    } catch (err) {
      console.error('Photo capture error:', err);
      setError('Something went wrong reading that photo. Try again?');
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-2 min-h-0">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
        theme === 'minimalist'
          ? 'bg-purple-100'
          : theme === 'spicybrains'
            ? 'bg-gradient-to-br from-red-200 to-yellow-200'
            : 'bg-gradient-to-br from-purple-100 to-pink-100'
      }`}>
        <ImagePlus className={`w-10 h-10 ${
          theme === 'minimalist' ? 'text-purple-600' : theme === 'spicybrains' ? 'text-orange-700' : 'text-purple-700'
        }`} />
      </div>

      <div className="text-center space-y-2 max-w-md">
        <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {isReading ? 'Reading it...' : 'Got a flyer or screenshot?'}
        </h2>
        <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          Pick a photo and ADHDone pulls out the date, time, and address for you
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      <Button
        onClick={() => fileRef.current?.click()}
        disabled={isReading}
        className={`h-14 px-8 text-lg ${
          theme === 'minimalist'
            ? 'bg-green-600 hover:bg-green-700'
            : theme === 'spicybrains'
              ? 'bg-gradient-to-r from-red-600 to-yellow-600'
              : 'bg-gradient-to-r from-purple-600 to-orange-600'
        }`}
      >
        {isReading ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" />One sec...</>
        ) : (
          <><ImagePlus className="w-5 h-5 mr-2" />Choose Photo</>
        )}
      </Button>

      {error && (
        <p className="text-sm text-red-500 text-center max-w-sm">{error}</p>
      )}
    </div>
  );
}