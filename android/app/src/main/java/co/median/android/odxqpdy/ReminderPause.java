package co.median.android.odxqpdy;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.text.format.DateFormat;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Date;

/**
 * "Silence ADHDone for 1, 2 or 3 hours", from the pinned notification's buttons, the
 * Today widget, or "Quiet notifications" in the app's side menu (AlarmBridge.quietFor).
 *
 * While silenced, every reminder and alarm still ARRIVES, just quietly: a push shows in
 * the tray with no sound, vibration or pop-up (PushFilter), and a booked alarm that
 * comes due shows as a quiet notification instead of ringing (AlarmReceiver). Nothing is
 * dropped, moved or rebooked. Timers the person started themselves (focus timer, sprint,
 * launchpad) still ring: they asked for those moments ago. The silence ends on its own.
 */
final class ReminderPause {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_pause";
    private static final String KEY_UNTIL = "until";

    static final String ACTION_SILENCE = "co.median.android.odxqpdy.SILENCE";
    static final String ACTION_UNSILENCE = "co.median.android.odxqpdy.UNSILENCE";
    static final String ACTION_ENDED = "co.median.android.odxqpdy.SILENCE_ENDED";
    static final String EXTRA_HOURS = "adhdone_silence_hours";
    /** true = add the hours onto the current silence instead of counting from now. */
    static final String EXTRA_EXTEND = "adhdone_silence_extend";

    // PendingIntent request codes. Must not collide with QuickCapture (4411/4412),
    // CaptureNotifications (4413/4414) or the widget (4415/4416, 4420-4424).
    static final int RC_SILENCE_1 = 4431;
    static final int RC_SILENCE_2 = 4432;
    static final int RC_SILENCE_3 = 4433;
    static final int RC_UNSILENCE = 4434;
    static final int RC_EXTEND = 4435;
    private static final int RC_END = 4436;
    static final int RC_WIDGET = 4437;

    private static final String HELD_CHANNEL_ID = "adhdone_silenced";
    private static final String HELD_CHANNEL_NAME = "Reminders while silenced";

    private ReminderPause() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long until(Context c) {
        return prefs(c).getLong(KEY_UNTIL, 0L);
    }

    static boolean isPaused(Context c) {
        return until(c) > System.currentTimeMillis();
    }

    /** "2:40 PM" (or "14:40"), following the phone's own clock setting. */
    static String untilLabel(Context c) {
        return DateFormat.getTimeFormat(c).format(new Date(until(c)));
    }

    static void silence(Context c, int hours, boolean extend) {
        if (hours <= 0) {
            return;
        }
        long now = System.currentTimeMillis();
        long base = extend ? Math.max(now, until(c)) : now;
        long end = base + hours * 60L * 60L * 1000L;
        prefs(c).edit().putLong(KEY_UNTIL, end).apply();
        scheduleEnd(c, end);
        Log.d(TAG, "ReminderPause: silenced until " + end);
        refreshUi(c);
    }

    static void unsilence(Context c) {
        prefs(c).edit().putLong(KEY_UNTIL, 0L).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(endIntent(c));
        }
        Log.d(TAG, "ReminderPause: sound back on");
        refreshUi(c);
    }

    /** Redraw the pinned notification and the widget so both show the current state. */
    static void refreshUi(Context c) {
        if (QuickCapture.isEnabled(c)) {
            QuickCapture.post(c);
        }
        TodayWidgetProvider.refreshAll(c);
    }

    /**
     * While silenced, make sure the "silence is over" redraw is booked. A reboot drops
     * AlarmManager bookings; QuickCapture.post (which BootReceiver runs) calls this, and
     * booking the same PendingIntent again simply replaces it.
     */
    static void rearmEnd(Context c) {
        if (isPaused(c)) {
            scheduleEnd(c, until(c));
        }
    }

    static PendingIntent actionIntent(Context c, int requestCode, String action, int hours, boolean extend) {
        Intent i = new Intent(c, ReminderPauseReceiver.class)
                .setAction(action)
                .setPackage(c.getPackageName())
                .putExtra(EXTRA_HOURS, hours)
                .putExtra(EXTRA_EXTEND, extend);
        return PendingIntent.getBroadcast(c.getApplicationContext(), requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent endIntent(Context c) {
        return actionIntent(c, RC_END, ACTION_ENDED, 0, false);
    }

    private static void scheduleEnd(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        try {
            // Only the redraw depends on this: the silence itself ends exactly on time,
            // because isPaused() compares against the clock.
            if (AlarmScheduler.canScheduleExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, endIntent(c));
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, endIntent(c));
            }
        } catch (Exception e) {
            Log.w(TAG, "ReminderPause: could not book the end-of-silence redraw", e);
        }
    }

    /** Notification id of the quiet stand-in for a held alarm, one per task. */
    static int heldNotificationId(String key) {
        return AlarmScheduler.requestCode("held:" + key);
    }

    /** Is the quiet stand-in for this task's alarm already in the tray? */
    static boolean isHeldShowing(Context c, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return false;
        }
        int id = heldNotificationId(taskId);
        try {
            for (StatusBarNotification sbn : NotificationManagerCompat.from(c).getActiveNotifications()) {
                if (sbn.getId() == id) {
                    return true;
                }
            }
        } catch (Exception e) {
            // Can't tell: say no, so the reminder is shown rather than lost.
        }
        return false;
    }

    /**
     * A booked alarm came due while silenced. It does not ring; it shows as a quiet
     * notification instead, unless the reminder's own push is already sitting quietly
     * in the tray. Marked done so it never rings later.
     */
    static void holdAlarm(Context c, AlarmStore.Entry e) {
        e.done = true;
        AlarmStore.put(c, e);
        if (PushFilter.hasQuietCopy(c, e.taskId)) {
            return;
        }
        ensureHeldChannel(c);
        String title = !e.heading.isEmpty() ? e.heading : (!e.title.isEmpty() ? e.title : "ADHDone");
        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!e.taskId.isEmpty()) {
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, "/TaskNotification?taskId=" + Uri.encode(e.taskId));
        }
        String key = e.taskId.isEmpty() ? e.id : e.taskId;
        int notificationId = heldNotificationId(key);
        PendingIntent pi = PendingIntent.getActivity(c, notificationId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, HELD_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_adhdone)
                .setContentTitle(title)
                .setContentText(e.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(e.body))
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(c).notify(notificationId, b.build());
            Log.d(TAG, "ReminderPause: alarm " + e.id + " shown quietly instead of ringing");
        } catch (SecurityException ex) {
            Log.w(TAG, "ReminderPause: could not show held alarm " + e.id, ex);
        }
    }

    private static void ensureHeldChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(HELD_CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel ch = new NotificationChannel(HELD_CHANNEL_ID, HELD_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Alarms that came due while you had ADHDone silenced. They show here quietly instead of ringing.");
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }
}
