import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

Deno.serve(async (req) => {
  try {
    console.log('⚠️  [TRIAL WARNINGS] Starting trial warning check...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    const providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [TRIAL WARNINGS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    console.log('👥 [TRIAL WARNINGS] Getting all users...');
    const users = await base44.asServiceRole.entities.User.list();
    console.log(`📊 [TRIAL WARNINGS] Found ${users.length} users`);
    
    const today = new Date();
    let ok = 0, fail = 0;

    for (const user of users) {
      if (user.has_paid || !user.trial_start_date) {
        continue;
      }

      if (user.notification_settings?.trial_warnings === false) {
        console.log(`⏭️  [TRIAL WARNINGS] Skipping ${user.email} - notifications disabled`);
        continue;
      }

      const trialStart = new Date(user.trial_start_date);
      const daysSinceStart = Math.floor((today.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceStart === 2) {
        console.log(`🔔 [TRIAL WARNINGS] Sending warning to ${user.email} - trial ends in 1 day`);
        
        const r = await base44.asServiceRole.functions.invoke('notifySend', {
          toUserId: user.email,
          title: '⏰ Trial ending soon',
          body: 'Your trial ends tomorrow. Subscribe to keep using ADHDone!',
          screen: '/Subscribe',
        });

        if (r?.data?.success) {
          ok++;
          console.log('✅ [TRIAL WARNINGS] Sent successfully');
        } else {
          console.error('❌ [TRIAL WARNINGS] Failed:', r?.data);
          fail++;
        }
      }
    }

    const result = {
      success: true,
      checked: users.length,
      sent: ok,
      errors: fail,
      at: new Date().toISOString(),
    };
    
    console.log('✅ [TRIAL WARNINGS] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [TRIAL WARNINGS] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});