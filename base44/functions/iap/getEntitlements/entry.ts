import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all entitlements for this user
        const entitlements = await base44.asServiceRole.entities.UserEntitlement.filter({
            user_id: user.id
        }, '-last_sync_at', 1);

        if (entitlements.length === 0) {
            return Response.json({
                entitlements: {
                    premium: false,
                    status: 'none',
                    productId: null,
                    trialEndsAt: null,
                    expiresAt: null,
                    autoRenew: false
                }
            });
        }

        // Return the most recent entitlement
        const ent = entitlements[0];
        const now = new Date();
        const expiresAt = new Date(ent.expires_at);
        const isPremium = (expiresAt > now && ['trial', 'active', 'grace'].includes(ent.status));

        return Response.json({
            entitlements: {
                premium: isPremium,
                status: ent.status,
                productId: ent.product_id,
                trialEndsAt: ent.trial_end,
                expiresAt: ent.expires_at,
                autoRenew: ent.auto_renew_status
            }
        });

    } catch (error) {
        console.error('Get entitlements error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});