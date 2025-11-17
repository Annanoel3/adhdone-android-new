import { createClient } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    // Initialize with service role (no auth required for migration)
    const base44 = createClient(
      Deno.env.get('BASE44_APP_ID'),
      Deno.env.get('BASE44_API_KEY')
    );

    // Get all tasks
    const tasks = await base44.entities.Task.list('-created_date', 10000);
    
    console.log(`Found ${tasks.length} total tasks`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const task of tasks) {
      // Only update if notification_recipient_email is not set
      if (!task.notification_recipient_email && task.created_by) {
        await base44.entities.Task.update(task.id, {
          notification_recipient_email: task.created_by
        });
        updated++;
        console.log(`✅ Updated task ${task.id}: ${task.created_by}`);
      } else {
        skipped++;
      }
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} skipped`);

    return Response.json({ 
      success: true, 
      message: `Updated ${updated} tasks, skipped ${skipped}`,
      total: tasks.length,
      updated,
      skipped
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});