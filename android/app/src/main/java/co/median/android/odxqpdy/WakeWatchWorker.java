package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Every 15 minutes (the shortest Android allows) while "Notice when I wake up"
 * is on: has the phone been unlocked yet this morning? (WakeWatch.) Android
 * holds these checks while the phone sleeps untouched and lets them run soon
 * after it's picked up, so the server hears within about 15 minutes of waking.
 */
public class WakeWatchWorker extends Worker {

    private static final String TAG = "ADHDone";
    static final String WORK_NAME = "adhdone_wake_watch";

    public WakeWatchWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context c) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(WakeWatchWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build();
            WorkManager.getInstance(c.getApplicationContext())
                    .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Exception e) {
            Log.w(TAG, "WakeWatchWorker: could not schedule", e);
        }
    }

    static void cancel(Context c) {
        try {
            WorkManager.getInstance(c.getApplicationContext()).cancelUniqueWork(WORK_NAME);
        } catch (Exception e) {
            Log.w(TAG, "WakeWatchWorker: could not cancel", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        WakeWatch.checkAndReport(getApplicationContext());
        return Result.success();
    }
}
