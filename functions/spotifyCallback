import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const body = await req.json();
        const code = body.code;
        const state = body.state; // This is the user's email
        
        if (!code) {
            return Response.json({ 
                success: false,
                error: 'No authorization code provided' 
            }, { status: 400 });
        }

        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || "21dc7225ceb744e5916301c9af331fd6";
        const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
        const redirectUri = "https://adhdone-73056b9b.base44.app/SpotifyCallback";

        // Exchange code for access token
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            throw new Error(tokenData.error_description || 'Failed to get access token');
        }

        // Get user's Spotify profile
        const profileResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        const profile = await profileResponse.json();

        // Store tokens in user entity using service role
        const users = await base44.asServiceRole.entities.User.filter({ email: state });
        
        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                spotify_access_token: tokenData.access_token,
                spotify_refresh_token: tokenData.refresh_token,
                spotify_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                spotify_user_id: profile.id
            });
        }

        return Response.json({ 
            success: true,
            profile: {
                id: profile.id,
                display_name: profile.display_name,
                email: profile.email
            }
        });

    } catch (error) {
        console.error('Spotify callback error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});