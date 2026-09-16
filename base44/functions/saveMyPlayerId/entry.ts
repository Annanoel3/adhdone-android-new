import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { dedupeDevices } from '../../shared/deviceDedupe.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { playerId } = await req.json();

        if (!playerId) {
            return Response.json({ success: false, error: 'No player ID provided' }, { status: 400 });
        }

        console.log(`Saving OneSignal player ID ${playerId} for user ${user.email}`);

        const currentUser = await base44.asServiceRole.entities.User.filter({ email: user.email });
        const existing = currentUser[0]?.onesignal_player_ids || [];

        // Reinstalling the app mints a NEW subscription for the SAME phone while
        // the old one stays subscribed — appending forever meant every push was
        // delivered once per stale record (visible duplicate notifications).
        // Add the new id, then keep one live subscription per physical device.
        const merged = existing.includes(playerId) ? [...existing] : [...existing, playerId];
        const kept = await dedupeDevices(merged);
        // The id we were just handed is the device talking to us right now — it
        // must never be pruned away, even if OneSignal hasn't caught up yet.
        const finalIds = kept.includes(playerId) ? kept : [...kept, playerId];

        const changed = finalIds.length !== existing.length || finalIds.some((id) => !existing.includes(id));
        if (changed) {
            await base44.asServiceRole.entities.User.update(user.id, { onesignal_player_ids: finalIds });
            console.log(`Player IDs updated — ${existing.length} → ${finalIds.length} device(s)`);
        }

        return Response.json({ success: true, playerId, totalDevices: finalIds.length });
    } catch (error) {
        console.error('Error saving player ID:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});