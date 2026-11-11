package co.median.android.odxqpdy;

import android.app.ActivityManager;
import android.content.Context;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;
import com.onesignal.user.subscriptions.IPushSubscriptionObserver;
import com.onesignal.user.subscriptions.PushSubscriptionChangedState;
import com.onesignal.user.subscriptions.PushSubscriptionState;

import org.jetbrains.annotations.NotNull;

/**
 * Tells our server the moment this phone's push sign-up changes (Nov 10 2026, build 49).
 *
 * Why: some phones' push sign-ups went dead on OneSignal's side (-10, no token) while the
 * app was installed and Android still allowed its notifications. OneSignal keeps no history
 * of a subscription's tokens (Brit, OneSignal support, Nov 9 2026) and suggested watching
 * the SDK's push subscription observer. PushHealthWorker only looks every 12 hours and keeps
 * its latest look, and NotifyBridge's observer only reacts when a token arrives (for the web
 * app), so the moment a token disappears was never seen. Anna: "yeah you can add that to v49".
 *
 * What it does: watches the push sign-up for as long as the app's process runs (started from
 * MainApplication, so alarms and background work count too, not just the open app). Each
 * change is noted with the phone's own time, what it was before and after (has a token,
 * opted in, subscription id), whether Android allows ADHDone's notifications right then, and
 * whether the app was on screen. PushChangeReporter sends it to our server when there's a
 * network (cancelTaskNotifications, mode "push_change"). Never the token itself. Nothing is
 * shown to the person and nothing about their push sign-up is changed here.
 */
public final class PushChangeWatch {

    private static final String TAG = "ADHDone";
    private static volatile boolean started = false;

    private PushChangeWatch() {
    }

    /** Once per process, from MainApplication.onCreate. Registers off the main thread. */
    static void start(Context context) {
        if (started) return;
        started = true;
        final Context app = context.getApplicationContext();
        Thread t = new Thread(() -> {
            try {
                // Waits for OneSignal's start-up (initWithContext) to finish, so never on
                // the main thread.
                IPushSubscription sub = OneSignal.getUser().getPushSubscription();
                if (sub == null) {
                    Log.w(TAG, "PushChangeWatch: no push subscription to watch");
                    return;
                }
                sub.addObserver(new IPushSubscriptionObserver() {
                    @Override
                    public void onPushSubscriptionChange(@NotNull PushSubscriptionChangedState state) {
                        note(app, state);
                    }
                });
                Log.d(TAG, "PushChangeWatch: watching the push sign-up");
            } catch (Throwable e) {
                Log.w(TAG, "PushChangeWatch: could not watch the push sign-up: " + e.getMessage());
            }
        }, "adhdone-push-watch");
        t.setDaemon(true);
        t.start();
    }

    private static void note(Context app, PushSubscriptionChangedState state) {
        try {
            long at = System.currentTimeMillis();
            PushSubscriptionState before = state != null ? state.getPrevious() : null;
            PushSubscriptionState now = state != null ? state.getCurrent() : null;

            boolean allowed = false;
            try {
                allowed = NotificationManagerCompat.from(app).areNotificationsEnabled();
            } catch (Exception ignored) {
            }

            int importance = -1;
            try {
                ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
                ActivityManager.getMyMemoryState(info);
                importance = info.importance;
            } catch (Exception ignored) {
            }

            Data data = new Data.Builder()
                    .putLong("at", at)
                    .putBoolean("had_token", hasToken(before))
                    .putBoolean("was_opted_in", before != null && before.getOptedIn())
                    .putString("id_before", idOf(before))
                    .putBoolean("has_token", hasToken(now))
                    .putBoolean("opted_in", now != null && now.getOptedIn())
                    .putString("id", idOf(now))
                    .putBoolean("allowed", allowed)
                    .putBoolean("on_screen", importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND)
                    .putInt("importance", importance)
                    .build();

            Log.d(TAG, "PushChangeWatch: token " + hasToken(before) + "->" + hasToken(now)
                    + " optedIn " + (before != null && before.getOptedIn()) + "->" + (now != null && now.getOptedIn())
                    + " allowed=" + allowed + " importance=" + importance);

            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PushChangeReporter.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(data)
                    .build();
            WorkManager.getInstance(app).enqueue(request);
        } catch (Throwable e) {
            Log.w(TAG, "PushChangeWatch: could not note a change: " + e.getMessage());
        }
    }

    private static boolean hasToken(PushSubscriptionState s) {
        if (s == null) return false;
        String token = s.getToken();
        return token != null && !token.isEmpty();
    }

    private static String idOf(PushSubscriptionState s) {
        if (s == null) return "";
        String id = s.getId();
        return id != null ? id : "";
    }
}
