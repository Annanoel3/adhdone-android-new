import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { platform, receipt, productId } = await req.json();

        if (platform === 'ios') {
            return await verifyApplePurchase(base44, user, receipt, productId);
        } else if (platform === 'android') {
            return await verifyGooglePurchase(base44, user, receipt, productId);
        } else {
            return Response.json({ error: 'Invalid platform' }, { status: 400 });
        }

    } catch (error) {
        console.error('Purchase verification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function verifyApplePurchase(base44, user, receipt, productId) {
    const password = Deno.env.get('APPLE_SHARED_SECRET');
    
    let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            'receipt-data': receipt,
            'password': password,
            'exclude-old-transactions': false
        })
    });

    let data = await response.json();
    
    if (data.status === 21007) {
        response = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                'receipt-data': receipt,
                'password': password,
                'exclude-old-transactions': false
            })
        });
        data = await response.json();
    }

    if (data.status !== 0) {
        return Response.json({ 
            success: false, 
            error: 'Invalid receipt',
            status: data.status 
        });
    }

    const latestInfo = data.latest_receipt_info?.[0] || data.receipt?.in_app?.[0];
    
    if (!latestInfo) {
        return Response.json({ 
            success: false, 
            error: 'No purchase info found' 
        });
    }

    await base44.asServiceRole.entities.Entitlement.create({
        user_email: user.email,
        platform: 'ios',
        product_id: latestInfo.product_id,
        transaction_id: latestInfo.transaction_id,
        purchase_token: latestInfo.transaction_id,
        purchase_date: new Date(parseInt(latestInfo.purchase_date_ms)).toISOString(),
        expires_date: latestInfo.expires_date_ms ? 
            new Date(parseInt(latestInfo.expires_date_ms)).toISOString() : null,
        is_active: true,
        auto_renew: data.auto_renew_status === '1',
        original_transaction_id: latestInfo.original_transaction_id
    });

    await base44.auth.updateMe({
        has_paid: true,
        subscription_start_date: new Date(parseInt(latestInfo.purchase_date_ms)).toISOString()
    });

    return Response.json({ success: true, platform: 'ios' });
}

async function verifyGooglePurchase(base44, user, purchaseToken, productId) {
    const packageName = Deno.env.get('ANDROID_PACKAGE_NAME');
    const accessToken = Deno.env.get('GOOGLE_PLAY_ACCESS_TOKEN');
    
    const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    
    const response = await fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        return Response.json({ 
            success: false, 
            error: 'Invalid purchase token' 
        });
    }

    const data = await response.json();

    await base44.asServiceRole.entities.Entitlement.create({
        user_email: user.email,
        platform: 'android',
        product_id: productId,
        transaction_id: data.orderId,
        purchase_token: purchaseToken,
        purchase_date: new Date(parseInt(data.startTimeMillis)).toISOString(),
        expires_date: new Date(parseInt(data.expiryTimeMillis)).toISOString(),
        is_active: data.paymentState === 1,
        auto_renew: data.autoRenewing,
        original_transaction_id: data.orderId
    });

    await base44.auth.updateMe({
        has_paid: true,
        subscription_start_date: new Date(parseInt(data.startTimeMillis)).toISOString()
    });

    return Response.json({ success: true, platform: 'android' });
}