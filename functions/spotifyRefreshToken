import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!user.spotify_refresh_token) {
            return Response.json({ 
                success: false,
                error: 'No refresh token found' 
            }, { status: 400 });
        }

        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || "21dc7225ceb744e5916301c9af331fd6";
        const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: user.spotify_refresh_token
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            throw new Error(tokenData.error_description || 'Failed to refresh token');
        }

        // Update user with new token
        await base44.entities.User.updateMyUserData({
            spotify_access_token: tokenData.access_token,
            spotify_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        });

        return Response.json({ 
            success: true,
            access_token: tokenData.access_token
        });

    } catch (error) {
        console.error('Spotify refresh token error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});