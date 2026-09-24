import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // TEMPORARY, removed right after it runs once (Anna's request, Sep 24):
    // quiet hours now end at 8 AM by default. Every profile still on the old
    // default window (10 PM - 7 AM) moves to 10 PM - 8 AM, except
    // shirarose823's, which instead gets the one-time "your quiet hours"
    // popup flag. Admin only.
    const body = await req.json().catch(() => ({}));
    if (body?.migrate === 'quiet_end_8am') {
      const me = await base44.auth.me().catch(() => null);
      if (me?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const users = await base44.asServiceRole.entities.User.filter({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
      const moved = [];
      const flagged = [];
      for (const u of users) {
        if (u.email === 'shirarose823@gmail.com') {
          await base44.asServiceRole.entities.User.update(u.id, { quiet_hours_review_pending: true });
          flagged.push(u.email);
        } else {
          await base44.asServiceRole.entities.User.update(u.id, { quiet_hours_end: '08:00' });
          moved.push(u.email);
        }
      }
      return Response.json({ moved, flagged });
    }
    
    console.log('Testing task access...');
    
    // Test 1: List all tasks as service role (no filter)
    let test1Result = null;
    try {
      const allTasks = await base44.asServiceRole.entities.Task.list();
      test1Result = { success: true, count: allTasks.length, sample: allTasks[0] || null };
    } catch (e) {
      test1Result = { success: false, error: e.message };
    }
    
    // Test 2: Filter tasks as service role (with empty filter)
    let test2Result = null;
    try {
      const allTasks = await base44.asServiceRole.entities.Task.filter({});
      test2Result = { success: true, count: allTasks.length, sample: allTasks[0] || null };
    } catch (e) {
      test2Result = { success: false, error: e.message };
    }
    
    // Test 3: List tasks as authenticated user
    let test3Result = null;
    try {
      const user = await base44.auth.me();
      const myTasks = await base44.entities.Task.list();
      test3Result = { success: true, count: myTasks.length, user_email: user.email, sample: myTasks[0] || null };
    } catch (e) {
      test3Result = { success: false, error: e.message };
    }
    
    // Test 4: Check DailySummary (which we know works)
    let test4Result = null;
    try {
      const summaries = await base44.asServiceRole.entities.DailySummary.list();
      test4Result = { success: true, count: summaries.length };
    } catch (e) {
      test4Result = { success: false, error: e.message };
    }
    
    return Response.json({
      test1_service_role_list: test1Result,
      test2_service_role_filter: test2Result,
      test3_user_list: test3Result,
      test4_daily_summary_works: test4Result,
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});