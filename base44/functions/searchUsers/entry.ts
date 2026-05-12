import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const searchQuery = body.query || body.searchQuery;

        console.log('[searchUsers] Search query:', searchQuery);

        if (!searchQuery || searchQuery.trim().length === 0) {
            return Response.json({ users: [] });
        }

        // Use service role to search all users
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        console.log('[searchUsers] Total users:', allUsers.length);
        
        const searchLower = searchQuery.toLowerCase();
        
        // Filter users matching search and with appropriate visibility
        const matchingUsers = allUsers.filter(u => {
            if (u.email === user.email) return false; // Exclude current user
            if (u.profile_visibility === 'private') return false; // Exclude private profiles
            
            const emailMatch = u.email.toLowerCase().includes(searchLower);
            const nameMatch = (u.display_name || u.full_name || '').toLowerCase().includes(searchLower);
            
            return emailMatch || nameMatch;
        });

        console.log('[searchUsers] Matching users:', matchingUsers.length);

        // Return only safe fields
        const safeUsers = matchingUsers.map(u => ({
            email: u.email,
            display_name: u.display_name,
            
            profile_picture_url: u.profile_picture_url,
            bio: u.bio,
            level: u.level,
            points: u.points,
            is_accountability_partner: u.is_accountability_partner
        }));

        return Response.json({ users: safeUsers });
    } catch (error) {
        console.error('[searchUsers] Error:', error);
        console.error('[searchUsers] Error message:', error.message);
        console.error('[searchUsers] Error stack:', error.stack);
        return Response.json({ error: error.message }, { status: 500 });
    }
});