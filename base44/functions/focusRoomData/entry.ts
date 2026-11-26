import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { filterAll } from '../../shared/listAll.ts';

// Focus Rooms: the three things the app needs that a signed-in person may no
// longer read or change directly (access rules, Nov 25 2026: a person's place
// in a room can be read and changed only by that person).
//
//   counts        how many people are in each live room, as numbers only, for
//                 the room lists. Public rooms, and the caller's own rooms.
//   participants  who is in a room, answered only to someone who is in that
//                 room themselves. Anyone else gets an empty list.
//   deleteRoom    the host removing their room, with everyone's place in it
//                 and its messages.
//
// Every action needs a signed-in caller. The service role is used only after
// the check each action names.
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user || !user.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, roomId } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities;

    if (action === 'counts') {
      const rooms = (await filterAll(svc.FocusRoom, { is_active: true }))
        .filter((r) => !r.is_private || r.host_email === user.email);
      const counts = {};
      for (const r of rooms) counts[r.id] = { total: 0, active: 0 };
      if (rooms.length > 0) {
        const people = await filterAll(svc.FocusRoomParticipant, { room_id: { $in: rooms.map((r) => r.id) } });
        const since = Date.now() - ACTIVE_WINDOW_MS;
        for (const p of people) {
          const c = counts[p.room_id];
          if (!c) continue;
          c.total++;
          if (new Date(p.last_seen).getTime() > since) c.active++;
        }
      }
      return Response.json({ counts });
    }

    if (action !== 'participants' && action !== 'deleteRoom') {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (!roomId || typeof roomId !== 'string') {
      return Response.json({ error: 'roomId is required' }, { status: 400 });
    }

    if (action === 'participants') {
      // Only someone with a place in this room may see who else is in it.
      const mine = await svc.FocusRoomParticipant.filter({ room_id: roomId, user_email: user.email });
      if (!Array.isArray(mine) || mine.length === 0) return Response.json({ participants: [] });
      const participants = await filterAll(svc.FocusRoomParticipant, { room_id: roomId });
      return Response.json({ participants });
    }

    // deleteRoom: only the room's host.
    const found = await svc.FocusRoom.filter({ id: roomId });
    const room = Array.isArray(found) ? found[0] : null;
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });
    if (room.host_email !== user.email) {
      return Response.json({ error: 'Only the host can delete this room' }, { status: 403 });
    }
    await svc.FocusRoomParticipant.deleteMany({ room_id: roomId });
    await svc.FocusRoomEmoji.deleteMany({ room_id: roomId });
    await svc.FocusRoom.delete(roomId);
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}