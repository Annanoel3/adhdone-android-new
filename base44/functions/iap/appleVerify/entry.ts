import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jwtVerify, SignJWT } from 'npm:jose@5.2.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { transactionReceipt, productId, appAccountToken } = await req.json();

        if (!transactionReceipt || !productId) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get Apple credentials from env
        const keyId = Deno.env.get("APPLE_STORE_KEY_ID");
        const issuerId = Deno.env.get("APPLE_STORE_ISSUER_ID");
        const privateKey = Deno.env.get("APPLE_STORE_PRIVATE_KEY");
        const environment = Deno.env.get("APPLE_APP_STORE_SERVER_ENV") || "Production";

        if (!keyId || !issuerId || !privateKey) {
            return Response.json({ error: 'Apple credentials not configured' }, { status: 500 });
        }

        // Generate JWT for App Store Server API
        const encoder = new TextEncoder();
        const privateKeyBytes = encoder.encode(privateKey);
        
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
            .setIssuedAt()
            .setIssuer(issuerId)
            .setAudience('appstoreconnect-v1')
            .setExpirationTime('5m')
            .sign(await crypto.subtle.importKey(
                'pkcs8',
                privateKeyBytes,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['sign']
            ));

        // Verify with App Store Server API
        const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
        const baseUrl = environment === "Sandbox" 
            ? "https://api.storekit-sandbox.itunes.apple.com"
            : "https://api.storekit.itunes.apple.com";

        const response = await fetch(`${baseUrl}/inApps/v1/transactions/${transactionReceipt}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error("Apple verification failed:", error);
            return Response.json({ error: 'Verification failed' }, { status: 400 });
        }

        const data = await response.json();
        const transaction = data.signedTransactionInfo;

        // Decode transaction
        const decoded = await jwtVerify(transaction, privateKeyBytes);
        const txn = decoded.payload;

        // Extract entitlement data
        const now = new Date();
        const expiresAt = new Date(txn.expiresDate || 0);
        const trialEnd = txn.isInIntroOfferPeriod ? new Date(txn.expiresDate || 0) : null;
        const isActive = expiresAt > now;
        const isTrial = txn.isInIntroOfferPeriod || false;

        let status = 'expired';
        if (isActive && isTrial) {
            status = 'trial';
        } else if (isActive) {
            status = 'active';
        }

        // Upsert entitlement
        const entitlementData = {
            user_id: user.id,
            platform: 'apple',
            product_id: productId,
            original_transaction_id: txn.originalTransactionId,
            status,
            trial_end: trialEnd?.toISOString(),
            expires_at: expiresAt.toISOString(),
            auto_renew_status: txn.autoRenewStatus === 1,
            last_sync_at: now.toISOString(),
            raw_payload: txn
        };

        // Check if entitlement exists
        const existing = await base44.asServiceRole.entities.UserEntitlement.filter({
            user_id: user.id,
            original_transaction_id: txn.originalTransactionId
        });

        if (existing.length > 0) {
            await base44.asServiceRole.entities.UserEntitlement.update(existing[0].id, entitlementData);
        } else {
            await base44.asServiceRole.entities.UserEntitlement.create(entitlementData);
        }

        // Return entitlement view
        return Response.json({
            entitlements: {
                premium: isActive,
                status,
                productId,
                trialEndsAt: trialEnd?.toISOString(),
                expiresAt: expiresAt.toISOString(),
                autoRenew: txn.autoRenewStatus === 1
            }
        });

    } catch (error) {
        console.error('Apple verify error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});