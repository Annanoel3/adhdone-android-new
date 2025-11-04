import { base44 } from '@/api/base44Client';

export async function checkAccess() {
    try {
        const user = await base44.auth.me();
        
        // Check trial
        if (!user.trial_start_date) {
            return { hasAccess: true, reason: 'no_trial_started' };
        }

        const trialStart = new Date(user.trial_start_date);
        const today = new Date();
        const daysSinceTrial = Math.floor((today - trialStart) / (1000 * 60 * 60 * 24));

        // Trial period is 3 days
        if (daysSinceTrial < 3) {
            return { hasAccess: true, reason: 'in_trial' };
        }

        // Check if user has paid
        if (user.has_paid) {
            return { hasAccess: true, reason: 'subscribed' };
        }

        // Verify with stores
        const response = await base44.functions.invoke('verifyStores');
        if (response.data.hasAccess) {
            return { hasAccess: true, reason: 'active_subscription' };
        }

        return { hasAccess: false, reason: 'trial_expired' };

    } catch (error) {
        console.error('Access check error:', error);
        // On error, allow access to avoid blocking users
        return { hasAccess: true, reason: 'error' };
    }
}

// Call this on app resume
if (window.median) {
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            const access = await checkAccess();
            if (!access.hasAccess) {
                window.location.href = '/TrialEnded';
            }
        }
    });
}