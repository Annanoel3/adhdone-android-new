import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();

    // grab a couple of your tasks (as YOU)
    const mine = await base44.entities.Task.filter({ created_by: me?.email }, '-updated_date', 5)
      .catch(() => []);

    // also peek as service role (so we can see the raw values)
    const any = await base44.asServiceRole.entities.Task.filter({}, '-updated_date', 5)
      .catch(() => []);

    return Response.json({
      me: { id: me?.id, email: me?.email },
      sample_created_by_values: any.map(t => ({ id: t.id, created_by: t.created_by })).slice(0, 10),
      matched_by_email_count: mine.length
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});