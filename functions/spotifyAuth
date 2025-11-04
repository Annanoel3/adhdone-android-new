import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || "21dc7225ceb744e5916301c9af331fd6";
        const redirectUri = "https://adhdone-73056b9b.base44.app/SpotifyCallback";
        
        const scopes = [
            'user-read-private',
            'user-read-email',
            'playlist-read-private',
            'playlist-read-collaborative',
            'streaming',
            'user-read-playback-state',
            'user-modify-playback-state'
        ].join(' ');

        const authUrl = `https://accounts.spotify.com/authorize?` +
            `response_type=code` +
            `&client_id=${encodeURIComponent(clientId)}` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&state=${user.email}`; // Use email as state to identify user

        return Response.json({ 
            success: true,
            authUrl 
        });

    } catch (error) {
        console.error('Spotify auth error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});