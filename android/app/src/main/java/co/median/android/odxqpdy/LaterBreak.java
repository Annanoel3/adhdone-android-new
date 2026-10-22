package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.util.Calendar;

/**
 * "Later" on an alarm (or on a reminder's notification) is a break the person
 * asked for, not a data point. Until 1.3.14 it only counted: the ring stopped,
 * and the next nudge or hourly ping came as if nothing had been said (Anna, Oct 6
 * 2026: Later twice on the towels, reminded again 39 minutes on).
 *
 * The rule, the same on the phone and the server (widgetBridge.js laterBreakUntil
 * and cancelTaskNotifications mode "later"): the first Later on a task in a day
 * gives it three hours; a second Later the same day runs until their next
 * morning, when their quiet hours end (never less than three hours; Anna, Oct
 * 10 2026: not everyone's morning is 8 AM). A break never gets shorter here.
 * A task due today gets no break at all (Anna, Oct 11 2026: "things with hard
 * due dates that are that day do not count for the later rules"): the phone
 * can't see due dates, so it starts the usual break and the server's answer
 * ends it, turning back on any of the task's alarms the break had turned off.
 * When the break ends the task is an ordinary task again: Smart Reminders
 * weighs it against everything else by priority.
 *
 * What happens at the tap, right here, with no app open and no sync:
 *  - the task's alarms booked inside the break come off this phone
 *    (AlarmScheduler.dropTaskUntil), and none are booked inside it later
 *    (AlarmScheduler.schedule), whatever list the web app or the server sends;
 *  - a push about the task that still arrives inside the break shows quietly
 *    (PushFilter) — no sound, no ring;
 *  - the server is told at once and takes the task's smart nudges, planned
 *    reminders and rhythm pings off for the break. The tap goes through the
 *    phone's report queue (ChoiceReports), so with no signal it is sent the
 *    moment there is one, app open or not (it used to wait for the app to be
 *    opened). The server's end time, worked out in the person's own time zone
 *    and quiet hours, replaces the phone's when it answers.
 */
final class LaterBreak {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_later_breaks";
    static final long BREAK_MS = 3L * 60L * 60L * 1000L;
    /** Their quiet hours' end, minutes after midnight (the web app sends it, see WakeWatch). */
    static final int DEFAULT_MORNING_MIN = 8 * 60;

    private LaterBreak() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** When this task's break ends, or 0 when it has none. */
    static long until(Context c, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return 0L;
        }
        return prefs(c).getLong(taskId, 0L);
    }

    /** Is this moment inside the task's break? */
    static boolean covers(Context c, String taskId, long momentMs) {
        long until = until(c, taskId);
        return until > 0L && momentMs < until && until > System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
    }

    static void setUntil(Context c, String taskId, long untilMs) {
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        prefs(c).edit().putLong(taskId, untilMs).apply();
    }

    /** The break this tap earns, by the rule above, and kept on the phone. */
    static long computeAndStore(Context c, String taskId) {
        long now = System.currentTimeMillis();
        long prev = until(c, taskId);
        Calendar startOfToday = Calendar.getInstance();
        startOfToday.set(Calendar.HOUR_OF_DAY, 0);
        startOfToday.set(Calendar.MINUTE, 0);
        startOfToday.set(Calendar.SECOND, 0);
        startOfToday.set(Calendar.MILLISECOND, 0);
        boolean secondToday = prev >= startOfToday.getTimeInMillis();
        long until;
        if (secondToday) {
            // Their next morning (when quiet hours end), but never less than the
            // three hours a first Later gives.
            int morningMin = WakeWatch.quietEndMinutes(c);
            until = 0L;
            for (int d = 0; d < 3 && until == 0L; d++) {
                Calendar m = Calendar.getInstance();
                m.add(Calendar.DAY_OF_YEAR, d);
                m.set(Calendar.HOUR_OF_DAY, morningMin / 60);
                m.set(Calendar.MINUTE, morningMin % 60);
                m.set(Calendar.SECOND, 0);
                m.set(Calendar.MILLISECOND, 0);
                if (m.getTimeInMillis() > now) {
                    until = Math.max(m.getTimeInMillis(), now + BREAK_MS);
                }
            }
            if (until == 0L) {
                until = now + BREAK_MS;
            }
        } else {
            until = now + BREAK_MS;
        }
        if (prev > until) {
            until = prev;
        }
        setUntil(c, taskId, until);
        prune(c, now);
        return until;
    }

    /** Breaks that ended more than two days ago are forgotten. */
    private static void prune(Context c, long now) {
        try {
            SharedPreferences p = prefs(c);
            SharedPreferences.Editor ed = p.edit();
            boolean any = false;
            for (java.util.Map.Entry<String, ?> e : p.getAll().entrySet()) {
                Object v = e.getValue();
                if (v instanceof Long && (Long) v < now - 2L * 24L * 60L * 60L * 1000L) {
                    ed.remove(e.getKey());
                    any = true;
                }
            }
            if (any) {
                ed.apply();
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Later was tapped for this task: the break starts on the phone now and the
     * server is told through the report queue (sent at once, or as soon as
     * there is a connection).
     */
    static void start(final Context ctx, final String taskId) {
        if (ctx == null || taskId == null || taskId.isEmpty()) {
            return;
        }
        final Context c = ctx.getApplicationContext();
        final long until = computeAndStore(c, taskId);
        int off = AlarmScheduler.dropTaskUntil(c, taskId, until);
        Log.d(TAG, "LaterBreak: " + taskId + " on a break until " + until + ", " + off + " alarm(s) off the phone");
        ChoiceReports.add(c, taskId, ChoiceReports.LATER, 0, until);
    }

    /**
     * The server's end time for the break (its own time zone and quiet hours)
     * is the one that counts. Alarms inside it come off this phone; the server
     * sends the task's alarm list after the break itself.
     */
    static void adoptServerUntil(Context ctx, String taskId, long serverUntil) {
        if (taskId == null || taskId.isEmpty() || serverUntil <= 0L) {
            return;
        }
        Context c = ctx.getApplicationContext();
        long local = until(c, taskId);
        if (serverUntil != local) {
            setUntil(c, taskId, serverUntil);
            AlarmScheduler.dropTaskUntil(c, taskId, serverUntil);
            if (serverUntil < local) {
                AlarmScheduler.reviveTask(c, taskId);
            }
        }
    }

    /** "2026-10-06T22:39:21.505Z" → ms, or 0 when unreadable. */
    static long parseIso(String iso) {
        if (iso == null || iso.isEmpty()) {
            return 0L;
        }
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            String base = iso.length() >= 19 ? iso.substring(0, 19) : iso;
            java.util.Date d = f.parse(base);
            return d != null ? d.getTime() : 0L;
        } catch (Exception e) {
            return 0L;
        }
    }
}
