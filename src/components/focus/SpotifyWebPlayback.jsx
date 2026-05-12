import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

export default function SpotifyWebPlayback({ playlistId, theme }) {
  const [player, setPlayer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load Spotify SDK and get access token
  useEffect(() => {
    const loadPlayer = async () => {
      try {
        // Fetch token from backend
        const tokenResponse = await fetch('/api/getSpotifyAccessToken');
        if (!tokenResponse.ok) throw new Error('Failed to get Spotify token');
        
        const { access_token } = await tokenResponse.json();
        setAccessToken(access_token);

        // Load SDK
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        script.onload = () => {
          window.onSpotifyWebPlaybackSDKReady = () => {
            initializePlayer(access_token);
          };
        };
        document.body.appendChild(script);

        return () => {
          if (document.body.contains(script)) {
            document.body.removeChild(script);
          }
        };
      } catch (err) {
        console.error('Error loading Spotify:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadPlayer();
  }, []);

  const initializePlayer = (token) => {
    const newPlayer = new window.Spotify.Player({
      name: "ADHDone Focus Room",
      getOAuthToken: (cb) => {
        cb(token);
      },
      volume: 0.5,
    });

    newPlayer.addListener("player_state_changed", (state) => {
      if (state) {
        setCurrentTrack(state.current_track);
        setIsPlaying(!state.paused);
      }
    });

    newPlayer.addListener("ready", ({ device_id }) => {
      setDeviceId(device_id);
      setLoading(false);
    });

    newPlayer.connect();
    setPlayer(newPlayer);
  };

  const handlePlay = async () => {
    if (!player || !deviceId || !playlistId) return;

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            context_uri: `spotify:playlist:${playlistId}`,
          }),
        }
      );

      if (response.ok) {
        player.resume();
      }
    } catch (error) {
      console.error("Error playing:", error);
    }
  };

  const handlePause = () => {
    if (player) player.pause();
  };

  const handlePrevious = () => {
    if (player) player.previousTrack();
  };

  const handleNext = () => {
    if (player) player.nextTrack();
  };

  if (error) {
    return (
      <div
        className={`rounded-xl p-4 shadow-lg ${
          theme === "minimalist" ? "bg-white" : theme === "dark" ? "bg-gray-800" : "bg-white/80"
        }`}
      >
        <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Error loading Spotify
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`rounded-xl p-4 shadow-lg ${
          theme === "minimalist" ? "bg-white" : theme === "dark" ? "bg-gray-800" : "bg-white/80"
        }`}
      >
        <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Loading music player...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-4 shadow-lg ${
        theme === "minimalist" ? "bg-white" : theme === "dark" ? "bg-gray-800" : "bg-white/80"
      }`}
    >
      <h2 className={`text-sm font-bold mb-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
        🎵 Now Playing
      </h2>

      {currentTrack && (
        <div className="mb-3">
          <p className={`text-xs font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
            {currentTrack.name}
          </p>
          <p className={`text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
            {currentTrack.artists[0]?.name}
          </p>
        </div>
      )}

      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={handlePrevious}>
          <SkipBack className="w-4 h-4" />
        </Button>
        {isPlaying ? (
          <Button size="sm" onClick={handlePause} className="bg-green-600 hover:bg-green-700">
            <Pause className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={handlePlay} className="bg-green-600 hover:bg-green-700">
            <Play className="w-4 h-4" />
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleNext}>
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}