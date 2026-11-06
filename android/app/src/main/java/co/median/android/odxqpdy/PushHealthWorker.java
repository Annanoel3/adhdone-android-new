package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * Keeps this phone signed up for pushes WITHOUT the app being opened (Nov 6 2026).
 *
 * Why: some phones' push sign-up went dead on OneSignal's side (status -10, no token)
 * while the app was installed and Android still allowed its notifications. Chad's
 * broke at 8:08:22 AM as the app opened from his 8 AM medication alarm, two seconds
 * before he tapped Done. OneSignal's SDK only repairs that when the app is opened in
 * front of the person (its "self-heal" runs on foreground), so someone who only meets
 * the app through its alarms never gets repaired: no alarm comes, so nothing opens it.
 *
 * What it does, from the background: when Android allows ADHDone's notifications, it
 * opts the push sign-up in again. In OneSignal 5.9.9 optIn() forces an update to
 * OneSignal's server (enabled, subscribed, the token the phone holds), the same update
 * the SDK's own foreground self-heal sends. The process starting for this worker also
 * runs the SDK's start-up, which fetches a fresh push token and sends it if it changed.
 * Then it tells our server what it saw (cancelTaskNotifications, mode "push_state"), so
 * "still installed" is known instead of guessed. Nothing is shown to the person, and
 * nothing happens when Android has notifications off for the app (optIn() would try to
 * open the permission prompt, which a background job can't do).
 *
 * When: right after the app is updated by the Play Store or the phone restarts
 * (BootReceiver: MY_PACKAGE_REPLACED, BOOT_COMPLETED), and every 12 hours.
 */
public class PushHealthWorker extends Worker {

    private static final String TAG = "ADHDone";
    static final String NOW_WORK = "adhdone_push_health_now";
    static final String PERIODIC_WORK = "adhdone_push_health";
    private static final long PERIOD_HOURS = 12;
    /** OneSignal sends its queued updates every 5 s; give them time to leave. */
    private static final long FLUSH_WAIT_MS = 20000;
    private static final int REPORT_TIMEOUT_MS = 20000;

    public PushHealthWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Once, as soon as there is network (after an update or a restart). */
    static void runSoon(Context context, String why) {
        try {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PushHealthWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString("why", why).build())
                    .addTag(NOW_WORK)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(NOW_WORK, ExistingWorkPolicy.REPLACE, request);
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker.runSoon failed: " + e.getMessage());
        }
    }

    /** Every 12 hours. KEEP: calling it again changes nothing. */
    static void schedulePeriodic(Context context) {
        try {
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    PushHealthWorker.class, PERIOD_HOURS, TimeUnit.HOURS)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString("why", "periodic").build())
                    .addTag(PERIODIC_WORK)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request);
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker.schedulePeriodic failed: " + e.getMessage());
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String why = getInputData().getString("why");
        if (why == null || why.isEmpty()) why = "periodic";

        boolean allowed = false;
        try {
            allowed = NotificationManagerCompat.from(context).areNotificationsEnabled();
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker: could not read notification permission: " + e.getMessage());
        }

        boolean optedInBefore = false;
        boolean hadTokenBefore = false;
        String subscriptionId = "";
        boolean nudged = false;
        String error = null;
        try {
            // Waits for OneSignal's start-up (Application.onCreate) to finish.
            IPushSubscription sub = OneSignal.getUser().getPushSubscription();
            if (sub != null) {
                optedInBefore = sub.getOptedIn();
                String token = sub.getToken();
                hadTokenBefore = token != null && !token.isEmpty();
                String id = sub.getId();
                subscriptionId = id != null ? id : "";
                if (allowed) {
                    sub.optIn();
                    nudged = true;
                }
            }
        } catch (Exception e) {
            error = String.valueOf(e.getMessage());
            Log.w(TAG, "PushHealthWorker: push subscription check failed: " + error);
        }

        if (nudged) {
            try {
                Thread.sleep(FLUSH_WAIT_MS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
        }

        boolean optedInAfter = false;
        boolean hasTokenAfter = false;
        try {
            IPushSubscription sub = OneSignal.getUser().getPushSubscription();
            if (sub != null) {
                optedInAfter = sub.getOptedIn();
                String token = sub.getToken();
                hasTokenAfter = token != null && !token.isEmpty();
                String id = sub.getId();
                if (id != null && !id.isEmpty()) subscriptionId = id;
            }
        } catch (Exception e) {
            if (error == null) error = String.valueOf(e.getMessage());
        }

        Log.d(TAG, "PushHealthWorker (" + why + "): allowed=" + allowed + " optedIn " + optedInBefore
                + "->" + optedInAfter + " token " + hadTokenBefore + "->" + hasTokenAfter + " nudged=" + nudged);

        // Tell our server what this phone saw: proof the app is still installed, and the
        // push state as the phone itself sees it. Never the token itself.
        try {
            JSONObject payload = new JSONObject();
            payload.put("mode", "push_state");
            payload.put("why", why);
            payload.put("allowed", allowed);
            payload.put("opted_in_before", optedInBefore);
            payload.put("had_token_before", hadTokenBefore);
            payload.put("opted_in_after", optedInAfter);
            payload.put("has_token_after", hasTokenAfter);
            payload.put("nudged", nudged);
            payload.put("subscription_id", subscriptionId);
            payload.put("build", BuildConfig.VERSION_CODE);
            if (error != null) payload.put("error", error.length() > 200 ? error.substring(0, 200) : error);
            Base44Api.phoneReport(context, payload, REPORT_TIMEOUT_MS);
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker: report failed: " + e.getMessage());
        }

        // Never retried in a loop: the next update, restart or 12-hour run looks again.
        return Result.success();
    }
}
