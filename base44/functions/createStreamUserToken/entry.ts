import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = Deno.env.get("STREAM_API_KEY");
        const apiSecret = Deno.env.get("STREAM_API_SECRET");

        if (!apiKey || !apiSecret) {
            return Response.json({ error: 'Stream credentials not configured' }, { status: 500 });
        }

        // Use Stream's REST API directly instead of SDK to avoid timeout
        const streamUserId = user.email;
        const userData = {
            id: streamUserId,
            name: user.display_name || user.full_name,
            image: user.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=random`
        };

        // Create user in Stream
        const createUserResponse = await fetch(`https://chat.stream-io-api.com/users?api_key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiSecret,
                'Stream-Auth-Type': 'jwt'
            },
            body: JSON.stringify({
                users: { [streamUserId]: userData }
            })
        });

        if (!createUserResponse.ok) {
            const errorText = await createUserResponse.text();
            console.error('Stream user creation error:', errorText);
        }

        // Generate token manually using JWT
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };

        const payload = {
            user_id: streamUserId
        };

        const base64UrlEncode = (obj) => {
            const json = JSON.stringify(obj);
            return btoa(json)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        };

        const headerEncoded = base64UrlEncode(header);
        const payloadEncoded = base64UrlEncode(payload);
        const signatureInput = `${headerEncoded}.${payloadEncoded}`;

        // Create signature using HMAC SHA256
        const encoder = new TextEncoder();
        const keyData = encoder.encode(apiSecret);
        const messageData = encoder.encode(signatureInput);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const signatureArray = new Uint8Array(signature);
        const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const token = `${headerEncoded}.${payloadEncoded}.${signatureBase64}`;

        // Save token to user
        await base44.asServiceRole.entities.User.update(user.id, {
            stream_user_token: token
        });

        return Response.json({ token, user_id: streamUserId });
    } catch (error) {
        console.error('Stream token error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});