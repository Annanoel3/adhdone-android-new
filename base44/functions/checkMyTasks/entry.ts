import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify authentication
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      return Response.json({ 
        error: 'Not authenticated', 
        details: authError.message 
      }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 401 });
    }

    // Get tasks using asServiceRole to see ALL fields including created_by
    const allTasks = await base44.asServiceRole.entities.Task.list('-created_date', 50);
    
    // Filter to just this user's tasks
    const myTasks = allTasks.filter(t => 
      t.created_by === user.email || t.created_by === user.id
    );

    // Get tasks with reminders
    const tasksWithReminders = myTasks.filter(t => t.next_reminder && t.status === 'active');

    return Response.json({
      user_email: user.email,
      user_id: user.id,
      total_tasks_in_db: allTasks.length,
      my_tasks_count: myTasks.length,
      tasks_with_reminders: tasksWithReminders.length,
      sample_tasks: myTasks.slice(0, 5).map(t => ({
        title: t.title,
        created_by: t.created_by,
        next_reminder: t.next_reminder,
        reminder_interval: t.reminder_interval,
        status: t.status
      })),
      reminder_tasks: tasksWithReminders.slice(0, 3).map(t => ({
        title: t.title,
        created_by: t.created_by,
        next_reminder: t.next_reminder,
        reminder_interval: t.reminder_interval
      }))
    });
  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});