import { Contacts } from "@capacitor-community/contacts";

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function contactDisplay(c) {
  return c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(" ") || "";
}

/**
 * Reads the device contact list and returns the best match for `name`.
 * Returns { name, phone } or null if no match / unavailable / denied.
 * Native (Capacitor) only — web falls back to null (caller uses the picker).
 */
export async function findContactByName(name) {
  if (!name) return null;
  if (typeof window === "undefined" || !window.Capacitor) return null;

  try {
    const perm = await Contacts.checkPermissions();
    if (perm.contacts !== "granted") {
      const req = await Contacts.requestPermissions();
      if (req.contacts !== "granted") return null;
    }

    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });

    const target = normalize(name);
    if (!target) return null;

    let exact = null;
    let partial = null;
    for (const c of contacts || []) {
      const display = contactDisplay(c);
      const d = normalize(display);
      if (!d) continue;
      if (d === target) { exact = c; break; }
      if (!partial && (d.includes(target) || target.includes(d))) partial = c;
    }

    const best = exact || partial;
    if (!best) return null;
    const phone = best.phones?.[0]?.number || "";
    if (!phone) return null;
    return { name: contactDisplay(best), phone };
  } catch (e) {
    console.error("[contactMatcher] findContactByName failed", e);
    return null;
  }
}