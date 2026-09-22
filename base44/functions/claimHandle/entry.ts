import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Names collide (there will be a hundred "Anna"s), so every account also gets a
// unique handle: their name, lowercased, plus a number. The display name stays
// freely editable; the handle is the stable id the future social features key on.
// Uniqueness has to be checked across ALL accounts, so it runs service-role here
// rather than in the browser.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // A handle is minted once per account. The welcome and catch-up chats call
    // this every time they run, and used to hand out a fresh random handle each
    // time (Anna7792, then Anna1246…) — the old one simply overwritten. An
    // account that already has one keeps it.
    if (user.handle && !body.force) {
      return Response.json({ handle: user.handle, existing: true });
    }

    const raw = (body.name || user.display_name || user.full_name || 'friend').toString();
    const base = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'friend';

    // Explicit limit: the default page is far too small to check for clashes.
    const all = await base44.asServiceRole.entities.User.list('-created_date', 2000);
    const taken = new Set(
      all.filter((u) => u.id !== user.id).map((u) => (u.handle || '').toLowerCase())
    );

    let handle = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      if (!taken.has(candidate)) { handle = candidate; break; }
    }
    if (!handle) handle = `${base}${Date.now().toString().slice(-6)}`;

    await base44.asServiceRole.entities.User.update(user.id, { handle });
    return Response.json({ handle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}