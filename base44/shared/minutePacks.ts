// Bought recording minutes (Anna, Oct 25 2026: free accounts get 60 minutes a
// month; more can be bought as packs on Google Play through RevenueCat).
//
// RevenueCat is the source of truth. Every credit comes from re-reading the
// customer from RevenueCat's API with the secret key (REVENUECAT_SECRET_KEY),
// never from what a request or a webhook body claims, so a forged call can at
// most trigger a harmless re-read. One MinutePack row per RevenueCat purchase
// id, so a purchase is never credited twice however many times it's synced.
// Rows are written only with the service role (the entity's RLS lets people
// read their own and write nothing).
//
// Spending: the month's free minutes go first; bought minutes are only spent
// on what's past them, oldest pack first, and they never expire.

export const PACK_SECONDS: Record<string, number> = {
  notes_1h: 60 * 60,
  notes_5h: 5 * 60 * 60,
};

const isBase44Id = (id: unknown) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);

// RevenueCat Test Store purchases (debug builds, made with the test_ key) cost
// nothing, so they only count for Anna's own test accounts. Google Play
// license-tester purchases are real Play purchases she set up the testers for,
// so those count for anyone.
const TEST_STORE_ACCOUNTS = ["s2kap2chick@gmail.com", "annanoelwenballew@outlook.com"];
export const mayUseTestStore = (email: unknown) => TEST_STORE_ACCOUNTS.includes(String(email || "").toLowerCase());

// What RevenueCat has for this person: { configured, ok, purchases: [{ id, product_id, ... }] }.
async function readRevenueCat(appUserId: string) {
  const key = (Deno.env.get("REVENUECAT_SECRET_KEY") || "").trim();
  if (!key) return { configured: false, ok: false, purchases: [] as any[] };
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const sub = (await res.json())?.subscriber || {};
  const purchases: any[] = [];
  for (const [productId, list] of Object.entries<any>(sub.non_subscriptions || {})) {
    if (!PACK_SECONDS[productId]) continue;
    for (const p of Array.isArray(list) ? list : []) {
      if (!p?.id) continue;
      purchases.push({
        id: String(p.id),
        product_id: productId,
        store_transaction_id: p.store_transaction_id ? String(p.store_transaction_id) : null,
        purchased_at: p.purchase_date || null,
        sandbox: !!p.is_sandbox,
        store: p.store || null,
        refunded: !!p.refunded_at,
      });
    }
  }
  return { configured: true, ok: true, purchases };
}

export async function packsOf(db: any, userId: string): Promise<any[]> {
  const rows = await db.MinutePack.filter({ user_id: userId });
  return Array.isArray(rows) ? rows : [];
}

export function leftOf(rows: any[]): number {
  return rows
    .filter((r) => r?.status === "credited")
    .reduce((sum, r) => sum + Math.max(0, (Number(r.seconds) || 0) - (Number(r.seconds_used) || 0)), 0);
}

// Brings this person's packs in line with RevenueCat: new purchases credited,
// refunded ones switched off. RevenueCat drops a consumable from
// non_subscriptions once it's refunded (it sends CANCELLATION at that moment),
// so a credited pack that's no longer listed was refunded.
export async function syncPacks(db: any, userId: string, opts: { allowTestStore?: boolean } = {}) {
  if (!isBase44Id(userId)) return { configured: true, added: 0, refunded: 0, left_seconds: 0 };
  const rc = await readRevenueCat(userId);
  if (!opts.allowTestStore) rc.purchases = rc.purchases.filter((p) => !/test/i.test(String(p.store || "")));
  const rows = await packsOf(db, userId);
  if (!rc.configured) return { configured: false, added: 0, refunded: 0, left_seconds: leftOf(rows) };

  const have = new Map(rows.map((r) => [String(r.rc_transaction_id), r]));
  const listed = new Set(rc.purchases.filter((p) => !p.refunded).map((p) => p.id));
  let added = 0;
  let refunded = 0;
  for (const p of rc.purchases) {
    if (p.refunded || have.has(p.id)) continue;
    // Re-check right before writing: a webhook and the app can sync the same
    // purchase within a second of each other.
    const again = await db.MinutePack.filter({ user_id: userId, rc_transaction_id: p.id });
    if (Array.isArray(again) && again.length) continue;
    const row = await db.MinutePack.create({
      user_id: userId,
      rc_transaction_id: p.id,
      store_transaction_id: p.store_transaction_id,
      product_id: p.product_id,
      seconds: PACK_SECONDS[p.product_id],
      seconds_used: 0,
      status: "credited",
      purchased_at: p.purchased_at,
      sandbox: p.sandbox,
      store: p.store,
    });
    rows.push(row);
    added += 1;
  }
  for (const r of rows) {
    if (r?.status === "credited" && r.rc_transaction_id && !listed.has(String(r.rc_transaction_id))) {
      await db.MinutePack.update(r.id, { status: "refunded" });
      r.status = "refunded";
      refunded += 1;
    }
  }
  // Two rows for one purchase (a race the re-check above didn't catch): keep
  // the oldest, so the extra copy can't be spent.
  const seen = new Set<string>();
  const byAge = [...rows].sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")));
  for (const r of byAge) {
    const k = String(r.rc_transaction_id);
    if (r.status !== "credited") continue;
    if (seen.has(k)) {
      await db.MinutePack.update(r.id, { status: "refunded" });
      r.status = "refunded";
    } else {
      seen.add(k);
    }
  }
  return { configured: true, added, refunded, left_seconds: leftOf(rows) };
}

// Spends `seconds` of bought time, oldest pack first. Returns how much it
// could spend (less than asked only when the packs ran out).
export async function spendPacks(db: any, userId: string, seconds: number): Promise<number> {
  let need = Math.max(0, Math.round(Number(seconds) || 0));
  if (!need) return 0;
  const rows = (await packsOf(db, userId))
    .filter((r) => r?.status === "credited")
    .sort((a, b) => String(a.purchased_at || a.created_date || "").localeCompare(String(b.purchased_at || b.created_date || "")));
  let spent = 0;
  for (const r of rows) {
    if (!need) break;
    const left = Math.max(0, (Number(r.seconds) || 0) - (Number(r.seconds_used) || 0));
    if (!left) continue;
    const take = Math.min(left, need);
    await db.MinutePack.update(r.id, { seconds_used: (Number(r.seconds_used) || 0) + take });
    need -= take;
    spent += take;
  }
  return spent;
}

// The Base44 user ids a RevenueCat webhook event is about (TRANSFER events
// name both sides).
export function eventUserIds(ev: any): string[] {
  const list = (v: any) => (Array.isArray(v) ? v : []);
  const ids = [ev?.app_user_id, ev?.original_app_user_id, ...list(ev?.aliases), ...list(ev?.transferred_from), ...list(ev?.transferred_to)];
  return [...new Set(ids.filter(isBase44Id))].slice(0, 10) as string[];
}
