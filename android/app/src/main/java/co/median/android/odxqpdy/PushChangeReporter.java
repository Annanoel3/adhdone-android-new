package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

/**
 * Sends one push sign-up change noted by PushChangeWatch to our server
 * (cancelTaskNotifications, mode "push_change"). Runs once there's a network; the change
 * keeps the phone's own time, so a late send still says exactly when it happened. Tried at
 * most 3 times, then dropped (the next change, or PushHealthWorker's 12-hour look, reports
 * again). Never the token itself.
 */
public class PushChangeReporter extends Worker {

    private static final String TAG = "ADHDone";
    private static final int REPORT_TIMEOUT_MS = 20000;
    private static final int MAX_TRIES = 3;

    public PushChangeReporter(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Data in = getInputData();
        try {
            JSONObject payload = new JSONObject();
            payload.put("mode", "push_change");
            payload.put("changed_at", in.getLong("at", 0L));
            payload.put("had_token", in.getBoolean("had_token", false));
            payload.put("was_opted_in", in.getBoolean("was_opted_in", false));
            payload.put("id_before", in.getString("id_before") != null ? in.getString("id_before") : "");
            payload.put("has_token", in.getBoolean("has_token", false));
            payload.put("opted_in", in.getBoolean("opted_in", false));
            payload.put("subscription_id", in.getString("id") != null ? in.getString("id") : "");
            payload.put("allowed", in.getBoolean("allowed", false));
            payload.put("on_screen", in.getBoolean("on_screen", false));
            payload.put("importance", in.getInt("importance", -1));
            payload.put("build", BuildConfig.VERSION_CODE);
            Base44Api.Result result = Base44Api.phoneReport(getApplicationContext(), payload, REPORT_TIMEOUT_MS);
            if (result.isSuccess()) return Result.success();
            // No stored sign-in: nobody to report for. Anything else: try again later.
            if (result.code == 0 && result.error != null && result.error.contains("no stored")) return Result.success();
            Log.w(TAG, "PushChangeReporter: report failed (" + result.code + "): " + result.error);
        } catch (Exception e) {
            Log.w(TAG, "PushChangeReporter: report failed: " + e.getMessage());
        }
        return getRunAttemptCount() + 1 < MAX_TRIES ? Result.retry() : Result.success();
    }
}
