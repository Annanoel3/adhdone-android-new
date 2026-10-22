package co.median.android.odxqpdy;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Google Play's own update screen, inside the app (Play's in-app updates API,
 * com.google.android.play:app-update). The update popup's Update button calls
 * NotifyBridge.startAppUpdate: when Play has a newer version for this phone,
 * Play's full-screen update opens right here, downloads, installs and restarts
 * the app, with no trip to the Play Store and no searching.
 *
 * Outcomes reported to the web app: "started" (the person accepted), "cancelled"
 * (they backed out), "none" (Play has nothing newer for this phone yet, for
 * example partway through a staged rollout), "unavailable" (Play can't do it
 * here: not installed from Play, no Play services), "failed". The web app falls
 * back to opening the Play Store page for anything but "started".
 *
 * Play's rule for this kind of update: if the person leaves the app while it is
 * running, it has to be picked back up when they return (resumeIfNeeded, from
 * MainActivity.onResume). Only checked after an update was started here.
 */
final class InAppUpdate {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_in_app_update";
    private static final String KEY_STARTED = "started_at";
    private static final long GIVE_UP_MS = 24L * 60L * 60L * 1000L;

    interface Done {
        void result(String outcome);
    }

    private InAppUpdate() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void clear(Context c) {
        prefs(c).edit().remove(KEY_STARTED).apply();
    }

    private static void report(Done done, String outcome) {
        if (done != null) {
            done.result(outcome);
        }
    }

    static void start(final Activity activity, final Done done) {
        final AppUpdateManager manager;
        try {
            manager = AppUpdateManagerFactory.create(activity);
        } catch (Exception e) {
            Log.w(TAG, "InAppUpdate: Play's update service isn't available here", e);
            report(done, "unavailable");
            return;
        }
        try {
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> {
                        int availability = info.updateAvailability();
                        if (availability != UpdateAvailability.UPDATE_AVAILABLE
                                && availability != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                            report(done, "none");
                            return;
                        }
                        if (!info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
                            report(done, "unavailable");
                            return;
                        }
                        launch(activity, manager, info, done);
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "InAppUpdate: could not ask Play about updates", e);
                        report(done, "unavailable");
                    });
        } catch (Exception e) {
            Log.w(TAG, "InAppUpdate: could not ask Play about updates", e);
            report(done, "unavailable");
        }
    }

    private static void launch(final Activity activity, AppUpdateManager manager, AppUpdateInfo info, final Done done) {
        try {
            prefs(activity).edit().putLong(KEY_STARTED, System.currentTimeMillis()).apply();
            manager.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build())
                    .addOnSuccessListener(code -> {
                        boolean accepted = code != null && code == Activity.RESULT_OK;
                        if (!accepted) {
                            clear(activity);
                        }
                        report(done, accepted ? "started" : "cancelled");
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "InAppUpdate: Play's update screen didn't open", e);
                        clear(activity);
                        report(done, "failed");
                    });
        } catch (Exception e) {
            Log.w(TAG, "InAppUpdate: Play's update screen didn't open", e);
            clear(activity);
            report(done, "failed");
        }
    }

    /** An update started here that the person stepped away from: open it again. */
    static void resumeIfNeeded(final Activity activity) {
        long started = prefs(activity).getLong(KEY_STARTED, 0L);
        if (started == 0L) {
            return;
        }
        if (System.currentTimeMillis() - started > GIVE_UP_MS) {
            clear(activity);
            return;
        }
        try {
            final AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
            manager.getAppUpdateInfo().addOnSuccessListener(info -> {
                int availability = info.updateAvailability();
                if (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                    launch(activity, manager, info, null);
                } else if (availability != UpdateAvailability.UPDATE_AVAILABLE) {
                    // Installed (or nothing to do any more): stop checking.
                    clear(activity);
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "InAppUpdate: could not check on the update", e);
        }
    }
}
