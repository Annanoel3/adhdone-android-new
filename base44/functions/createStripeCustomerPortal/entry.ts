import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

Deno.serve(async (req) => {
  try {
    // Method guard (optional)
    if (req.method !== 'GET' && req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Require the same secret you use for your cron jobs
    const url = new URL(req.url);
    const providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return Response.json({ success: false, error: 'Unauthorized (bad/missing secret)' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    // Optional: allow ?email=someone@example.com to check per-user visibility
    const emailParam = url.searchParams.get('email') || '';

    // Pull some sample tasks using service role (no user auth required)
    // Same pattern as your working cron: iterate by user if email is provided.
    let sampleAny = [];
    let forEmail = [];

    // Get a few recent tasks (service role ignores RLS for reading if your server role is configured)
    try {
      sampleAny = await base44.asServiceRole.entities.Task.filter({}, '-updated_date', 20);
    } catch (e) {
      sampleAny = [];
    }

    if (emailParam) {
      try {
        forEmail = await base44.asServiceRole.entities.Task.filter({ created_by: emailParam }, '-updated_date', 20);
      } catch (e) {
        forEmail = [];
      }
    }

    // Also try the user list (service role) just to confirm we can see users
    let usersCount = 0;
    try {
      const users = await base44.asServiceRole.entities.User.list();
      usersCount = Array.isArray(users) ? users.length : (Array.isArray(users?.items) ? users.items.length : 0);
    } catch {
      // ignore
    }

    // Return a compact picture of what's visible
    return Response.json({
      success: true,
      note: "Service-role debug. No user cookies needed.",
      usersCount,
      sampleTasksCount: sampleAny.length,
      sampleCreatedBy: sampleAny.slice(0, 10).map(t => ({ id: t.id, created_by: t.created_by, status: t.status, next_reminder: t.next_reminder })),
      emailParam: emailParam || null,
      tasksForEmailCount: forEmail.length,
      tasksForEmailPreview: forEmail.slice(0, 10).map(t => ({ id: t.id, title: t.title, next_reminder: t.next_reminder })),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});