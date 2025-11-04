import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { JWT } from 'npm:google-auth-library@9.6.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { purchaseToken, productId } = await req.json();

        if (!purchaseToken || !productId) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get Google credentials
        const serviceAccountJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
        const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE");

        if (!serviceAccountJson || !packageName) {
            return Response.json({ error: 'Google credentials not configured' }, { status: 500 });
        }

        const serviceAccount = JSON.parse(serviceAccountJson);

        // Create JWT client
        const jwtClient = new JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });

        await jwtClient.authorize();

        // Verify with Google Play Developer API
        const response = await fetch(
            `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
            {
                headers: {
                    'Authorization': `Bearer ${jwtClient.credentials.access_token}`,
                }
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Google verification failed:", error);
            return Response.json({ error: 'Verification failed' }, { status: 400 });
        }

        const purchase = await response.json();

        // Extract entitlement data
        const now = new Date();
        const expiresAt = new Date(parseInt(purchase.expiryTimeMillis));
        const isActive = expiresAt > now && purchase.paymentState === 1;
        const isTrial = purchase.paymentState === 2; // Free trial
        const isGrace = purchase.paymentState === 0; // Grace period

        let status = 'expired';
        if (isActive && isTrial) {
            status = 'trial';
        } else if (isActive && isGrace) {
            status = 'grace';
        } else if (isActive) {
            status = 'active';
        } else if (purchase.cancelReason === 1) {
            status = 'refunded';
        } else if (purchase.cancelReason === 3) {
            status = 'revoked';
        }

        const trialEnd = isTrial ? expiresAt : null;

        // Upsert entitlement
        const entitlementData = {
            user_id: user.id,
            platform: 'google',
            product_id: productId,
            purchase_token: purchaseToken,
            status,
            trial_end: trialEnd?.toISOString(),
            expires_at: expiresAt.toISOString(),
            auto_renew_status: purchase.autoRenewing || false,
            last_sync_at: now.toISOString(),
            raw_payload: purchase
        };

        // Check if entitlement exists
        const existing = await base44.asServiceRole.entities.UserEntitlement.filter({
            user_id: user.id,
            purchase_token: purchaseToken
        });

        if (existing.length > 0) {
            await base44.asServiceRole.entities.UserEntitlement.update(existing[0].id, entitlementData);
        } else {
            await base44.asServiceRole.entities.UserEntitlement.create(entitlementData);
        }

        // Return entitlement view
        return Response.json({
            entitlements: {
                premium: isActive || isGrace,
                status,
                productId,
                trialEndsAt: trialEnd?.toISOString(),
                expiresAt: expiresAt.toISOString(),
                autoRenew: purchase.autoRenewing || false
            }
        });

    } catch (error) {
        console.error('Google verify error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});