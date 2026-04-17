import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const { notificationId } = await req.json();
    
    if (!notificationId) {
      return Response.json({ 
        success: false, 
        error: 'notificationId required' 
      }, { status: 400 });
    }

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return Response.json({ 
        success: false, 
        error: 'OneSignal credentials missing' 
      }, { status: 500 });
    }

    console.log(`[cancelScheduled] Canceling notification: ${notificationId}`);

    // Delete notification from OneSignal
    const url = `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      }
    });

    const result = await response.json().catch(() => ({}));
    
    console.log(`[cancelScheduled] OneSignal response:`, result);

    return Response.json({ 
      success: response.ok,
      notificationId,
      status: response.status,
      result
    });
  } catch (error) {
    console.error('[cancelScheduled] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});