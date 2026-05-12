import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userEmail } = await req.json();

        if (!userEmail) {
            return Response.json({ error: 'User email required' }, { status: 400 });
        }

        // Use service role to get the target user
        const allUsers = await base44.asServiceRole.entities.User.list();
        const targetUser = allUsers.find(u => u.email === userEmail);

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if profile is visible
        if (targetUser.profile_visibility === 'private') {
            // Check if they're connected
            const connections = await base44.asServiceRole.entities.AccountabilityConnection.list();
            const connected = connections.some(c =>
                c.status === 'accepted' &&
                ((c.requester_email === user.email && c.recipient_email === userEmail) ||
                 (c.recipient_email === user.email && c.requester_email === userEmail))
            );

            if (!connected) {
                return Response.json({ error: 'Profile is private' }, { status: 403 });
            }
        }

        // Return safe profile data
        const profile = {
            email: targetUser.email,
            display_name: targetUser.display_name,
            profile_picture_url: targetUser.profile_picture_url,
            bio: targetUser.bio,
            level: targetUser.level,
            points: targetUser.points,
            is_accountability_partner: targetUser.is_accountability_partner
        };

        return Response.json({ profile });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});