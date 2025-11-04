import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import * as jose from 'npm:jose@5.2.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { externalId } = body;

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const privateKeyPem = Deno.env.get("ONESIGNAL_IDENTITY_VERIFICATION_KEY");

        if (!appId) {
            console.log('ONESIGNAL_APP_ID not set');
            return Response.json({ 
                error: 'App ID not configured' 
            }, { status: 500 });
        }

        if (!privateKeyPem) {
            console.log('ONESIGNAL_IDENTITY_VERIFICATION_KEY not set - Identity Verification may be disabled');
            return Response.json({ 
                error: 'Identity verification key not configured - this is OK if Identity Verification is disabled in OneSignal dashboard' 
            }, { status: 500 });
        }

        // Import the private key (ES256 = ECDSA P-256)
        const privateKey = await jose.importPKCS8(privateKeyPem, 'ES256');

        // Generate JWT for identity verification
        const jwt = await new jose.SignJWT({
            identity: {
                external_id: externalId
            }
        })
            .setProtectedHeader({ alg: 'ES256' })
            .setIssuer(appId)
            .setExpirationTime('1h')
            .sign(privateKey);

        return Response.json({ jwt });
    } catch (error) {
        console.error('Error generating OneSignal JWT:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});