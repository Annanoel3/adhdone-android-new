import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use service role to access all users
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        // Filter to only users with public profiles who are looking for accountability
        const publicUsers = allUsers.filter(u => 
            u.looking_for_accountability === true &&
            u.profile_visibility !== 'private' &&
            u.email !== user.email // Exclude current user
        );

        // Return only safe fields
        const safeUsers = publicUsers.map(u => ({
            email: u.email,
            display_name: u.display_name,
            full_name: u.full_name,
            profile_picture_url: u.profile_picture_url,
            bio: u.bio,
            level: u.level,
            total_points: u.total_points
        }));

        return Response.json({ users: safeUsers });
    } catch (error) {
        console.error('Error fetching public profiles:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});