import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ 
                success: false, 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        const diagnostics = {
            timestamp: new Date().toISOString(),
            user_email: user.email,
            checks: {}
        };

        // Check 1: OneSignal credentials in Deno
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
        diagnostics.checks.deno_onesignal = {
            has_app_id: !!appId,
            has_rest_key: !!restKey,
            app_id_length: appId?.length || 0,
            rest_key_length: restKey?.length || 0
        };

        // Check 2: Scheduler (no longer calling external scheduler, but OneSignal directly)
        // Renamed 'scheduler' check to 'onesignal_direct_send_via_schedulePush' for clarity
        // The schedulePush function now directly handles OneSignal API calls.
        diagnostics.checks.onesignal_direct_send_via_schedulePush = {
            status: 'N/A - schedulePush now handles OneSignal directly',
            notes: 'SCHEDULER_URL and SCHEDULER_SECRET are no longer used by schedulePush for direct OneSignal calls.'
        };


        // Check 3: User's tasks with reminders
        const tasks = await base44.asServiceRole.entities.Task.filter({
            created_by: user.email,
            status: 'active'
        }, '-updated_date', 10);
        
        const tasksWithReminders = tasks.filter(t => t.next_reminder);
        diagnostics.checks.user_tasks = {
            total_active: tasks.length,
            with_reminders: tasksWithReminders.length,
            upcoming_reminders: tasksWithReminders.map(t => ({
                task_id: t.id,
                title: t.title,
                next_reminder: t.next_reminder,
                interval: t.reminder_interval,
                time_until: t.next_reminder ? 
                    Math.round((new Date(t.next_reminder).getTime() - Date.now()) / 60000) + ' minutes' 
                    : 'N/A'
            }))
        };

        // Check 4: Try direct OneSignal API call (unchanged)
        if (appId && restKey) {
            try {
                const testResponse = await fetch(`https://onesignal.com/api/v1/apps/${appId}`, {
                    headers: {
                        'Authorization': `Basic ${restKey}` // Using Basic auth as per OneSignal docs
                    }
                });
                diagnostics.checks.onesignal_api_status_check = {
                    status: testResponse.status,
                    ok: testResponse.ok,
                    details: await testResponse.json() // Get details from response
                };
            } catch (e) {
                diagnostics.checks.onesignal_api_status_check = {
                    error: e.message
                };
            }
        }

        // Check 5: Try calling schedulePush (unchanged)
        try {
            const testPayload = {
                toUserExternalId: user.email,
                title: "Test Notification (scheduled 1 min from now)",
                body: "This is a test notification from schedulePush.",
                minutesFromNow: 1
            };
            
            const scheduleResponse = await base44.functions.invoke('schedulePush', testPayload);
            diagnostics.checks.test_schedule_push_call = {
                response: scheduleResponse.data
            };
        } catch (e) {
            diagnostics.checks.test_schedule_push_call = {
                error: e.message
            };
        }

        return Response.json(diagnostics);

    } catch (error) {
        console.error('[debugNotifications] Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});