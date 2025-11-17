import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all tasks using service role
    const tasks = await base44.asServiceRole.entities.Task.list('-created_date', 10000);
    
    let updated = 0;
    for (const task of tasks) {
      // Only update if notification_recipient_email is not set
      if (!task.notification_recipient_email && task.created_by) {
        await base44.asServiceRole.entities.Task.update(task.id, {
          notification_recipient_email: task.created_by
        });
        updated++;
      }
    }

    return Response.json({ 
      success: true, 
      message: `Updated ${updated} tasks`,
      total: tasks.length
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});