package co.median.android.odxqpdy;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Confirmation feedback for captures made while the app is closed.
 *
 * Notifications rather than Toasts: the drain runs inside a WorkManager worker, and toasts
 * posted from the background are unreliable on Android 12+. CaptureActivity still shows an
 * immediate Toast because it genuinely is in the foreground at that moment.
 */
public final class CaptureNotifications {

    private static final String TAG = "ADHDone";

    private static final String CHANNEL_ID = "adhdone_capture_status";
    private static final String CHANNEL_NAME = "Capture confirmations";

    private static final int ID_ADDED = 4413;
    private static final int ID_NEEDS_AUTH = 4414;
    // 4415/4416 are the Today widget's PendingIntent request codes; these ids double as
    // request codes below, so they must stay clear of them.
    private static final int ID_NOTHING_FOUND = 4417;

    private static final long AUTO_DISMISS_MS = 8000;

    private CaptureNotifications() {
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
        channel.setDescription("Confirms tasks captured from the share sheet or quick capture");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    /**
     * Instant "Task added" acknowledgement, shown at CAPTURE time rather than after the
     * server round-trip.
     *
     * The drain takes several seconds, so acknowledging there felt broken. Both capture
     * entry points now confirm immediately instead: CaptureActivity for shares, and
     * QuickCaptureReceiver for notification replies. A reply is one message, so it is
     * always a single task — no count is involved.
     *
     * Plain text toast (custom-view toasts are blocked from the background on Android 12+),
     * posted to the main looper because callers may not be on one.
     */
    static void showTaskAddedToast(Context context) {
        final Context appContext = context.getApplicationContext();

        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    Toast.makeText(appContext, "Adding task", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Log.w(TAG, "showTaskAddedToast: toast failed: " + e.getMessage());
                }
            }
        });

        Log.d(TAG, "showTaskAddedToast: toast \"Adding task\"");

        // Clear any "Added" notification left over from a build that still posted one.
        try {
            NotificationManagerCompat.from(appContext).cancel(ID_ADDED);
        } catch (Exception e) {
            Log.w(TAG, "showTaskAddedToast: could not clear stale notification: " + e.getMessage());
        }
    }

    /** A shared image was read but held nothing that looks like a task — said once, then gone. */
    static void showNothingFound(Context context) {
        show(context, ID_NOTHING_FOUND, "ADHDone", "Couldn't find a task in that image", true);
    }

    /** The capture is safely stored but could not be sent because the session expired. */
    static void showNeedsAuth(Context context, int queuedCount) {
        String text = queuedCount > 1
                ? queuedCount + " captures saved — open ADHDone to finish"
                : "Saved — open ADHDone to finish";
        show(context, ID_NEEDS_AUTH, "ADHDone", text, false);
    }

    @SuppressLint("MissingPermission")
    private static void show(Context context, int id, String title, String text, boolean autoDismiss) {
        Context appContext = context.getApplicationContext();
        if (!QuickCapture.REASON_NONE.equals(QuickCapture.blockReason(appContext))) {
            // Notifications are blocked; the capture is still queued, just silently.
            return;
        }
        createChannel(appContext);

        Intent open = new Intent(appContext, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingOpen = PendingIntent.getActivity(appContext, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_adhdone)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setSilent(true)
                .setAutoCancel(true)
                .setContentIntent(pendingOpen);

        if (autoDismiss) {
            builder.setTimeoutAfter(AUTO_DISMISS_MS);
        }

        try {
            NotificationManagerCompat.from(appContext).notify(id, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "CaptureNotifications: could not post: " + e.getMessage());
        }
    }
}
