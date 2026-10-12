import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { filterAll } from '../../shared/listAll.ts';

// Audits OneSignal's scheduled-notification list against what the app actually
// tracks, and cancels anything live that no task references.
//
// Why this exists: OneSignal is the source of truth for what will FIRE, but the
// app only knows about IDs it still has stored. Any booked notification that
// falls out of a task's reminder_schedule keeps firing forever with nothing
// pointing at it — invisible to every task-scoped cleanup we have.
//
// Resumable on purpose: OneSignal rate-limits list paging hard, so one call
// walks a slice and returns nextOffset. Pass dryRun to measure without deleting.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const startOffset = Number(body.offset) || 0;
    const maxPages = Number(body.maxPages) || 30;
    const dryRun = body.dryRun !== false; // default: measure only

    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    if (!appId || !restKey) return Response.json({ error: 'OneSignal not configured' }, { status: 500 });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const nowSec = Math.floor(Date.now() / 1000);

    // Every notification ID the app still considers real, from both the id list
    // and the schedule itself (the schedule is authoritative, the list mirrors it).
    const tracked = new Set<string>();
    let taskCount = 0;
    for (let skip = 0; skip < 5000; skip += 500) {
      const page = await base44.asServiceRole.entities.Task.list('-created_date', 500, skip);
      if (!page.length) break;
      taskCount += page.length;
      for (const t of page) {
        for (const id of t.onesignal_notification_ids || []) if (id) tracked.add(String(id));
        for (const e of t.reminder_schedule || []) if (e?.notification_id) tracked.add(String(e.notification_id));
      }
      if (page.length < 500) break;
    }
    // A Parking Lot tracker's "time to log" reminder (Oct 12 2026).
    for (const t of await filterAll(base44.asServiceRole.entities.ParkingLotIdea, { tracker: true })) {
      if (t.tracker_notification_id) tracked.add(String(t.tracker_notification_id));
    }
    for (let skip = 0; skip < 2000; skip += 500) {
      const page = await base44.asServiceRole.entities.ScheduledText.list('-created_date', 500, skip);
      if (!page.length) break;
      for (const t of page) for (const id of t.onesignal_notification_ids || []) if (id) tracked.add(String(id));
      if (page.length < 500) break;
    }

    let offset = startOffset;
    let scanned = 0;
    let apiTotal: number | null = null;
    let rateLimitHits = 0;
    let exhausted = false;
    const orphans: any[] = [];
    let liveTracked = 0;

    for (let p = 0; p < maxPages; p++) {
      const res = await fetch(
        `https://onesignal.com/api/v1/notifications?app_id=${appId}&limit=50&offset=${offset}`,
        { headers: { Authorization: `Basic ${restKey}` } }
      );
      if (res.status === 429) {
        rateLimitHits++;
        if (rateLimitHits > 6) break;
        await sleep(5000);
        continue;
      }
      if (!res.ok) break;
      const json = await res.json();
      apiTotal = json.total_count;
      const batch = json.notifications || [];
      scanned += batch.length;

      for (const n of batch) {
        if (n.canceled || n.completed_at) continue;          // already dead or already sent
        if (!n.send_after || n.send_after <= nowSec) continue; // not a future scheduled push
        if (tracked.has(n.id)) { liveTracked++; continue; }
        orphans.push({
          id: n.id,
          sendAt: new Date(n.send_after * 1000).toISOString(),
          title: (n.headings?.en || '').slice(0, 70),
          taskId: n.data?.taskId || null,
        });
      }

      offset += 50;
      if (!batch.length || (apiTotal !== null && offset >= apiTotal)) { exhausted = true; break; }
      await sleep(600);
    }

    let cancelled = 0;
    const cancelErrors: any[] = [];
    if (!dryRun) {
      for (const o of orphans) {
        const r = await fetch(`https://onesignal.com/api/v1/notifications/${o.id}?app_id=${appId}`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${restKey}` },
        });
        if (r.ok) cancelled++;
        else if (r.status === 429) { await sleep(4000); const retry = await fetch(`https://onesignal.com/api/v1/notifications/${o.id}?app_id=${appId}`, { method: 'DELETE', headers: { Authorization: `Basic ${restKey}` } }); if (retry.ok) cancelled++; else cancelErrors.push({ id: o.id, status: retry.status }); }
        else cancelErrors.push({ id: o.id, status: r.status });
        await sleep(150);
      }
    }

    return Response.json({
      dryRun,
      apiTotal,
      startOffset,
      nextOffset: offset,
      exhausted,
      scannedThisRun: scanned,
      rateLimitHits,
      trackedIdsKnown: tracked.size,
      tasksInspected: taskCount,
      liveTrackedFound: liveTracked,
      orphansFound: orphans.length,
      orphanSample: orphans.slice(0, 15),
      cancelled,
      cancelErrors: cancelErrors.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}