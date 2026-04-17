import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all entitlements that need reconciliation
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const entitlements = await base44.asServiceRole.entities.UserEntitlement.list();
        
        let reconciled = 0;

        for (const ent of entitlements) {
            const lastSync = new Date(ent.last_sync_at);
            const expires = new Date(ent.expires_at);

            // Skip if recently synced and not expired
            if (lastSync > yesterday && expires > now) {
                continue;
            }

            // Re-verify based on platform
            if (ent.platform === 'apple' && ent.original_transaction_id) {
                try {
                    await base44.asServiceRole.functions.invoke('iap/appleVerify', {
                        transactionReceipt: ent.original_transaction_id,
                        productId: ent.product_id
                    });
                    reconciled++;
                } catch (error) {
                    console.error(`Failed to reconcile Apple ${ent.id}:`, error);
                }
            } else if (ent.platform === 'google' && ent.purchase_token) {
                try {
                    await base44.asServiceRole.functions.invoke('iap/googleVerify', {
                        purchaseToken: ent.purchase_token,
                        productId: ent.product_id
                    });
                    reconciled++;
                } catch (error) {
                    console.error(`Failed to reconcile Google ${ent.id}:`, error);
                }
            }
        }

        return Response.json({
            success: true,
            reconciled,
            timestamp: now.toISOString()
        });

    } catch (error) {
        console.error('Reconcile error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});