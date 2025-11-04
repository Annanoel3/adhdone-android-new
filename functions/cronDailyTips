import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

Deno.serve(async (req) => {
  try {
    console.log('💡 [DAILY TIPS] Starting daily tip cleanup...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!providedSecret) {
      try {
        const body = await req.json();
        providedSecret = body.secret || '';
      } catch (e) {
        // Body not JSON or empty, that's ok
      }
    }
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [DAILY TIPS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`📅 [DAILY TIPS] Today is ${today}`);
    console.log(`🗑️  [DAILY TIPS] Deleting all tips older than today...`);
    
    // Get all existing tips
    const allTips = await base44.asServiceRole.entities.DailyTip.list();
    
    let deletedCount = 0;
    
    // Delete any tips that aren't from today
    for (const tip of allTips) {
      if (tip.shown_date !== today) {
        await base44.asServiceRole.entities.DailyTip.delete(tip.id);
        deletedCount++;
        console.log(`🗑️  [DAILY TIPS] Deleted old tip from ${tip.shown_date}`);
      }
    }

    const result = {
      success: true,
      today: today,
      deleted: deletedCount,
      remaining: allTips.length - deletedCount,
      at: new Date().toISOString()
    };
    
    console.log('✅ [DAILY TIPS] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [DAILY TIPS] Fatal:', err);
    return Response.json({ 
      success: false, 
      error: String(err),
      stack: err.stack 
    }, { status: 500 });
  }
});