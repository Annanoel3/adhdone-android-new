package co.median.android.odxqpdy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The silence buttons (pinned notification, Today widget) and the end-of-silence redraw.
 * See ReminderPause.
 */
public class ReminderPauseReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (ReminderPause.ACTION_SILENCE.equals(action)) {
            ReminderPause.silence(context,
                    intent.getIntExtra(ReminderPause.EXTRA_HOURS, 1),
                    intent.getBooleanExtra(ReminderPause.EXTRA_EXTEND, false));
        } else if (ReminderPause.ACTION_UNSILENCE.equals(action)) {
            ReminderPause.unsilence(context);
        } else if (ReminderPause.ACTION_ENDED.equals(action)) {
            // The silence ran out: redraw so nothing still says "silenced".
            if (!ReminderPause.isPaused(context)) {
                ReminderPause.refreshUi(context);
            }
        }
    }
}
