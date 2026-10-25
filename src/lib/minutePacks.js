import { base44 } from "@/api/base44Client";

// Buying more recording minutes (Anna, Oct 25 2026). Google Play does the
// payment through RevenueCat (BillingBridge in the Android project, the same
// bridge Happy Plants uses); the recordingMinutes function credits the minutes
// after re-reading the purchase from RevenueCat. Builds without BillingBridge
// (anything before the build that added it, and the website) simply can't buy:
// billingAvailable() is false there and the Notes page shows what it always did.

const MINUTES = { notes_1h: 60, notes_5h: 300 };

const bridge = () => (typeof window !== "undefined" && window.Capacitor?.Plugins?.BillingBridge) || null;

export async function billingAvailable() {
  const B = bridge();
  if (!B?.isAvailable) return false;
  try {
    const r = await B.isAvailable();
    return !!r?.available;
  } catch (e) {
    return false; // not on this build
  }
}

// Seconds left on bought packs. People can read their own MinutePack rows
// (and only those); only the server writes them.
export async function boughtLeftSeconds(userId) {
  if (!userId) return 0;
  try {
    const rows = await base44.entities.MinutePack.filter({ user_id: userId });
    return (rows || [])
      .filter((r) => r?.status === "credited")
      .reduce((sum, r) => sum + Math.max(0, (Number(r.seconds) || 0) - (Number(r.seconds_used) || 0)), 0);
  } catch (e) {
    return 0;
  }
}

let configuredFor = null;
async function ready(user) {
  const B = bridge();
  if (!B || !user?.id) throw new Error("billing_unavailable");
  if (configuredFor !== user.id) {
    await B.configure({ appUserId: user.id });
    configuredFor = user.id;
  }
  return B;
}

// The packs for sale, cheapest first, with Google Play's own price text in the
// person's currency: [{ id, productId, price, minutes }].
export async function loadPacks(user) {
  const B = await ready(user);
  const r = await B.getOfferings();
  return (r?.packages || [])
    .map((p) => ({ id: p.id, productId: p.productId, price: p.price, priceMicros: Number(p.priceMicros) || 0, minutes: MINUTES[p.productId] || MINUTES[p.id] || 0 }))
    .filter((p) => p.minutes > 0)
    .sort((a, b) => a.priceMicros - b.priceMicros);
}

// Asks the server to credit anything bought that it hasn't yet.
export async function syncPacks() {
  try {
    const res = await base44.functions.invoke("recordingMinutes", { mode: "sync" });
    return res?.data || { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

// { cancelled } | { ok, added, left_seconds } | { pending } | throws with a message to show.
export async function buyPack(user, pack) {
  const B = await ready(user);
  let r;
  try {
    r = await B.purchase({ packageId: pack.id });
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (/pending/i.test(msg)) return { pending: true };
    throw new Error(msg || "The purchase didn't go through");
  }
  if (r?.cancelled) return { cancelled: true };
  // RevenueCat has the purchase before purchase() returns; a second try covers
  // the rare moment it's still being saved.
  let s = await syncPacks();
  if (s?.ok && !s.added) {
    await new Promise((res) => setTimeout(res, 2500));
    s = await syncPacks();
  }
  return { ok: true, ...s };
}
