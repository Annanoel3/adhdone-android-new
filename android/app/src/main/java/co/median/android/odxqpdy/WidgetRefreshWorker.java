package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * Redraws the widget at local midnight so "Today" stays correct even if the app is
 * never opened, then schedules itself for the following midnight.
 *
 * A one-shot job with a computed delay rather than periodic work: WorkManager's
 * periodic minimum is 15 minutes and its period cannot be aligned to midnight, so a
 * self-rescheduling one-shot both lands on the right moment and costs one wakeup a day.
 */
public class WidgetRefreshWorker extends Worker {

    private static final String TAG = "ADHDone";

    static final String WORK_NAME = "adhdone_widget_midnight_refresh";

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        // The snapshot is now for "yesterday"; TodayWidgetProvider renders the stale
        // state rather than showing a previous day's tasks as if they were today's.
        TodayWidgetProvider.refreshAll(context);
        scheduleNextMidnight(context);
        Log.d(TAG, "WidgetRefreshWorker: midnight rollover applied");
        return Result.success();
    }

    /** Arm (or re-arm) the next local-midnight refresh. Idempotent via REPLACE. */
    static void scheduleNextMidnight(Context context) {
        try {
            long delay = millisUntilNextMidnight();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
                    .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                    .addTag(WORK_NAME)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request);
            Log.d(TAG, "WidgetRefreshWorker: next refresh in " + (delay / 60000) + " min");
        } catch (Exception e) {
            Log.w(TAG, "WidgetRefreshWorker.scheduleNextMidnight failed: " + e.getMessage());
        }
    }

    static void cancel(Context context) {
        try {
            WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(WORK_NAME);
            Log.d(TAG, "WidgetRefreshWorker: cancelled");
        } catch (Exception e) {
            Log.w(TAG, "WidgetRefreshWorker.cancel failed: " + e.getMessage());
        }
    }

    /** Milliseconds from now until 00:00:30 local tomorrow (30s of slack past midnight). */
    private static long millisUntilNextMidnight() {
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 30);
        next.set(Calendar.MILLISECOND, 0);
        long delay = next.getTimeInMillis() - System.currentTimeMillis();
        return delay > 0 ? delay : TimeUnit.HOURS.toMillis(24);
    }
}
