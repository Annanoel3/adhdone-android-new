package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Base64;
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

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Drains the durable capture queue by relaying each capture to base44's captureText
 * function. The server classifies, splits, parses, creates and schedules; native decides
 * nothing about the resulting tasks.
 *
 * An item is only removed from the queue once the server has confirmed it, and is never
 * re-sent after a 2xx.
 */
public class CaptureSyncWorker extends Worker {

    private static final String TAG = "ADHDone";

    static final String WORK_NAME = "adhdone_capture_sync";

    /**
     * Only one drain runs at a time. Two workers draining the same queue together each
     * sent the same capture (same capture_id) and one of them dropped the other's image
     * mid-read; a second drain now simply waits, then finds the queue already empty.
     */
    private static final Object DRAIN_LOCK = new Object();

    public CaptureSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Kick a drain as soon as there is network. Safe to call from anywhere, any number of times. */
    static void kick(Context context) {
        try {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CaptureSyncWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,
                            OneTimeWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                    .addTag(WORK_NAME)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
            Log.d(TAG, "CaptureSyncWorker: drain requested");
        } catch (Exception e) {
            Log.w(TAG, "CaptureSyncWorker.kick failed: " + e.getMessage());
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        synchronized (DRAIN_LOCK) {
            return drain();
        }
    }

    private Result drain() {
        Context context = getApplicationContext();

        List<CaptureQueue.Item> items = CaptureQueue.all(context);
        if (items.isEmpty()) {
            return Result.success();
        }

        if (!Base44Session.isUsable(context)) {
            Log.d(TAG, "CaptureSyncWorker: no stored session, " + items.size() + " capture(s) waiting");
            markAllNeedsAuth(context, items);
            CaptureNotifications.showNeedsAuth(context, items.size());
            return Result.success();
        }

        boolean shouldRetry = false;

        for (CaptureQueue.Item item : items) {
            if (CaptureQueue.STATE_NEEDS_AUTH.equals(item.state)) {
                // Waits for a fresh session; revived on next app open.
                continue;
            }

            Outcome outcome = send(context, item);
            switch (outcome) {
                case SENT:
                case DROP:
                    CaptureQueue.remove(context, item.id);
                    break;
                case AUTH_FAILED:
                    CaptureQueue.mark(context, item.id, CaptureQueue.STATE_NEEDS_AUTH);
                    CaptureNotifications.showNeedsAuth(context, CaptureQueue.size(context));
                    return Result.success(); // no point trying the rest with a dead token
                case RETRY:
                    shouldRetry = true;
                    CaptureQueue.mark(context, item.id, CaptureQueue.STATE_PENDING);
                    break;
            }
        }

        return shouldRetry ? Result.retry() : Result.success();
    }

    private enum Outcome { SENT, AUTH_FAILED, RETRY, DROP }

    private Outcome send(Context context, CaptureQueue.Item item) {
        String text = item.text;
        if (item.isImage()) {
            // A shared image: the server reads it into a sentence first. From there it is
            // shared text — same captureText call, same capture_id for dedupe.
            File jpeg = new File(item.imagePath);
            byte[] bytes = readFile(jpeg);
            if (bytes == null) {
                Log.w(TAG, "CaptureSyncWorker: image for " + item.id + " is gone, dropping");
                return Outcome.DROP;
            }
            Base44Api.Result read = Base44Api.readImage(context, Base64.encodeToString(bytes, Base64.NO_WRAP));
            if (read.isAuthFailure()) {
                return Outcome.AUTH_FAILED;
            }
            if (read.isTransport()) {
                return Outcome.RETRY;
            }
            if (read.isPermanentBadRequest()) {
                Log.w(TAG, "CaptureSyncWorker: dropping image " + item.id + " (400) " + read.error);
                deleteQuietly(jpeg);
                return Outcome.DROP;
            }
            if (!read.isSuccess() || read.body == null) {
                Log.w(TAG, "CaptureSyncWorker: image read failed " + read.code + " " + read.error);
                return Outcome.RETRY;
            }
            text = read.body.optString("text", "").trim();
            if (text.isEmpty() || read.body.optBoolean("nothing_found", false)) {
                Log.d(TAG, "CaptureSyncWorker: no task found in image " + item.id);
                deleteQuietly(jpeg);
                CaptureNotifications.showNothingFound(context);
                return Outcome.DROP;
            }
            // The sentence now lives on the queue item, so if captureText fails below the
            // retry sends the text — the picture is no longer needed for anything.
            CaptureQueue.promoteToText(context, item.id, text);
            deleteQuietly(jpeg);
        }

        Base44Api.Result result = Base44Api.submitCapture(context, text, item.id, item.createdAt);

        if (result.isAuthFailure()) {
            return Outcome.AUTH_FAILED;
        }
        if (result.isTransport()) {
            // No response at all. The server may or may not have created the task; retrying
            // is safe because base44 dedupes on capture_id.
            return Outcome.RETRY;
        }
        if (result.isPermanentBadRequest()) {
            // Malformed request — retrying can never succeed, so stop rather than loop forever.
            Log.w(TAG, "CaptureSyncWorker: dropping " + item.id + " (400) " + result.error);
            return Outcome.DROP;
        }
        if (result.isReportedFailure()) {
            // 2xx but the server says it created nothing, so re-sending is safe.
            Log.w(TAG, "CaptureSyncWorker: server reported failure for " + item.id);
            return Outcome.RETRY;
        }
        if (!result.isSuccess()) {
            // 500 and anything else unexpected: retry with the same capture_id.
            Log.w(TAG, "CaptureSyncWorker: capture failed " + result.code + " " + result.error);
            return Outcome.RETRY;
        }

        // 2xx: delivered. Never re-POST this capture.
        JSONArray tasks = result.tasks();
        int count = result.count();

        Log.d(TAG, "CaptureSyncWorker: captured " + item.id + " -> count=" + count
                + (result.isDuplicate() ? " (duplicate, deduped server-side)" : "")
                + describeReminders(tasks));

        // No acknowledgement here. Both capture paths toast at capture time — CaptureActivity
        // for shares, QuickCaptureReceiver for notification replies — so confirming again
        // after the drain would be both duplicated and several seconds late. Failures are
        // still surfaced: showNeedsAuth() covers an expired session.
        // If the app happens to be open, its task list refreshes now rather than on the
        // next screen wake.
        ShareBridge.captureLanded(count);
        return Outcome.SENT;
    }

    private static byte[] readFile(File file) {
        if (file == null || !file.isFile()) {
            return null;
        }
        try (FileInputStream in = new FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (Exception e) {
            Log.w(TAG, "CaptureSyncWorker: could not read " + file + ": " + e.getMessage());
            return null;
        }
    }

    private static void deleteQuietly(File file) {
        try {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        } catch (Exception ignored) {
        }
    }

    /** Logs planned-vs-scheduled so a push-subscription problem is visible in logcat. */
    private String describeReminders(JSONArray tasks) {
        int planned = 0;
        int scheduled = 0;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) {
                continue;
            }
            JSONObject reminders = task.optJSONObject("reminders");
            if (reminders != null) {
                planned += reminders.optInt("planned", 0);
                scheduled += reminders.optInt("scheduled", 0);
            }
        }
        if (planned == 0 && scheduled == 0) {
            return "";
        }
        String note = (scheduled < planned)
                ? " (fewer scheduled than planned — check OneSignal subscription)"
                : "";
        return ", reminders planned=" + planned + " scheduled=" + scheduled + note;
    }

    private void markAllNeedsAuth(Context context, List<CaptureQueue.Item> items) {
        for (CaptureQueue.Item item : items) {
            if (!CaptureQueue.STATE_NEEDS_AUTH.equals(item.state)) {
                CaptureQueue.mark(context, item.id, CaptureQueue.STATE_NEEDS_AUTH);
            }
        }
    }
}
