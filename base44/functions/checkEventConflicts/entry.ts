// Double bookings and duplicates, the app's side of it (shared/eventConflicts.ts
// is the checker; the calendar import calls it directly).
//
//   { taskIds: [...] }            check these tasks (just added or moved in the
//                                 app) against everything else of theirs; flags
//                                 what's found, books the fallback notification,
//                                 returns the new flags with their two items.
//   { pending: true }             the flags still waiting for an answer (shown
//                                 on app open: a sync may have run with the app
//                                 closed).
//   { resolve: { flagId, action, keepTaskId?, fields? } }
//                                 action: 'seen' (the popup is up: no fallback
//                                 notification), 'keep', 'different', 'moved',
//                                 or 'combine' with keepTaskId and which details
//                                 to take from the other one
//                                 (fields.title/time/notes/location: 'kept' |
//                                 'other', notes also 'both').
//
// Signed-in people only, on their own tasks.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { flagConflicts, pendingFlags, resolveFlag } from '../../shared/eventConflicts.ts';

async function whoIsAsking(base44: any) {
  for (let i = 0; i < 3; i++) {
    try {
      return await base44.auth.me();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = await createClientFromRequest(req);
    const user = await whoIsAsking(base44);
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body?.resolve) {
      const r = body.resolve;
      const out = await resolveFlag(base44, user, {
        flagId: String(r.flagId || ''),
        action: String(r.action || ''),
        keepTaskId: r.keepTaskId ? String(r.keepTaskId) : undefined,
        fields: r.fields && typeof r.fields === 'object' ? r.fields : undefined,
      });
      return Response.json(out, { status: out.ok ? 200 : 400 });
    }

    if (body?.pending === true) {
      return Response.json(await pendingFlags(base44, user));
    }

    const ids = Array.isArray(body?.taskIds) ? body.taskIds.map(String).filter(Boolean).slice(0, 20) : [];
    if (!ids.length) return Response.json({ error: 'taskIds, pending or resolve required' }, { status: 400 });
    // Their own tasks only (the user's client sees only their rows).
    const tasks = await base44.entities.Task.filter({ id: { $in: ids } }, '-created_date', ids.length).catch(() => []);
    const result = await flagConflicts(base44, user, tasks, { source: 'app', notify: body?.notify !== false });
    return Response.json(result);
  } catch (e) {
    console.error('[checkEventConflicts]', e);
    return Response.json({ error: String((e as any)?.message || e) }, { status: 500 });
  }
});
