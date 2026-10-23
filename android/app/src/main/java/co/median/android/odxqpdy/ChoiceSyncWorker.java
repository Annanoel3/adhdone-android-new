package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * Sends the queued alarm choices (ChoiceReports) to the server, oldest first.
 * Runs as soon as there is a connection and retries on its own (Android's
 * WorkManager), app open or not. A report leaves the queue only once the server
 * has answered for it.
 */
public class ChoiceSyncWorker extends Worker {

    private static final String TAG = "ADHDone";
    static final String WORK_NAME = "adhdone_choice_sync";
    private static final Object DRAIN_LOCK = new Object();
    private static final int READ_TIMEOUT_MS = 30000;

    public ChoiceSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Send as soon as there is network. Safe to call any number of times. */
    static void kick(Context context) {
        try {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ChoiceSyncWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,
                            OneTimeWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                    .addTag(WORK_NAME)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
        } catch (Exception e) {
            Log.w(TAG, "ChoiceSyncWorker.kick failed: " + e.getMessage());
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        synchronized (DRAIN_LOCK) {
            return drain(getApplicationContext());
        }
    }

    private static Result drain(Context ctx) {
        JSONArray q = ChoiceReports.pending(ctx);
        for (int i = 0; i < q.length(); i++) {
            JSONObject item = q.optJSONObject(i);
            if (item == null) {
                continue;
            }
            String reportId = item.optString("report_id", "");
            String taskId = item.optString("task_id", "");
            String choice = item.optString("choice", "");
            JSONObject body = new JSONObject();
            try {
                body.put("report_id", reportId);
                body.put("at", item.optLong("at", 0L));
                if (ChoiceReports.LATER.equals(choice)) {
                    // The break itself (cancelTaskNotifications mode "later"),
                    // timed from the tap, not from whenever this got through.
                    body.put("mode", "later");
                    body.put("taskId", taskId);
                } else {
                    body.put("mode", "alarm_choice");
                    body.put("task_id", taskId);
                    body.put("choice", choice);
                    body.put("minutes", item.optInt("minutes", 0));
                    body.put("until", item.optLong("until", 0L));
                    if (item.has("how")) {
                        body.put("how", item.optString("how", ""));
                    }
                }
            } catch (Exception e) {
                ChoiceReports.remove(ctx, reportId);
                continue;
            }
            Base44Api.Result r = Base44Api.phoneReport(ctx, body, READ_TIMEOUT_MS);
            if (r.isSuccess()) {
                if (ChoiceReports.LATER.equals(choice) && r.body != null) {
                    long serverUntil = LaterBreak.parseIso(r.body.optString("later_until", ""));
                    if (serverUntil > 0L) {
                        LaterBreak.adoptServerUntil(ctx, taskId, serverUntil);
                    }
                }
                ChoiceReports.remove(ctx, reportId);
                Log.d(TAG, "ChoiceSyncWorker: server has the " + choice + " for " + taskId);
                continue;
            }
            if (r.isAuthFailure()) {
                // The saved sign-in is stale. Nothing is dropped: the queue goes
                // out after the app's next sign-in snapshot (SessionSnapshotter).
                Log.w(TAG, "ChoiceSyncWorker: sign-in refused, waiting for a fresh one");
                return Result.success();
            }
            if (r.isTransport() || r.code >= 500 || r.code == 429) {
                return Result.retry();
            }
            // 400 / 404: this one can never succeed (the task is gone, say).
            Log.w(TAG, "ChoiceSyncWorker: dropping " + choice + " for " + taskId + " (" + r.code + ")");
            ChoiceReports.remove(ctx, reportId);
        }
        return Result.success();
    }
}
