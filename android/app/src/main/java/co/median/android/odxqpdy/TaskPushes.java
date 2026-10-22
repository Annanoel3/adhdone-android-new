package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

import java.util.Map;

/**
 * A finished task's reminders come out of the notification shade.
 *
 * Reminders are booked ahead with OneSignal. Finishing a task cancels the ones
 * still waiting, but one already on its way (booked for the same minute the
 * task was checked off, or held up while the phone was offline) still arrived
 * and sat in the shade for a task that was done ("Take Pills" checked off at
 * 5:00 PM, and its 5:00 PM reminder showed up right after).
 *
 *  - Every reminder shown for a task is remembered here (the newest few).
 *  - When the server says the task was finished, deleted or parked (the silent
 *    drop_alarms_task push, see PushFilter), the ones still showing are
 *    cleared, and the moment is kept for a day.
 *  - A reminder for that task SENT before that moment and arriving after it is
 *    not shown. One sent after it (the task was un-checked and booked again)
 *    shows as usual. Both times are the servers' clocks, never the phone's.
 */
final class TaskPushes {

    private static final String TAG = "ADHDone";
    private static final String SHOWN_PREFS = "adhdone_task_pushes_shown";
    private static final String FINISHED_PREFS = "adhdone_task_pushes_finished";
    private static final long FINISHED_KEEP_MS = 24L * 60L * 60L * 1000L;
    private static final int SHOWN_MAX_PER_TASK = 6;

    private TaskPushes() {
    }

    /** A reminder about this task is being shown with this Android notification id. */
    static void rememberShown(Context c, String taskId, int androidId) {
        if (taskId == null || taskId.isEmpty() || androidId == 0) {
            return;
        }
        try {
            SharedPreferences prefs = c.getSharedPreferences(SHOWN_PREFS, Context.MODE_PRIVATE);
            String was = prefs.getString(taskId, "");
            StringBuilder out = new StringBuilder(String.valueOf(androidId));
            int kept = 1;
            for (String part : was.split(",")) {
                if (part.isEmpty() || part.equals(String.valueOf(androidId))) {
                    continue;
                }
                if (kept >= SHOWN_MAX_PER_TASK) {
                    break;
                }
                out.append(',').append(part);
                kept++;
            }
            prefs.edit().putString(taskId, out.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "TaskPushes: could not remember a shown reminder", e);
        }
    }

    /**
     * The server says this task was finished, deleted or parked at
     * {@code changedAtMs} (its clock): its reminders come out of the shade, and
     * any sent before then that arrive late are not shown.
     */
    static void finished(Context c, String taskId, long changedAtMs) {
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        long at = changedAtMs > 0L ? changedAtMs : System.currentTimeMillis();
        try {
            SharedPreferences prefs = c.getSharedPreferences(FINISHED_PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor ed = prefs.edit();
            long now = System.currentTimeMillis();
            for (Map.Entry<String, ?> e : prefs.getAll().entrySet()) {
                Object v = e.getValue();
                if (!(v instanceof Long) || now - (Long) v > FINISHED_KEEP_MS) {
                    ed.remove(e.getKey());
                }
            }
            long had = prefs.getLong(taskId, 0L);
            ed.putLong(taskId, Math.max(had, at));
            ed.apply();
        } catch (Exception e) {
            Log.w(TAG, "TaskPushes: could not note a finished task", e);
        }
        clearShown(c, taskId);
        // The quiet copy kept next to an alarm goes too.
        PushFilter.cancelMutedPush(c, taskId);
    }

    /**
     * Was this reminder sent (OneSignal's time, in ms) before the task was
     * finished? Then it was already on its way and is not shown. An unknown
     * send time says no, so a reminder is never lost on a guess.
     */
    static boolean sentBeforeFinish(Context c, String taskId, long sentMs) {
        if (taskId == null || taskId.isEmpty() || sentMs <= 0L) {
            return false;
        }
        try {
            long at = c.getSharedPreferences(FINISHED_PREFS, Context.MODE_PRIVATE).getLong(taskId, 0L);
            if (at <= 0L || System.currentTimeMillis() - at > FINISHED_KEEP_MS) {
                return false;
            }
            return sentMs <= at;
        } catch (Exception e) {
            return false;
        }
    }

    private static void clearShown(Context c, String taskId) {
        SharedPreferences prefs = c.getSharedPreferences(SHOWN_PREFS, Context.MODE_PRIVATE);
        String ids = prefs.getString(taskId, "");
        prefs.edit().remove(taskId).apply();
        int cleared = 0;
        for (String part : ids.split(",")) {
            if (part.isEmpty()) {
                continue;
            }
            int id;
            try {
                id = Integer.parseInt(part);
            } catch (NumberFormatException e) {
                continue;
            }
            // Through OneSignal first, so it counts as dismissed and is never
            // restored on a later app start; then Android's own cancel.
            try {
                com.onesignal.OneSignal.getNotifications().removeNotification(id);
            } catch (Exception ignored) {
            }
            try {
                NotificationManagerCompat.from(c).cancel(id);
            } catch (Exception ignored) {
            }
            cleared++;
        }
        if (cleared > 0) {
            Log.d(TAG, "TaskPushes: cleared " + cleared + " reminder(s) for finished task " + taskId);
        }
    }
}
