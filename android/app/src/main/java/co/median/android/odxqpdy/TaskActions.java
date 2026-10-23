package co.median.android.odxqpdy;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

/**
 * "Done", "Snooze 10 min" and "Later" buttons on a task's reminder notification.
 *
 * PushFilter adds them as each push arrives, to reminders about a task: a
 * task_reminder (a time the user set) gets Done and Snooze; a smart_nudge gets
 * Done and Later, since the nudges pick their own times and a fixed 10 minutes
 * works against that; an event's reminder only gets Snooze, since an event isn't
 * something you finish early. Birthday, commute, digest and other pushes get none.
 *
 *  - Done opens the task's page with done=1, which finishes it there exactly like
 *    the page's own Done button (and the alarm's): the next copy of a repeating
 *    task, the celebration and everything else the app does on a finish. The
 *    notification goes away (MainActivity cancels it).
 *  - Snooze takes the notification away and brings the same reminder back in 10
 *    minutes as a notification of the phone's own, with the same buttons, all
 *    without opening the app. Nothing about the task or its other reminders
 *    changes. While ADHDone is silenced the snoozed one comes back quietly too.
 *    A task finished or deleted elsewhere in the meantime takes its snooze with it
 *    (the server's silent "drop" message, see PushFilter).
 *  - Later takes the notification away without opening the app and books
 *    nothing: the task stays active, so the smart nudges bring it up again at a
 *    time they pick. It's counted (per task, here on the phone) and the web app
 *    collects the count through AlarmBridge.drainActivity as the task's
 *    later_count, so the nudge planner can see it was put off.
 */
final class TaskActions {

    private static final String TAG = "ADHDone";

    static final String ACTION_SNOOZE = "co.median.android.odxqpdy.TASK_SNOOZE";
    static final String ACTION_SNOOZE_DUE = "co.median.android.odxqpdy.TASK_SNOOZE_DUE";
    static final String ACTION_LATER = "co.median.android.odxqpdy.TASK_LATER";
    static final String EXTRA_TASK_ID = "adhdone_task_id";
    static final String EXTRA_TITLE = "adhdone_task_title";
    static final String EXTRA_BODY = "adhdone_task_body";
    static final String EXTRA_BUTTONS = "adhdone_task_buttons";
    static final String EXTRA_NOTIFICATION_ID = "adhdone_notification_id";
    /** On an intent that opens MainActivity: the notification to take away. */
    static final String EXTRA_CANCEL_NOTIFICATION = "adhdone_cancel_notification";

    static final int SNOOZE_MINUTES = 10;

    private static final String CHANNEL_ID = "adhdone_snoozed";
    private static final String CHANNEL_NAME = "Snoozed reminders";

    static final int BUTTONS_NONE = 0;
    static final int BUTTONS_SNOOZE = 1;
    static final int BUTTONS_DONE_AND_SNOOZE = 2;
    static final int BUTTONS_DONE_AND_LATER = 3;
    /** An appointment's night-before heads-up: one button, straight to its questions page. */
    static final int BUTTONS_WRITE_QUESTIONS = 4;

    private static final String LATER_PREFS = "adhdone_push_laters";

    private TaskActions() {
    }

    /** Which buttons this push gets. */
    static int buttonsFor(JSONObject data) {
        if (data == null) {
            return BUTTONS_NONE;
        }
        String taskId = data.optString("taskId", "");
        if (taskId.isEmpty()) {
            return BUTTONS_NONE;
        }
        String type = data.optString("type", "");
        if ("task_reminder".equals(type)) {
            return BUTTONS_DONE_AND_SNOOZE;
        }
        if ("smart_nudge".equals(type)) {
            return BUTTONS_DONE_AND_LATER;
        }
        if ("event_reminder".equals(type)) {
            return BUTTONS_SNOOZE;
        }
        if ("event_heads_up".equals(type)) {
            return BUTTONS_WRITE_QUESTIONS;
        }
        return BUTTONS_NONE;
    }

    /**
     * How PushFilter shows a push: quietly or not, plus this task's buttons.
     * Never throws: a button problem must not cost anyone the reminder itself.
     */
    static NotificationCompat.Extender extender(Context ctx, JSONObject data, int notificationId,
                                                String title, String body, boolean quiet) {
        final Context app = ctx.getApplicationContext();
        final int buttons = buttonsFor(data);
        final String taskId = data != null ? data.optString("taskId", "") : "";
        final String t = title != null ? title : "";
        final String b = body != null ? body : "";
        return builder -> {
            if (quiet) {
                builder.setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW);
            }
            try {
                addButtons(app, builder, buttons, taskId, notificationId, t, b);
            } catch (Exception e) {
                Log.w(TAG, "TaskActions: could not add buttons", e);
            }
            return builder;
        };
    }

    static void addButtons(Context c, NotificationCompat.Builder builder, int buttons, String taskId,
                           int notificationId, String title, String body) {
        if (buttons == BUTTONS_NONE || taskId == null || taskId.isEmpty()) {
            return;
        }
        if (buttons == BUTTONS_WRITE_QUESTIONS) {
            // The night-before heads-up for an appointment ("X is tomorrow"):
            // nothing to finish or snooze, so its one button opens the Notes
            // page's questions for that appointment (the same page the reminder
            // card's "Jot down questions" opens). Anna, Oct 8 2026.
            builder.addAction(0, "Write questions", writeQuestionsIntent(c, taskId, notificationId));
            return;
        }
        if (buttons == BUTTONS_DONE_AND_SNOOZE || buttons == BUTTONS_DONE_AND_LATER) {
            builder.addAction(0, "Done", doneIntent(c, taskId, notificationId));
        }
        if (buttons == BUTTONS_DONE_AND_LATER) {
            builder.addAction(0, "Later", laterIntent(c, taskId, notificationId));
            return;
        }
        builder.addAction(0, "Snooze " + SNOOZE_MINUTES + " min",
                snoozeIntent(c, taskId, notificationId, title, body, buttons));
    }

    private static int requestCode(String what, int notificationId) {
        return (what + ":" + notificationId).hashCode();
    }

    private static Intent openTask(Context c, String path, int notificationId) {
        return new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(WidgetBridge.EXTRA_WIDGET_PATH, path)
                .putExtra(EXTRA_CANCEL_NOTIFICATION, notificationId);
    }

    private static PendingIntent writeQuestionsIntent(Context c, String taskId, int notificationId) {
        Intent open = openTask(c, "/Notes?task=" + Uri.encode(taskId) + "&prep=1", notificationId);
        return PendingIntent.getActivity(c, requestCode("questions", notificationId), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent doneIntent(Context c, String taskId, int notificationId) {
        Intent open = openTask(c, "/TaskNotification?taskId=" + Uri.encode(taskId) + "&done=1", notificationId);
        return PendingIntent.getActivity(c, requestCode("done", notificationId), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent snoozeIntent(Context c, String taskId, int notificationId,
                                              String title, String body, int buttons) {
        Intent i = new Intent(c, TaskActionReceiver.class)
                .setAction(ACTION_SNOOZE)
                .setPackage(c.getPackageName())
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body)
                .putExtra(EXTRA_BUTTONS, buttons)
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        return PendingIntent.getBroadcast(c, requestCode("snooze", notificationId), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent laterIntent(Context c, String taskId, int notificationId) {
        Intent i = new Intent(c, TaskActionReceiver.class)
                .setAction(ACTION_LATER)
                .setPackage(c.getPackageName())
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        return PendingIntent.getBroadcast(c, requestCode("later", notificationId), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // --- Later --------------------------------------------------------------

    /** The Later button: away now, nothing booked, counted for the web app. */
    static void later(Context c, Intent intent) {
        cancelNotification(c, intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0));
        final String taskId = intent.getStringExtra(EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        // The break (LaterBreak): alarms off this phone now; the server is told
        // through the report queue, at once or as soon as there's a connection.
        LaterBreak.start(c.getApplicationContext(), taskId);
        Log.d(TAG, "TaskActions: later for task " + taskId);
    }

    private static void countLater(Context c, String taskId) {
        try {
            android.content.SharedPreferences p = c.getSharedPreferences(LATER_PREFS, Context.MODE_PRIVATE);
            p.edit().putInt(taskId, p.getInt(taskId, 0) + 1).apply();
        } catch (Exception e) {
            Log.w(TAG, "TaskActions: could not count the Later for " + taskId, e);
        }
    }

    /** Later taps not yet collected by the web app, by task id; clears them. */
    static java.util.Map<String, Integer> drainLaters(Context c) {
        java.util.Map<String, Integer> out = new java.util.HashMap<>();
        try {
            android.content.SharedPreferences p = c.getSharedPreferences(LATER_PREFS, Context.MODE_PRIVATE);
            for (java.util.Map.Entry<String, ?> e : p.getAll().entrySet()) {
                if (e.getValue() instanceof Integer && (Integer) e.getValue() > 0) {
                    out.put(e.getKey(), (Integer) e.getValue());
                }
            }
            if (!out.isEmpty()) {
                p.edit().clear().apply();
            }
        } catch (Exception e) {
            Log.w(TAG, "TaskActions: could not read the Later counts", e);
        }
        return out;
    }

    /** Take a notification away, whether OneSignal or the phone itself posted it. */
    static void cancelNotification(Context c, int notificationId) {
        if (notificationId == 0) {
            return;
        }
        try {
            // Through OneSignal too, so it is never restored on a later app start.
            com.onesignal.OneSignal.getNotifications().removeNotification(notificationId);
        } catch (Exception ignored) {
        }
        try {
            NotificationManagerCompat.from(c).cancel(notificationId);
        } catch (Exception ignored) {
        }
    }

    // --- Snooze -------------------------------------------------------------

    /** One snoozed reminder per task: a second snooze replaces the first. */
    private static int snoozeCode(String taskId) {
        return ("snoozed:" + taskId).hashCode();
    }

    private static PendingIntent dueIntent(Context c, String taskId, String title, String body, int buttons, int flags) {
        Intent i = new Intent(c, TaskActionReceiver.class)
                .setAction(ACTION_SNOOZE_DUE)
                .setPackage(c.getPackageName())
                .setData(Uri.parse("adhdone-snooze:" + Uri.encode(taskId)))
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body)
                .putExtra(EXTRA_BUTTONS, buttons);
        return PendingIntent.getBroadcast(c, snoozeCode(taskId), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The Snooze button: away now, back in SNOOZE_MINUTES. */
    static void snooze(Context c, Intent intent) {
        String taskId = intent.getStringExtra(EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        int buttons = intent.getIntExtra(EXTRA_BUTTONS, BUTTONS_DONE_AND_SNOOZE);
        cancelNotification(c, intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0));

        long at = System.currentTimeMillis() + SNOOZE_MINUTES * 60L * 1000L;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        PendingIntent due = dueIntent(c, taskId, title != null ? title : "", body != null ? body : "",
                buttons, PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (AlarmScheduler.canScheduleExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, due);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, due);
            }
            Toast.makeText(c.getApplicationContext(), "Snoozed for " + SNOOZE_MINUTES + " minutes",
                    Toast.LENGTH_SHORT).show();
            Log.d(TAG, "TaskActions: snoozed task " + taskId);
            // The server hears now (Smart Reminders sees the snooze and when it
            // brings the reminder back), app open or not.
            ChoiceReports.add(c, taskId, ChoiceReports.SNOOZE, SNOOZE_MINUTES, at);
        } catch (Exception e) {
            Log.w(TAG, "TaskActions: could not book the snooze for " + taskId, e);
        }
    }

    /** A snoozed reminder is due: show it again, with the same buttons. */
    static void showSnoozed(Context c, Intent intent) {
        String taskId = intent.getStringExtra(EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        int buttons = intent.getIntExtra(EXTRA_BUTTONS, BUTTONS_DONE_AND_SNOOZE);
        if (title == null || title.isEmpty()) {
            title = "ADHDone";
        }
        if (body == null) {
            body = "";
        }
        ensureChannel(c);
        int id = snoozeCode(taskId);
        PendingIntent open = PendingIntent.getActivity(c, requestCode("open", id),
                openTask(c, "/TaskNotification?taskId=" + Uri.encode(taskId), id),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_adhdone)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(open);
        if (ReminderPause.isPaused(c)) {
            b.setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW);
        }
        addButtons(c, b, buttons, taskId, id, title, body);
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
            Log.d(TAG, "TaskActions: snoozed reminder back for task " + taskId);
        } catch (SecurityException e) {
            Log.w(TAG, "TaskActions: could not show the snoozed reminder", e);
        }
    }

    /**
     * An alarm rang out with nobody answering: the reminder goes back in the
     * tray, quietly, with its buttons, so it can still be found there (its copy
     * was taken away while the alarm rang, see AlarmService).
     */
    static void postRecord(Context c, AlarmStore.Entry e) {
        if (e == null || e.taskId == null || e.taskId.isEmpty()) {
            return;
        }
        try {
            ensureChannel(c);
            int id = ("record:" + e.taskId).hashCode();
            String title = e.heading != null && !e.heading.isEmpty() ? e.heading : (e.title.isEmpty() ? "ADHDone" : e.title);
            String body = AlarmService.withCompanions(e, e.body != null ? e.body : "");
            PendingIntent open = PendingIntent.getActivity(c, requestCode("open", id),
                    openTask(c, "/TaskNotification?taskId=" + Uri.encode(e.taskId), id),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_adhdone)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setSilent(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setAutoCancel(true)
                    .setContentIntent(open);
            // A nudge (rang from a push) gets Done and Later; a booked reminder Done and Snooze.
            int buttons = e.id.startsWith(PushFilter.PUSH_ALARM_PREFIX) ? BUTTONS_DONE_AND_LATER : BUTTONS_DONE_AND_SNOOZE;
            addButtons(c, b, buttons, e.taskId, id, title, body);
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (Exception ex) {
            Log.w(TAG, "TaskActions: could not put the unanswered reminder back in the tray", ex);
        }
    }

    /**
     * Is the copy an unanswered alarm put back in the tray (postRecord) showing
     * for this task? A push for the same reminder landing after that is not
     * shown again (PushFilter).
     */
    static boolean recordShowing(Context c, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return false;
        }
        int id = ("record:" + taskId).hashCode();
        try {
            for (android.service.notification.StatusBarNotification sbn
                    : NotificationManagerCompat.from(c).getActiveNotifications()) {
                if (sbn.getId() == id) {
                    return true;
                }
            }
        } catch (Exception e) {
            // Can't tell: say no, so the reminder is shown rather than lost.
        }
        return false;
    }

    /** The task was finished or deleted elsewhere: its snooze goes too. */
    static void cancelSnooze(Context c, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        try {
            PendingIntent due = dueIntent(c, taskId, "", "", BUTTONS_NONE, PendingIntent.FLAG_NO_CREATE);
            if (due != null) {
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                if (am != null) {
                    am.cancel(due);
                }
                due.cancel();
            }
            NotificationManagerCompat.from(c).cancel(snoozeCode(taskId));
            // And an unanswered alarm's reminder put back in the tray (postRecord).
            NotificationManagerCompat.from(c).cancel(("record:" + taskId).hashCode());
        } catch (Exception e) {
            Log.w(TAG, "TaskActions: could not cancel the snooze for " + taskId, e);
        }
    }

    private static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Reminders you snoozed from a notification, back after " + SNOOZE_MINUTES + " minutes.");
        nm.createNotificationChannel(ch);
    }
}
