import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Diagnostic sink for the task-capture pipeline. The app posts each step of a
// capture here so the whole decision path (split → subtasks → category → parse
// → create) is visible in one server-side log, since phone console logs aren't
// reachable. Safe to delete once the capture bug is closed.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    console.log(
      `[TRACE] ${body.step || 'unknown'} | user=${user?.email || 'anon'} | ` +
      JSON.stringify(body.detail ?? null)
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[TRACE] failed:', error);
    return Response.json({ ok: false }, { status: 200 });
  }
});