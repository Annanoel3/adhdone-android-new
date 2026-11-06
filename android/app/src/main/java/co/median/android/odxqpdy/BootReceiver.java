package co.median.android.odxqpdy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * After a reboot or an app update: re-books every stored task alarm, and re-posts the
 * pinned quick-capture notification if the user left it switched on.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "ADHDone";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        // Alarms whose time passed while the phone was off never rang: mark them
        // missed first, so their pushes ring normally instead of being muted.
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            AlarmScheduler.markMissedAfterBoot(context);
        }
        // Alarms are booked with AlarmManager, which forgets everything on reboot.
        AlarmScheduler.rearmAll(context);

        // The push sign-up is checked (and switched back on when Android allows the
        // app's notifications) right away, with the app never opened: a Play Store
        // update reaches people whose pushes went dead and who only ever open the app
        // from its alarms (PushHealthWorker, Nov 6 2026). Then every 12 hours.
        PushHealthWorker.runSoon(context,
                Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ? "updated" : "boot");
        PushHealthWorker.schedulePeriodic(context);

        if (QuickCapture.isEnabled(context)) {
            Log.d(TAG, "BootReceiver: restoring quick-capture notification after " + action);
            QuickCapture.post(context);
            // Belt and braces: WorkManager re-arms itself after boot, but if that ever
            // failed this puts the keep-alive back. KEEP makes it a no-op when already set.
            QuickCapture.scheduleKeepAlive(context);
        }
    }
}
