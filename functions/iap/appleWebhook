import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jwtVerify } from 'npm:jose@5.2.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate webhook signature
        const signature = req.headers.get('x-apple-signature');
        const webhookSecret = Deno.env.get("IAP_WEBHOOK_SECRET_APPLE");

        if (!signature || !webhookSecret) {
            return Response.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const body = await req.text();
        
        // TODO: Implement actual signature validation
        // For now, proceed with processing

        const notification = JSON.parse(body);
        const signedPayload = notification.signedPayload;

        // Decode the signed payload
        const privateKey = Deno.env.get("APPLE_STORE_PRIVATE_KEY");
        const encoder = new TextEncoder();
        const decoded = await jwtVerify(signedPayload, encoder.encode(privateKey));
        const payload = decoded.payload;

        const notificationType = payload.notificationType;
        const data = payload.data;
        const transaction = data.signedTransactionInfo;

        // Decode transaction
        const txnDecoded = await jwtVerify(transaction, encoder.encode(privateKey));
        const txn = txnDecoded.payload;

        const originalTransactionId = txn.originalTransactionId;

        // Find existing entitlement
        const entitlements = await base44.asServiceRole.entities.UserEntitlement.filter({
            original_transaction_id: originalTransactionId
        });

        if (entitlements.length === 0) {
            console.log("No entitlement found for transaction:", originalTransactionId);
            return Response.json({ received: true });
        }

        const ent = entitlements[0];
        const now = new Date();
        const expiresAt = new Date(txn.expiresDate || 0);
        const isTrial = txn.isInIntroOfferPeriod || false;

        let status = ent.status;

        // Handle notification types
        switch (notificationType) {
            case 'SUBSCRIBED':
                status = isTrial ? 'trial' : 'active';
                break;
            case 'DID_RENEW':
                status = 'active';
                break;
            case 'DID_FAIL_TO_RENEW':
                status = expiresAt > now ? 'grace' : 'expired';
                break;
            case 'EXPIRED':
                status = 'expired';
                break;
            case 'REFUND':
                status = 'refunded';
                break;
            case 'REVOKE':
                status = 'revoked';
                break;
        }

        // Update entitlement
        await base44.asServiceRole.entities.UserEntitlement.update(ent.id, {
            status,
            expires_at: expiresAt.toISOString(),
            auto_renew_status: txn.autoRenewStatus === 1,
            last_sync_at: now.toISOString(),
            raw_payload: txn
        });

        return Response.json({ received: true });

    } catch (error) {
        console.error('Apple webhook error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});