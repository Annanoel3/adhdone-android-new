import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// cronTaskReminders: bookkeeping only — advances next_reminder so cronRefillReminders
// knows when to schedule the next batch. Does NOT send any notifications itself.

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

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    if (!providedSecret) {
      try { providedSecret = (await req.clone().json()).secret || ''; } catch (_) {}
    }
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const now = Date.now();

    const allUsers = await base44.asServiceRole.entities.User.list();
    let advanced = 0;

    for (const user of allUsers) {
      const tasks = await base44.asServiceRole.entities.Task.filter({ created_by: user.email });
      // Never a birthday: its next_reminder IS the birthday — the day and the
      // time its reminders go out. The yearly rollover in cronRefillReminders
      // moves it on the day after. Clearing it here, the moment that time
      // passed on the birthday itself, made the birthday vanish from the
      // Birthdays page and Home, and it could never roll over to next year.
      const isBirthday = (t) => !!t.birthday_person || t.classification === 'birthday' || !!t.is_own_birthday;
      // Only a REPEATING reminder has a next time to move on to. A one-time
      // task or an event keeps its date and time for good — nothing may
      // disappear or change just because its time went by. (This used to clear
      // their next_reminder once it passed, which dropped events off the
      // Calendar and left tasks with no time on their card.)
      const activeTasks = tasks.filter(t =>
        t.status === 'active' && t.next_reminder && !isBirthday(t) && !!intervalMs[t.reminder_interval]
      );

      for (const t of activeTasks) {
        const when = parseWhen(t.next_reminder);
        if (!when || when > now) continue;

        const ms = intervalMs[t.reminder_interval];
        let nextTime = when + ms;
        while (nextTime <= now) nextTime += ms;
        const next = new Date(nextTime).toISOString();

        await base44.asServiceRole.entities.Task.update(t.id, {
          reminder_count: (t.reminder_count || 0) + 1,
          next_reminder: next
        });

        console.log(`[cronTaskReminders] Advanced next_reminder for "${t.title}" → ${next}`);
        advanced++;
      }
    }

    return Response.json({ success: true, advanced, at: new Date().toISOString() });
  } catch (err) {
    console.error('[cronTaskReminders] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});