import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns the total number of registered app users so the Community page can
// show a live "X members and counting" counter. Service role is required
// because listing users is admin-restricted for app users.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let total = 0;
    let skip = 0;
    const limit = 500;
    // Paginate the full user list for an accurate count.
    while (true) {
      const batch = await base44.asServiceRole.entities.User.list('-created_date', limit, skip);
      if (!batch || batch.length === 0) break;
      total += batch.length;
      if (batch.length < limit) break;
      skip += limit;
    }

    return Response.json({ count: total });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}