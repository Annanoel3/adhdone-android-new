import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { JWT } from 'npm:google-auth-library@9.6.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate webhook secret
        const webhookSecret = Deno.env.get("IAP_WEBHOOK_SECRET_GOOGLE");
        const authHeader = req.headers.get('authorization');

        if (!authHeader || !webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
            return Response.json({ error: 'Invalid authorization' }, { status: 401 });
        }

        const body = await req.json();
        const message = body.message;

        if (!message || !message.data) {
            return Response.json({ error: 'Invalid message' }, { status: 400 });
        }

        // Decode base64 data
        const data = JSON.parse(atob(message.data));
        const subscriptionNotification = data.subscriptionNotification;

        if (!subscriptionNotification) {
            return Response.json({ received: true });
        }

        const purchaseToken = subscriptionNotification.purchaseToken;
        const notificationType = subscriptionNotification.notificationType;

        // Find existing entitlement
        const entitlements = await base44.asServiceRole.entities.UserEntitlement.filter({
            purchase_token: purchaseToken
        });

        if (entitlements.length === 0) {
            console.log("No entitlement found for purchase token:", purchaseToken);
            return Response.json({ received: true });
        }

        const ent = entitlements[0];

        // Get Google credentials and re-verify
        const serviceAccountJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
        const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE");
        const serviceAccount = JSON.parse(serviceAccountJson);

        const jwtClient = new JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });

        await jwtClient.authorize();

        const response = await fetch(
            `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${ent.product_id}/tokens/${purchaseToken}`,
            {
                headers: {
                    'Authorization': `Bearer ${jwtClient.credentials.access_token}`,
                }
            }
        );

        if (!response.ok) {
            return Response.json({ received: true });
        }

        const purchase = await response.json();
        const now = new Date();
        const expiresAt = new Date(parseInt(purchase.expiryTimeMillis));
        const isActive = expiresAt > now && purchase.paymentState === 1;
        const isTrial = purchase.paymentState === 2;
        const isGrace = purchase.paymentState === 0;

        let status = ent.status;

        // Handle notification types
        switch (notificationType) {
            case 1: // SUBSCRIPTION_RECOVERED
            case 2: // SUBSCRIPTION_RENEWED
            case 7: // SUBSCRIPTION_PURCHASED
                status = isTrial ? 'trial' : 'active';
                break;
            case 3: // SUBSCRIPTION_CANCELED
                status = isActive ? 'active' : 'expired';
                break;
            case 4: // SUBSCRIPTION_IN_GRACE_PERIOD
                status = 'grace';
                break;
            case 5: // SUBSCRIPTION_ON_HOLD
                status = 'paused';
                break;
            case 12: // SUBSCRIPTION_REVOKED
                status = 'revoked';
                break;
            case 13: // SUBSCRIPTION_EXPIRED
                status = 'expired';
                break;
        }

        // Update entitlement
        await base44.asServiceRole.entities.UserEntitlement.update(ent.id, {
            status,
            expires_at: expiresAt.toISOString(),
            auto_renew_status: purchase.autoRenewing || false,
            last_sync_at: now.toISOString(),
            raw_payload: purchase
        });

        return Response.json({ received: true });

    } catch (error) {
        console.error('Google webhook error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});