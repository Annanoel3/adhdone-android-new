package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Keeps the pinned quick-capture notification alive.
 *
 * Something outside the app can clear an ongoing notification without the app being
 * force-stopped — a reboot being the main one. This worker re-posts it if the user
 * still has quick capture switched on and notification 4411 is not currently showing.
 *
 * Deliberately cheap: no wakelock, no network, no constraints. When the notification is
 * already there it does nothing at all.
 */
public class QuickCaptureWorker extends Worker {

    private static final String TAG = "ADHDone";

    public QuickCaptureWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();

        if (!QuickCapture.isEnabled(context)) {
            // The user turned it off; scheduling is cancelled alongside, this is just a guard.
            return Result.success();
        }

        if (QuickCapture.isVisible(context)) {
            return Result.success();
        }

        Log.d(TAG, "QuickCaptureWorker: notification missing, re-posting");
        QuickCapture.post(context);
        return Result.success();
    }
}
