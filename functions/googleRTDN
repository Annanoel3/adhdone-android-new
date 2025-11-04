import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        const message = body.message;
        
        if (!message || !message.data) {
            return Response.json({ error: 'Invalid message' }, { status: 400 });
        }

        const decodedData = JSON.parse(atob(message.data));
        const subscriptionNotification = decodedData.subscriptionNotification;
        
        if (!subscriptionNotification) {
            return Response.json({ error: 'Not a subscription notification' }, { status: 400 });
        }

        const base44 = await import('npm:@base44/sdk@0.7.1').then(m => 
            m.createClient({
                appId: Deno.env.get('BASE44_APP_ID'),
                serviceRoleKey: Deno.env.get('BASE44_SERVICE_ROLE_KEY')
            })
        );

        const purchaseToken = subscriptionNotification.purchaseToken;
        const notificationType = subscriptionNotification.notificationType;

        const entitlements = await base44.entities.Entitlement.filter({
            purchase_token: purchaseToken
        });

        if (entitlements.length === 0) {
            return Response.json({ error: 'Entitlement not found' }, { status: 404 });
        }

        const entitlement = entitlements[0];

        switch (notificationType) {
            case 1:
            case 2: {
                await base44.entities.Entitlement.update(entitlement.id, {
                    is_active: true,
                    auto_renew: true
                });
                break;
            }

            case 3:
            case 13: {
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

            case 12: {
                await base44.entities.Entitlement.update(entitlement.id, {
                    is_active: false
                });
                break;
            }
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('Google RTDN error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});