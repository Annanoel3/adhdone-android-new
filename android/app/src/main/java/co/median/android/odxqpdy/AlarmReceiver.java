package co.median.android.odxqpdy;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Two jobs:
 *  1. AlarmManager fires ACTION_FIRE here at the booked time; we hand straight off to
 *     AlarmService, which does the ringing. An exact-alarm callback is one of the cases
 *     Android lets start a foreground service from the background.
 *  2. When the user grants (or revokes) the "Alarms & reminders" special access,
 *     Android broadcasts a permission-state change; we re-book everything we hold so
 *     the alarms become exact from that moment.
 */
public class AlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "ADHDone";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
            Log.d(TAG, "AlarmReceiver: exact-alarm access changed, re-arming");
            AlarmScheduler.rearmAll(context);
            return;
        }

        if (!AlarmScheduler.ACTION_FIRE.equals(action)) {
            return;
        }
        String id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
        if (id == null || id.isEmpty()) {
            return;
        }
        AlarmStore.Entry e = AlarmStore.get(context, id);
        if (e == null || e.done) {
            Log.d(TAG, "AlarmReceiver: alarm " + id + " no longer wanted, ignoring");
            return;
        }
        // Silenced from the pinned notification or the Today widget: a reminder's alarm
        // shows as a quiet notification instead of ringing. Timers the person started
        // themselves (focus timer, sprint, launchpad) still ring.
        if (ReminderPause.isPaused(context) && !id.startsWith(AlarmScheduler.TIMER_ALARM_PREFIX)) {
            Log.d(TAG, "AlarmReceiver: silenced, showing " + id + " quietly instead of ringing");
            ReminderPause.holdAlarm(context, e);
            return;
        }
        Log.d(TAG, "AlarmReceiver: ringing " + id);
        Intent ring = new Intent(context, AlarmService.class)
                .setAction(AlarmService.ACTION_RING)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id);
        try {
            ContextCompat.startForegroundService(context, ring);
        } catch (Exception ex) {
            // Android 12+ only lets an EXACT alarm start a foreground service from the
            // background. Without the exact-alarm grant this alarm was booked inexact,
            // and the start is refused. The alarm must still be heard: post the same
            // full-screen notification directly, on a channel that makes noise, and let
            // AlarmActivity carry the looping sound once it is up.
            Log.w(TAG, "AlarmReceiver: foreground service refused, ringing without it", ex);
            AlarmService.ringWithoutService(context, e);
        }
    }
}
