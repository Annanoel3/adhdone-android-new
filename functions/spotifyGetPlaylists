import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let accessToken = user.spotify_access_token;

        // Check if token is expired and refresh if needed
        if (user.spotify_token_expires_at) {
            const expiresAt = new Date(user.spotify_token_expires_at);
            if (expiresAt < new Date()) {
                // Token expired, refresh it
                const refreshResponse = await base44.functions.invoke('spotifyRefreshToken');
                if (refreshResponse.data.success) {
                    accessToken = refreshResponse.data.access_token;
                }
            }
        }

        if (!accessToken) {
            return Response.json({ 
                success: false,
                error: 'Not connected to Spotify' 
            }, { status: 400 });
        }

        // Get user's playlists
        const playlistsResponse = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const playlistsData = await playlistsResponse.json();

        if (!playlistsResponse.ok) {
            throw new Error(playlistsData.error?.message || 'Failed to get playlists');
        }

        return Response.json({ 
            success: true,
            playlists: playlistsData.items.map(playlist => ({
                id: playlist.id,
                name: playlist.name,
                images: playlist.images,
                tracks_count: playlist.tracks.total,
                uri: playlist.uri
            }))
        });

    } catch (error) {
        console.error('Spotify get playlists error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});