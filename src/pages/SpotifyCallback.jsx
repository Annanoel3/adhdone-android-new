import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const error = urlParams.get('error');

      if (error) {
        setStatus('error');
        setError('Spotify authorization was denied');
        return;
      }

      if (!code) {
        setStatus('error');
        setError('No authorization code received');
        return;
      }

      // Call the callback function to exchange code for tokens
      const response = await base44.functions.invoke('spotifyCallback', {
        code,
        state: urlParams.get('state')
      });

      if (response.data.success) {
        setStatus('success');
        setTimeout(() => {
          navigate(createPageUrl("FocusRooms"));
        }, 2000);
      } else {
        setStatus('error');
        setError(response.data.error || 'Failed to connect Spotify');
      }
    } catch (err) {
      console.error('Spotify callback error:', err);
      setStatus('error');
      setError(err.message || 'Failed to connect Spotify');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-green-600" />
              <h2 className="text-xl font-bold mb-2">Connecting to Spotify...</h2>
              <p className="text-gray-600">Please wait while we complete the connection</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
              <h2 className="text-xl font-bold mb-2">Successfully Connected!</h2>
              <p className="text-gray-600 mb-4">Your Spotify account is now linked</p>
              <p className="text-sm text-gray-500">Redirecting you back...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-600" />
              <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => navigate(createPageUrl("FocusRooms"))}>
                Back to Focus Rooms
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}