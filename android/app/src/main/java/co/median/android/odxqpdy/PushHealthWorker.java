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

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
 *
 * FRESH PUSH ADDRESS (Nov 27 2026, the build after 49). Signing up again hands OneSignal
 * the push address (FCM token) the phone already holds. Bri's phone: Google's push service
 * refused a notification at 1:09 PM on Nov 26, this check signed up again at 11:30 PM and
 * OneSignal said subscribed, and the next notification, at 9:39 AM, was refused the same way.
 * A refused address stays refused. So when the server's answer says a notification was
 * refused since this phone's last check (fresh_push_address), the address is thrown away
 * at Google (deleteToken) and a new one made. OneSignal 5.11 reads the address once per
 * start of the app's process (DeviceRegistrationListener, on its config hydration) and
 * sends it to its server when it changed, so the new one reaches OneSignal at the next
 * start: a follow-up check is booked two hours on, and the 12-hour one follows. Nothing is
 * shown to the person. The report also carries an 8-character one-way tag of the address
 * before and after (never the address itself), so a phone that keeps handing over a
 * refused address can be seen from the server.
 */
public class PushHealthWorker extends Worker {

    private static final String TAG = "ADHDone";
    static final String NOW_WORK = "adhdone_push_health_now";
    static final String PERIODIC_WORK = "adhdone_push_health";
    static final String FRESH_WORK = "adhdone_push_health_fresh";
    /** OneSignal 5.11's own Firebase app, made only when the app's own can't be used. */
    private static final String ONESIGNAL_FIREBASE_APP = "ONESIGNAL_SDK_FCM_APP_NAME";
    private static final long FRESH_FOLLOW_UP_HOURS = 2;
    /** Follow-ups after a fresh address, at most, while OneSignal still holds the old one. */
    private static final int FRESH_FOLLOW_UPS_MAX = 3;
    private static final long FIREBASE_WAIT_S = 20;
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

    /** Once, a while after a fresh push address was made, once the process has likely restarted. */
    static void runLater(Context context, String why, long delayHours, int attempt) {
        try {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PushHealthWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInitialDelay(delayHours, TimeUnit.HOURS)
                    .setInputData(new Data.Builder().putString("why", why).putInt("attempt", attempt).build())
                    .addTag(FRESH_WORK)
                    .build();
            // Appended when one is running (a follow-up booking the next never cancels
            // itself mid-report); a finished one is replaced.
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(FRESH_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker.runLater failed: " + e.getMessage());
        }
    }

    /** 8 hex characters of a SHA-256 of the push address: tells two apart, never shows one. */
    static String tagOf(String token) {
        if (token == null || token.isEmpty()) return "";
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 4; i++) sb.append(String.format("%02x", d[i] & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Throws away the push address at Google and makes a new one (FRESH PUSH ADDRESS,
     * above). The app's own Firebase (google-services.json) is the one OneSignal 5.11 takes
     * the address from when its sender id matches (PushRegistratorFCM.hostLegacyToken);
     * OneSignal's own Firebase app is cleared too when it exists in this process. Returns
     * the new address's tag, or "" when it could not be done.
     */
    static String freshPushAddress(Context context) {
        try {
            for (FirebaseApp app : FirebaseApp.getApps(context)) {
                if (ONESIGNAL_FIREBASE_APP.equals(app.getName())) {
                    try {
                        Tasks.await(app.get(FirebaseMessaging.class).deleteToken(), FIREBASE_WAIT_S, TimeUnit.SECONDS);
                    } catch (Exception e) {
                        Log.w(TAG, "PushHealthWorker: OneSignal's Firebase address not cleared: " + e.getMessage());
                    }
                }
            }
            FirebaseMessaging fm = FirebaseMessaging.getInstance();
            Tasks.await(fm.deleteToken(), FIREBASE_WAIT_S, TimeUnit.SECONDS);
            String fresh = Tasks.await(fm.getToken(), FIREBASE_WAIT_S, TimeUnit.SECONDS);
            return tagOf(fresh);
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker: fresh push address failed: " + e.getMessage());
            return "";
        }
    }

    /**
     * Whether OneSignal made its own Firebase app in this process: then the push address it
     * holds comes from that one, not the app's own, and the two never match.
     */
    static boolean oneSignalOwnFirebase(Context context) {
        try {
            for (FirebaseApp app : FirebaseApp.getApps(context)) {
                if (ONESIGNAL_FIREBASE_APP.equals(app.getName())) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
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
        String tagBefore = "";
        String tagAfter = "";
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
                tagBefore = tagOf(token);
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
                tagAfter = tagOf(token);
                String id = sub.getId();
                if (id != null && !id.isEmpty()) subscriptionId = id;
            }
        } catch (Exception e) {
            if (error == null) error = String.valueOf(e.getMessage());
        }

        // A follow-up after a fresh address: if OneSignal still holds another address than
        // the one Google now has (the process had not restarted yet), look again later.
        if ("fresh_address".equals(why) && allowed && !oneSignalOwnFirebase(context)) {
            int attempt = getInputData().getInt("attempt", 1);
            String fcmTag = "";
            try {
                fcmTag = tagOf(Tasks.await(FirebaseMessaging.getInstance().getToken(), FIREBASE_WAIT_S, TimeUnit.SECONDS));
            } catch (Exception e) {
                Log.w(TAG, "PushHealthWorker: could not read Google's push address: " + e.getMessage());
            }
            if (!fcmTag.isEmpty() && !fcmTag.equals(tagAfter) && attempt < FRESH_FOLLOW_UPS_MAX) {
                runLater(context, "fresh_address", FRESH_FOLLOW_UP_HOURS, attempt + 1);
            }
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
            payload.put("token_tag_before", tagBefore);
            payload.put("token_tag_after", tagAfter);
            if (error != null) payload.put("error", error.length() > 200 ? error.substring(0, 200) : error);
            // The answer also says which alarm screen this phone shows (AlarmLook), and
            // whether to get a fresh push address (FRESH PUSH ADDRESS, above).
            Base44Api.Result answer = Base44Api.phoneReport(context, payload, REPORT_TIMEOUT_MS);
            AlarmLook.adopt(context, answer);
            if (allowed && answer != null && answer.isSuccess() && answer.body != null
                    && answer.body.optBoolean("fresh_push_address", false)) {
                // Already made one that OneSignal hasn't taken yet (the process hasn't
                // restarted since)? Then throwing that one away too helps nothing: wait for
                // the restart instead.
                String waitingTag = "";
                try {
                    waitingTag = tagOf(Tasks.await(FirebaseMessaging.getInstance().getToken(), FIREBASE_WAIT_S, TimeUnit.SECONDS));
                } catch (Exception e) {
                    Log.w(TAG, "PushHealthWorker: could not read Google's push address: " + e.getMessage());
                }
                if (!waitingTag.isEmpty() && !tagAfter.isEmpty() && !waitingTag.equals(tagAfter)
                        && !oneSignalOwnFirebase(context)) {
                    Log.d(TAG, "PushHealthWorker: a fresh push address is already waiting for OneSignal");
                    runLater(context, "fresh_address", FRESH_FOLLOW_UP_HOURS, 1);
                } else {
                    String freshTag = freshPushAddress(context);
                    Log.d(TAG, "PushHealthWorker: fresh push address " + (freshTag.isEmpty() ? "failed" : "made"));
                    if (!freshTag.isEmpty()) runLater(context, "fresh_address", FRESH_FOLLOW_UP_HOURS, 1);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "PushHealthWorker: report failed: " + e.getMessage());
        }

        // Never retried in a loop: the next update, restart or 12-hour run looks again.
        return Result.success();
    }
}
