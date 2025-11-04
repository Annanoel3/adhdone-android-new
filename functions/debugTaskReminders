import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get current user
    const me = await base44.auth.me();
    
    // Try different methods to get tasks
    const results = {
      my_email: me.email,
      test1_as_user: null,
      test2_service_role_filter_email: null,
      test3_service_role_filter_id: null,
      test4_service_role_list: null,
    };

    // Test 1: As the authenticated user
    try {
      const tasks = await base44.entities.Task.filter({ status: 'active' });
      results.test1_as_user = {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          next_reminder: t.next_reminder,
          created_by: t.created_by,
        }))
      };
    } catch (e) {
      results.test1_as_user = { error: String(e) };
    }

    // Test 2: Service role filtering by email
    try {
      const tasks = await base44.asServiceRole.entities.Task.filter({
        created_by: me.email,
        status: 'active'
      });
      results.test2_service_role_filter_email = {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          next_reminder: t.next_reminder,
          created_by: t.created_by,
        }))
      };
    } catch (e) {
      results.test2_service_role_filter_email = { error: String(e) };
    }

    // Test 3: Service role filtering by ID
    try {
      const tasks = await base44.asServiceRole.entities.Task.filter({
        created_by_id: me.id,
        status: 'active'
      });
      results.test3_service_role_filter_id = {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          next_reminder: t.next_reminder,
          created_by: t.created_by,
        }))
      };
    } catch (e) {
      results.test3_service_role_filter_id = { error: String(e) };
    }

    // Test 4: Service role list all
    try {
      const tasks = await base44.asServiceRole.entities.Task.list();
      const activeTasks = tasks.filter(t => t.status === 'active' && t.created_by === me.email);
      results.test4_service_role_list = {
        total: tasks.length,
        my_active: activeTasks.length,
        tasks: activeTasks.map(t => ({
          id: t.id,
          title: t.title,
          next_reminder: t.next_reminder,
          created_by: t.created_by,
        }))
      };
    } catch (e) {
      results.test4_service_role_list = { error: String(e) };
    }

    return Response.json(results);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});