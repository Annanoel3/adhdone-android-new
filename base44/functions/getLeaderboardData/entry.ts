import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use service role to get all users (bypasses RLS)
        const allUsers = await base44.asServiceRole.entities.User.list('-daily_points');
        
        // Filter to only users who opted in to leaderboard
        const leaderboardUsers = allUsers
            .filter(u => u.show_on_leaderboard)
            .slice(0, 50) // Top 50
            .map((u, index) => ({
                rank: index + 1,
                email: u.email,
                name: u.leaderboard_anonymous 
                    ? `Player #${u.id.slice(0, 6)}` 
                    : (u.display_name || u.full_name || 'Anonymous'),
                points: u.daily_points || 0,
                level: u.level || 1,
                profile_picture: u.leaderboard_anonymous ? null : u.profile_picture_url,
                isCurrentUser: u.email === user.email
            }));

        // Find current user's rank
        const userRankIndex = allUsers.findIndex(u => u.email === user.email);
        const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;

        return Response.json({
            leaderboard: leaderboardUsers,
            currentUser: {
                rank: userRank,
                points: user.daily_points || 0,
                level: user.level || 1,
                showOnLeaderboard: user.show_on_leaderboard || false
            }
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});