package co.median.android.odxqpdy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.RemoteInput;

/**
 * Handles the inline reply on the pinned quick-capture notification: opens the app with
 * the typed text so the web app can pre-fill Add Task, then re-posts the notification so
 * its reply field resets.
 */
public class QuickCaptureReceiver extends BroadcastReceiver {

    private static final String TAG = "ADHDone";

    static final String ACTION_REPLY = "co.median.android.odxqpdy.QUICK_CAPTURE_REPLY";

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence reply = results != null
                ? results.getCharSequence(QuickCapture.REMOTE_INPUT_KEY)
                : null;
        String text = reply != null ? reply.toString().trim() : "";

        if (!text.isEmpty()) {
            Log.d(TAG, "QuickCaptureReceiver: reply of " + text.length() + " chars");
            // Silent capture: write to the durable queue and let the worker create the task.
            // The app is deliberately never opened, which also sidesteps the Android 12+
            // notification-trampoline restriction on starting activities from a receiver.
            CaptureQueue.enqueue(context, text);
            // Acknowledge instantly, at reply time. Waiting for the drain to confirm meant
            // a ~6-7s delay before any feedback appeared.
            CaptureNotifications.showTaskAddedToast(context);
            CaptureSyncWorker.kick(context);
        }

        // Re-post so the inline reply UI resets and the notification stays pinned.
        if (QuickCapture.isEnabled(context)) {
            QuickCapture.post(context);
        }
    }
}
