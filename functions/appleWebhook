import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        
        const notificationType = body.notification_type;
        const receipt = body.unified_receipt?.latest_receipt_info?.[0];
        
        if (!receipt) {
            return Response.json({ error: 'No receipt data' }, { status: 400 });
        }

        const base44 = await import('npm:@base44/sdk@0.7.1').then(m => 
            m.createClient({
                appId: Deno.env.get('BASE44_APP_ID'),
                serviceRoleKey: Deno.env.get('BASE44_SERVICE_ROLE_KEY')
            })
        );

        const entitlements = await base44.entities.Entitlement.filter({
            original_transaction_id: receipt.original_transaction_id
        });

        if (entitlements.length === 0) {
            return Response.json({ error: 'Entitlement not found' }, { status: 404 });
        }

        const entitlement = entitlements[0];

        switch (notificationType) {
            case 'DID_RENEW': {
                await base44.entities.Entitlement.update(entitlement.id, {
                    expires_date: new Date(parseInt(receipt.expires_date_ms)).toISOString(),
                    is_active: true,
                    auto_renew: true
                });
                break;
            }

            case 'DID_FAIL_TO_RENEW':
            case 'EXPIRED': {
                await base44.entities.Entitlement.update(entitlement.id, {
                    is_active: false,
                    auto_renew: false
                });
                const userEntitlements = await base44.entities.Entitlement.filter({
                    user_email: entitlement.user_email,
                    is_active: true
                });
                if (userEntitlements.length === 0) {
                    const users = await base44.entities.User.filter({
                        email: entitlement.user_email
                    });
                    if (users.length > 0) {
                        await base44.entities.User.update(users[0].id, {
                            has_paid: false
                        });
                    }
                }
                break;
            }

            case 'REFUND': {
                await base44.entities.Entitlement.update(entitlement.id, {
                    is_active: false
                });
                break;
            }
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('Apple webhook error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});