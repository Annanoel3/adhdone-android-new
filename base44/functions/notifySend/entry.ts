// functions/notifySend.js
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { toUserId, title, body, screen, data } = await req.json();

    if (!toUserId) {
      return Response.json({ success: false, error: 'toUserId required' }, { status: 400 });
    }

    console.log(`[notifySend] Sending notification to ${toUserId}`);
    console.log(`[notifySend] Title: ${title}, Body: ${body}`);

    // Get user to retrieve their player IDs and notification preferences
    const targetUser = await base44.asServiceRole.entities.User.filter({ email: toUserId });
    if (!targetUser || targetUser.length === 0) {
      console.error(`[notifySend] User not found: ${toUserId}`);
      return Response.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const user = targetUser[0];
    const playerIds = user.onesignal_player_ids || [];

    if (playerIds.length === 0) {
      console.log(`[notifySend] No OneSignal player IDs for ${toUserId}`);
      return Response.json({ success: false, error: 'No player IDs' }, { status: 400 });
    }

    console.log(`[notifySend] Found ${playerIds.length} player IDs for ${toUserId}`);

    // FIXED: Use notification_sound instead of notification_tone (matching NotificationSettings page)
    const notificationSound = user.notification_sound || 'joyful_melody';
    console.log(`[notifySend] Using notification sound: ${notificationSound}`);

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    // Map the sound key to actual file names
    const soundMap = {
      joyful_melody: 'joyful_melody',
      piano_melody: 'piano_melody',
      short_notification: 'short_notification',
      short_piano: 'short_piano',
      jr_station: 'jr_station',
      jr_station_3: 'jr_station_3',
      jr_osaka_loop: 'jr_osaka_loop',
      jr_morning_tranquility: 'jr_morning_tranquility',
      jr_flower_shop: 'jr_flower_shop'
    };

    const soundFile = soundMap[notificationSound] || 'joyful_melody';

    const ledgerKind = data?.type || 'general';
    const ledgerTaskId = data?.taskId || null;
    const gate = await ledgerCheck(base44, { email: toUserId, taskId: ledgerTaskId, kind: ledgerKind });
    if (!gate.allowed) {
      return Response.json({ success: false, skipped: true, reason: gate.reason });
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title || 'ADHDone' },
      contents: { en: body || 'You have a notification' },
      data: {
        screen: screen || '/Home',
        ...data
      },
      // Add iOS and Android sound settings based on user preference
      ios_sound: `${soundFile}.wav`,
      android_sound: soundFile,
      android_channel_id: 'adhdone_default'
    };

    console.log(`[notifySend] OneSignal payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`[notifySend] OneSignal response:`, JSON.stringify(result, null, 2));

    if (result.errors) {
      console.error(`[notifySend] OneSignal errors:`, result.errors);
      return Response.json({ success: false, error: result.errors }, { status: 500 });
    }

    await ledgerRecord(base44, { email: toUserId, taskId: ledgerTaskId, kind: ledgerKind, source: 'notifySend', notificationId: result.id, title });

    return Response.json({ 
      success: true, 
      recipients: result.recipients,
      sound: notificationSound
    });
  } catch (error) {
    console.error('[notifySend] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});