package co.median.android.odxqpdy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The Snooze and Later buttons on a task's reminder, and the snoozed reminder coming back. See TaskActions. */
public class TaskActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (TaskActions.ACTION_SNOOZE.equals(action)) {
            TaskActions.snooze(context, intent);
        } else if (TaskActions.ACTION_SNOOZE_DUE.equals(action)) {
            TaskActions.showSnoozed(context, intent);
        } else if (TaskActions.ACTION_LATER.equals(action)) {
            TaskActions.later(context, intent);
        }
    }
}
