import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Diagnostic only; nothing in the app calls it. It reads every task with
    // admin rights and hands back a full sample record, so admins only.
    const me = await base44.auth.me().catch(() => null);
    if (me?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // TEMPORARY, removed right after it runs once (Anna's request, Sep 24): send
    // shirarose823's pending Zoloft check-in now instead of at its planned time.
    const body = await req.json().catch(() => ({}));
    if (body?.migrate === 'shira_checkin_now') {
      const [u] = await base44.asServiceRole.entities.User.filter({ email: 'shirarose823@gmail.com' });
      if (!u) return Response.json({ error: 'no user' });
      const schedule = Array.isArray(u.smart_nudge_schedule) ? u.smart_nudge_schedule : [];
      const nowIso = new Date().toISOString();
      let moved = 0;
      for (const e of schedule) {
        if (!e.sent && /zoloft/i.test(String(e.title || ''))) { e.send_at = nowIso; moved++; }
      }
      if (moved) await base44.asServiceRole.entities.User.update(u.id, { smart_nudge_schedule: schedule });
      return Response.json({ moved, send_at: nowIso });
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