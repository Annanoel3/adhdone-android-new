import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { syncPacks, packsOf, leftOf, eventUserIds, mayUseTestStore } from "../../shared/minutePacks.ts";

// Bought recording minutes (see base44/shared/minutePacks.ts).
//
// Two callers, one job: bring someone's packs in line with RevenueCat.
//   - The app, as the signed-in person: { mode: "sync" } right after a
//     purchase finishes (and when the Notes page opens), or { mode: "balance" }
//     to only read what's left. Answers { ok, configured, added, left_seconds }.
//   - RevenueCat's webhook (Integrations → Webhooks → this function's URL):
//     NON_RENEWING_PURCHASE, CANCELLATION (refunds), TRANSFER, etc. The event
//     is only used to know WHO to re-read; nothing in its body is trusted, so
//     the webhook needs no shared secret. Always answers 200 unless RevenueCat
//     itself couldn't be reached (then 500, so RevenueCat retries).

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  // RevenueCat webhook
  if (body?.event && typeof body.event === "object") {
    const ev = body.event;
    if (ev.type === "TEST") return Response.json({ ok: true, test: true });
    const ids = eventUserIds(ev);
    if (!ids.length) return Response.json({ ok: true, ignored: "no_user" });
    try {
      const results = [];
      for (const id of ids) {
        let u: any = null;
        try { u = (await db.User.filter({ id }))?.[0] || null; } catch (_) { u = null; }
        if (!u) continue;
        results.push({ id, ...(await syncPacks(db, id, { allowTestStore: mayUseTestStore(u.email) })) });
      }
      return Response.json({ ok: true, synced: results.length, type: ev.type });
    } catch (e) {
      console.error("[recordingMinutes] webhook sync failed:", (e as Error)?.message || e);
      return Response.json({ ok: false, error: "sync_failed" }, { status: 500 });
    }
  }

  // The app
  let me: any = null;
  try { me = await base44.auth.me(); } catch (_) { me = null; }
  if (!me?.id) return Response.json({ ok: false, error: "Sign in first" }, { status: 401 });

  if (body?.mode === "balance") {
    const rows = await packsOf(db, me.id);
    return Response.json({ ok: true, left_seconds: leftOf(rows) });
  }

  try {
    const r = await syncPacks(db, me.id, { allowTestStore: mayUseTestStore(me.email) });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error("[recordingMinutes] sync failed:", (e as Error)?.message || e);
    const rows = await packsOf(db, me.id).catch(() => []);
    return Response.json({ ok: false, error: "sync_failed", left_seconds: leftOf(rows) });
  }
});
