package co.median.android.odxqpdy;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * QuickCapture — the pinned, silent ADHDone notification, plus its persisted on/off
 * preference. Tapping it opens the small "type a task" box (never the app); its three
 * buttons silence ADHDone for 1, 2 or 3 hours (ReminderPause).
 */
public final class QuickCapture {

    private static final String TAG = "ADHDone";

    static final String PREFS_NAME = "adhdone_prefs";
    static final String KEY_ENABLED = "quick_capture_enabled";

    static final String CHANNEL_ID = "adhdone_quick_capture";
    static final String CHANNEL_NAME = "Quick capture";
    static final int NOTIFICATION_ID = 4411;

    /** RemoteInput result key for the inline reply. */
    static final String REMOTE_INPUT_KEY = "adhdone_reply";
    /** Intent extra carrying the typed reply into MainActivity. */
    static final String EXTRA_CAPTURED_TEXT = "adhdone_captured_text";

    private static final int REQUEST_CONTENT = 4411;
    private static final int REQUEST_REPLY = 4412;

    /** Unique name for the keep-alive work, so it can never be enqueued twice. */
    static final String KEEPALIVE_WORK_NAME = "adhdone_quick_capture_keepalive";
    /** 15 minutes is WorkManager's floor for periodic work. */
    private static final long KEEPALIVE_INTERVAL_MINUTES = 15;

    private QuickCapture() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    /** Nothing is blocking the notification. */
    static final String REASON_NONE = "";
    /** Notifications are off for the whole app (or POST_NOTIFICATIONS is not granted). */
    static final String REASON_PERMISSION = "permission";
    /** The app can post, but the user has blocked this specific channel. */
    static final String REASON_CHANNEL = "channel";

    /**
     * Why the quick-capture notification could not be shown right now, or REASON_NONE.
     *
     * Checks every layer that can silently swallow a post: the API 33+ runtime permission,
     * the app-wide notification toggle (the only gate that exists below API 33), and the
     * per-channel block on API 26+.
     */
    static String blockReason(Context context) {
        Context appContext = context.getApplicationContext();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return REASON_PERMISSION;
        }

        // Below API 33 this is the real gate; on 33+ it also reflects the permission.
        if (!NotificationManagerCompat.from(appContext).areNotificationsEnabled()) {
            return REASON_PERMISSION;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = appContext.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
                // A missing channel is fine — post() creates it. A blocked one is not.
                if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                    return REASON_CHANNEL;
                }
            }
        }

        return REASON_NONE;
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Pinned shortcut for adding tasks without opening the app");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    /** Post (or refresh) the pinned quick-capture notification. */
    @SuppressLint("MissingPermission")
    static void post(Context context) {
        Context appContext = context.getApplicationContext();
        String blocked = blockReason(appContext);
        if (!REASON_NONE.equals(blocked)) {
            Log.d(TAG, "QuickCapture.post skipped, blocked by: " + blocked);
            return;
        }
        createChannel(appContext);

        // Tapping the notification opens the same small "type a task" box as the Today
        // widget's "+" (WidgetCaptureActivity): it never opens the app. That frees all
        // three of Android's action buttons for silencing ADHDone. (The typing field used
        // to live in the notification itself, as an inline reply, which took a button.)
        Intent contentIntent = new Intent(appContext, WidgetCaptureActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                appContext,
                REQUEST_CONTENT,
                contentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // The buttons silence ADHDone: while silenced, reminders and alarms still show up,
        // just with no sound, vibration or pop-up (see ReminderPause). The idle wording
        // ("Expand to pause notifications", "Choose how long notifications should be quiet",
        // 1 hour / 2 hours / 3 hours) is the owner's own choice of words.
        boolean silenced = ReminderPause.isPaused(appContext);
        String title;
        String text;
        String bigText;
        if (silenced) {
            ReminderPause.rearmEnd(appContext);
            title = "ADHDone is silenced until " + ReminderPause.untilLabel(appContext);
            text = "Reminders still show up, just quietly. Tap here to add a task.";
            bigText = "Reminders and alarms still show up here, just with no sound. "
                    + "Tap here to add a task.";
        } else {
            title = "Tap here to add a task";
            // Collapsed, the buttons are hidden; this line says where they are.
            text = "Expand to pause notifications \u2193";
            bigText = "Choose how long notifications should be quiet \uD83D\uDD15"; // 🔕
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext, CHANNEL_ID)
                // Dedicated white-on-transparent status-bar mark. Android masks small icons
                // to their alpha channel, so the full-bleed adaptive launcher foreground
                // rendered as a solid blob; this vector is drawn for the purpose.
                .setSmallIcon(R.drawable.ic_stat_adhdone)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle()
                        .setBigContentTitle(title)
                        .bigText(bigText))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setSilent(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setLocalOnly(true)
                .setContentIntent(contentPendingIntent);

        if (silenced) {
            builder.addAction(0, "Sound back on", ReminderPause.actionIntent(appContext,
                    ReminderPause.RC_UNSILENCE, ReminderPause.ACTION_UNSILENCE, 0, false));
            builder.addAction(0, "Add 1 hour", ReminderPause.actionIntent(appContext,
                    ReminderPause.RC_EXTEND, ReminderPause.ACTION_SILENCE, 1, true));
        } else {
            builder.addAction(0, "1 hour", ReminderPause.actionIntent(appContext,
                    ReminderPause.RC_SILENCE_1, ReminderPause.ACTION_SILENCE, 1, false));
            builder.addAction(0, "2 hours", ReminderPause.actionIntent(appContext,
                    ReminderPause.RC_SILENCE_2, ReminderPause.ACTION_SILENCE, 2, false));
            builder.addAction(0, "3 hours", ReminderPause.actionIntent(appContext,
                    ReminderPause.RC_SILENCE_3, ReminderPause.ACTION_SILENCE, 3, false));
        }

        try {
            // Notification.isClearable() checks FLAG_ONGOING_EVENT *and* FLAG_NO_CLEAR, but
            // NotificationCompat only sets the former (via setOngoing). Samsung One UI's
            // "Clear all" sweeps this notification despite setOngoing(true), so set the
            // second flag explicitly too — there is no builder method for it.
            Notification notification = builder.build();
            notification.flags |= Notification.FLAG_NO_CLEAR;

            NotificationManagerCompat.from(appContext).notify(NOTIFICATION_ID, notification);
            Log.d(TAG, "QuickCapture notification posted");
        } catch (SecurityException e) {
            Log.w(TAG, "QuickCapture.post failed: " + e.getMessage());
        }
    }

    /** Remove the pinned quick-capture notification. */
    static void cancel(Context context) {
        NotificationManagerCompat.from(context.getApplicationContext()).cancel(NOTIFICATION_ID);
        Log.d(TAG, "QuickCapture notification cancelled");
    }

    /** True when the pinned notification is currently in the status bar. */
    static boolean isVisible(Context context) {
        try {
            for (StatusBarNotification posted :
                    NotificationManagerCompat.from(context.getApplicationContext())
                            .getActiveNotifications()) {
                if (posted.getId() == NOTIFICATION_ID) {
                    return true;
                }
            }
        } catch (Exception e) {
            // Treat "cannot tell" as not visible: re-posting is idempotent, missing it is not.
            Log.w(TAG, "QuickCapture.isVisible failed: " + e.getMessage());
        }
        return false;
    }

    /**
     * Start the periodic keep-alive. Idempotent via KEEP, so calling it repeatedly (app
     * open, boot, toggle) never stacks up duplicate work. WorkManager persists this in its
     * own database and re-arms it after a reboot on its own, which is what makes it a
     * backstop for BootReceiver rather than a duplicate of it.
     */
    static void scheduleKeepAlive(Context context) {
        try {
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    QuickCaptureWorker.class, KEEPALIVE_INTERVAL_MINUTES, TimeUnit.MINUTES)
                    .addTag(KEEPALIVE_WORK_NAME)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniquePeriodicWork(
                            KEEPALIVE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
            Log.d(TAG, "QuickCapture keep-alive scheduled");
        } catch (Exception e) {
            // Never let scheduling problems break the toggle itself.
            Log.w(TAG, "QuickCapture.scheduleKeepAlive failed: " + e.getMessage());
        }
    }

    /** Stop the periodic keep-alive. */
    static void cancelKeepAlive(Context context) {
        try {
            WorkManager.getInstance(context.getApplicationContext())
                    .cancelUniqueWork(KEEPALIVE_WORK_NAME);
            Log.d(TAG, "QuickCapture keep-alive cancelled");
        } catch (Exception e) {
            Log.w(TAG, "QuickCapture.cancelKeepAlive failed: " + e.getMessage());
        }
    }
}
