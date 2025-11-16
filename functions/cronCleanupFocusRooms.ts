import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

Deno.serve(async (req) => {
  try {
    console.log('🧹 [FOCUS ROOM CLEANUP] Starting focus room cleanup...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    const providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [FOCUS ROOM CLEANUP] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    console.log('🔍 [FOCUS ROOM CLEANUP] Fetching all focus rooms...');
    const rooms = await base44.asServiceRole.entities.FocusRoom.list();
    console.log(`📊 [FOCUS ROOM CLEANUP] Found ${rooms.length} total focus rooms`);
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    let deactivated = 0;
    let cleaned = 0;

    for (const room of rooms) {
      if (!room.is_active) {
        console.log(`⏭️  [FOCUS ROOM CLEANUP] Skipping room ${room.id} - already inactive`);
        continue;
      }

      const participants = await base44.asServiceRole.entities.FocusRoomParticipant.filter({ 
        room_id: room.id 
      });

      console.log(`👥 [FOCUS ROOM CLEANUP] Room "${room.room_name}" has ${participants.length} participants`);

      let hasRecentActivity = false;
      for (const p of participants) {
        if (p.last_seen && p.last_seen > oneHourAgo) {
          hasRecentActivity = true;
          console.log(`✅ [FOCUS ROOM CLEANUP] Found recent activity from ${p.display_name || p.user_email}`);
          break;
        }
      }

      if (!hasRecentActivity) {
        console.log(`🗑️  [FOCUS ROOM CLEANUP] Deactivating room "${room.room_name}" - no activity in 1 hour`);
        await base44.asServiceRole.entities.FocusRoom.update(room.id, {
          is_active: false
        });
        deactivated++;

        console.log(`🧹 [FOCUS ROOM CLEANUP] Cleaning up ${participants.length} participants from room`);
        for (const p of participants) {
          await base44.asServiceRole.entities.FocusRoomParticipant.delete(p.id);
        }
        cleaned += participants.length;
      }
    }

    const result = {
      success: true,
      scanned: rooms.length,
      deactivated,
      participants_cleaned: cleaned,
      at: new Date().toISOString(),
    };
    
    console.log('✅ [FOCUS ROOM CLEANUP] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [FOCUS ROOM CLEANUP] Fatal error:', err);
    return Response.json({ 
      success: false, 
      error: String(err),
      stack: err.stack 
    }, { status: 500 });
  }
});