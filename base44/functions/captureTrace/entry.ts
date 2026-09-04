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
    const step = body.step || 'unknown';
    const detail = JSON.stringify(body.detail ?? null);
    console.log(`[TRACE] ${step} | user=${user?.email || 'anon'} | ${detail}`);

    // Also persisted as a record so the trace can be inspected directly
    // instead of relying on someone copying function logs out of the phone.
    await base44.asServiceRole.entities.CaptureTrace.create({
      step,
      detail: detail.slice(0, 4000),
      user_email: user?.email || 'anon',
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[TRACE] failed:', error);
    return Response.json({ ok: false }, { status: 200 });
  }
});