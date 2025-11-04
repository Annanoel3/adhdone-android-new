import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for active entitlements
        const entitlements = await base44.entities.Entitlement.filter({
            user_email: user.email,
            is_active: true
        });

        const hasActiveSubscription = entitlements.some(e => {
            if (!e.expires_date) return true; // Lifetime purchase
            return new Date(e.expires_date) > new Date(); // Not expired
        });

        if (hasActiveSubscription && !user.has_paid) {
            // Update user if they have active entitlement but flag not set
            await base44.auth.updateMe({ has_paid: true });
        }

        return Response.json({
            hasAccess: hasActiveSubscription,
            entitlements: entitlements
        });

    } catch (error) {
        console.error('Store verification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});