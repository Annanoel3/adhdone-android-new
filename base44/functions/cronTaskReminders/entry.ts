import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

const intervalMs = {
  '10min': 10 * 60 * 1000,
  '20min': 20 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '2hours': 2 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

function parseWhen(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function isInQuietHours(user) {
  if (!user.quiet_hours_enabled || !user.quiet_hours_start || !user.quiet_hours_end) {
    return false;
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = user.quiet_hours_start.split(':').map(Number);
  const [endHour, endMin] = user.quiet_hours_end.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime > endTime) {
    return currentTime >= startTime || currentTime <= endTime;
  }
  
  return currentTime >= startTime && currentTime <= endTime;
}

Deno.serve(async (req) => {
  try {
    console.log('⏰ [TASK REMINDERS] Starting task reminder check...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!providedSecret) {
      try {
        const body = await req.json();
        providedSecret = body.secret || '';
      } catch (e) {
        // Body not JSON or empty, that's ok
      }
    }
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [TASK REMINDERS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const now = Date.now();
    const cutoff = now + 5 * 60 * 1000; // Check tasks due in next 5 minutes

    console.log('👥 [TASK REMINDERS] Getting all users...');
    const allUsers = await base44.asServiceRole.entities.User.list();
    console.log(`📊 [TASK REMINDERS] Found ${allUsers.length} users`);
    console.log(`🕐 [TASK REMINDERS] Current time: ${new Date(now).toISOString()}`);
    console.log(`🕐 [TASK REMINDERS] Cutoff time: ${new Date(cutoff).toISOString()}`);

    let totalScanned = 0;
    let ok = 0, fail = 0, skippedQuietHours = 0;

    for (const user of allUsers) {
      try {
        if (user.notification_settings?.task_reminders === false) {
          console.log(`⏭️  [TASK REMINDERS] Skipping ${user.email} - notifications disabled`);
          continue;
        }

        if (isInQuietHours(user)) {
          console.log(`🌙 [TASK REMINDERS] Skipping ${user.email} - in quiet hours (${user.quiet_hours_start} - ${user.quiet_hours_end})`);
          skippedQuietHours++;
          continue;
        }

        const tasks = await base44.asServiceRole.entities.Task.filter({
          created_by: user.email
        });

        const activeTasks = tasks.filter(t => t.status === 'active');
        totalScanned += activeTasks.length;

        console.log(`📋 [TASK REMINDERS] User ${user.email} has ${activeTasks.length} active tasks`);

        for (const t of activeTasks) {
          if (!t.next_reminder) continue;
          
          const when = parseWhen(t.next_reminder);
          
          console.log(`🔍 [TASK REMINDERS] Task "${t.title}" (ID: ${t.id}): interval=${t.reminder_interval}, next_reminder=${t.next_reminder}, parsed=${new Date(when).toISOString()}, now=${new Date(now).toISOString()}`);
          
          if (when && when <= now) {
            console.log(`🔔 [TASK REMINDERS] Sending reminder to ${user.email}: "${t.title}" (ID: ${t.id})`);

            const r = await base44.asServiceRole.functions.invoke('notifySend', {
              toUserId: user.email,
              title: 'Task Reminder 📋',
              body: t.title || 'You have a task due',
              screen: '/Tasks',
            });

            if (r?.data?.success) {
              let next = null;
              const ms = t.reminder_interval ? intervalMs[t.reminder_interval] : 0;
              
              console.log(`📊 [TASK REMINDERS] Task has interval: ${t.reminder_interval}, ms: ${ms}`);
              
              // For recurring reminders, calculate next time
              if (ms && ms > 0) {
                const lastReminderTime = parseWhen(t.next_reminder);
                let nextTime = lastReminderTime + ms;
                
                // If we're multiple intervals behind, catch up to the next future one
                const nowTime = Date.now();
                while (nextTime <= nowTime) {
                  nextTime += ms;
                }
                
                next = new Date(nextTime).toISOString();
                console.log(`✅ [TASK REMINDERS] Calculated next reminder: ${next} (in ${Math.round((nextTime - nowTime) / 60000)} minutes)`);
              } else {
                console.log(`⚠️ [TASK REMINDERS] No recurring interval, next_reminder will be null`);
              }

              // Update task with new next_reminder
              console.log(`💾 [TASK REMINDERS] Updating task ${t.id} with reminder_count: ${(t.reminder_count || 0) + 1}, next_reminder: ${next}`);
              
              try {
                const updateResult = await base44.asServiceRole.entities.Task.update(t.id, {
                  reminder_count: (t.reminder_count || 0) + 1,
                  next_reminder: next
                });
                
                console.log(`💾 [TASK REMINDERS] ✅ Update successful for task ${t.id}:`, JSON.stringify(updateResult));
              } catch (updateError) {
                console.error(`💾 [TASK REMINDERS] ❌ Update FAILED for task ${t.id}:`, updateError);
                throw updateError;
              }

              ok++;
              console.log(`✅ [TASK REMINDERS] Complete for task ${t.id}`);
            } else {
              console.error('❌ [TASK REMINDERS] Notification send failed:', r?.data);
              fail++;
            }
          } else if (when > now) {
            console.log(`⏳ [TASK REMINDERS] Task "${t.title}" (ID: ${t.id}) not yet due: ${new Date(when).toISOString()} (in ${Math.round((when - now) / 60000)} minutes)`);
          }
        }
      } catch (userError) {
        console.error(`❌ [TASK REMINDERS] Error for user ${user.email}:`, userError);
      }
    }

    const result = {
      success: true,
      users: allUsers.length,
      scanned: totalScanned,
      sent: ok,
      errors: fail,
      skippedQuietHours: skippedQuietHours,
      at: new Date().toISOString(),
    };
    
    console.log('✅ [TASK REMINDERS] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [TASK REMINDERS] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});