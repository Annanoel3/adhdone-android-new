import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is logged in
    const user = await base44.auth.me();
    console.log(`Running migration as user: ${user.email}`);

    // Try to get tasks with regular client first to debug RLS
    console.log('Attempting to fetch tasks with regular client (user scope)...');
    const userTasks = await base44.entities.Task.list('-created_date', 100);
    console.log(`User scope found ${userTasks.length} tasks`);

    // Use service role to get ALL tasks regardless of RLS
    console.log('Attempting to fetch tasks with service role...');
    const tasks = await base44.asServiceRole.entities.Task.list('-created_date', 10000);
    
    console.log(`Service role found ${tasks.length} total tasks`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const task of tasks) {
      try {
        // Only update if notification_recipient_email is not set
        if (!task.notification_recipient_email && task.created_by) {
          await base44.asServiceRole.entities.Task.update(task.id, {
            notification_recipient_email: task.created_by
          });
          updated++;
          console.log(`✅ Updated task ${task.id}: ${task.created_by}`);
        } else {
          skipped++;
          if (task.notification_recipient_email) {
            console.log(`⏭️ Skipped task ${task.id}: already has recipient ${task.notification_recipient_email}`);
          } else {
            console.log(`⚠️ Skipped task ${task.id}: no created_by`);
          }
        }
      } catch (err) {
        errors++;
        console.error(`❌ Error updating task ${task.id}:`, err.message);
      }
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

    return Response.json({ 
      success: true, 
      message: `Updated ${updated} tasks, skipped ${skipped}, ${errors} errors`,
      total: tasks.length,
      updated,
      skipped,
      errors
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});