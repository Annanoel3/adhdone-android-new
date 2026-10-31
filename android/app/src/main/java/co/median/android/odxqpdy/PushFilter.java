package co.median.android.odxqpdy;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.Keep;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.onesignal.notifications.IDisplayableMutableNotification;
import com.onesignal.notifications.INotificationReceivedEvent;
import com.onesignal.notifications.INotificationServiceExtension;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Runs for every push OneSignal receives, whether the app is open, in the
 * background or killed (registered in the manifest as
 * com.onesignal.NotificationServiceExtension).
 *
 * When a push lands for a task and this phone holds an alarm for that task at
 * (about) this time, the ALARM does the alerting: it rings, takes the screen.
 * The push is not dropped — it is shown SILENTLY, no sound, no vibration, no
 * banner — so it sits in the tray as the record of the reminder. That matters
 * when the alarm rings out with nobody answering: the tray still says it
 * happened. Dismissing the alarm ("Got it" / back) clears that tray entry too.
 *
 * If no alarm covers the push — alarms are off, the app never synced, the time
 * doesn't match — the push shows exactly as before, sound and all.
 *
 * A push can also ASK to be an alarm: the server sends {@code alarm: true} in
 * its data for a moment it only knows at send time (the commute "leave now"
 * push, whose minute depends on live traffic) and only for accounts that chose
 * full-screen reminders. That push rings the moment it arrives, with its own
 * title and body, and sits in the tray silently like any other alarmed push.
 * If this phone's own alarm for that task already rings for that same moment
 * (the push may say which moment in {@code at}; otherwise it is now), the push
 * does not ring a second time: it only shows quietly.
 *
 * The server can also hand over one task's alarms: a silent push with
 * {@code set_alarms_task} (the task id), {@code alarms} (the list, as JSON) and
 * {@code changed_at}. It replaces what this phone holds for that task (see
 * AlarmScheduler.replaceTask), so a change made while the app was closed moves
 * the alarm too. Nothing is shown.
 *
 * Reminders about a task get "Done" and "Snooze 10 min" buttons (a smart nudge:
 * "Done" and "Later") however they are shown (see TaskActions).
 */
@Keep
public class PushFilter implements INotificationServiceExtension {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_muted_pushes";

    @Override
    public void onNotificationReceived(INotificationReceivedEvent event) {
        try {
            IDisplayableMutableNotification notification = event.getNotification();
            JSONObject data = notification.getAdditionalData();
            Context ctx = event.getContext();
            // A silent message from the server: this task was finished or
            // deleted somewhere else (another device, the web, a calendar
            // sync), so its alarms come off this phone. Nothing is shown.
            String dropFor = data != null ? data.optString("drop_alarms_task", "") : "";
            if (!dropFor.isEmpty()) {
                AlarmScheduler.dropTask(ctx, dropFor, data.optLong("changed_at", 0L));
                // Ringing for it right now: the ring stops too (nothing counted).
                AlarmService.stopTask(ctx, dropFor);
                // A reminder snoozed from its notification goes too (TaskActions).
                TaskActions.cancelSnooze(ctx, dropFor);
                // And its reminders come out of the shade (TaskPushes).
                TaskPushes.finished(ctx, dropFor, data.optLong("changed_at", 0L));
                event.preventDefault();
                return;
            }
            // A silent message from the server: this task's reminders changed
            // while the app was closed, and here are its alarms now.
            String setFor = data != null ? data.optString("set_alarms_task", "") : "";
            if (!setFor.isEmpty()) {
                JSONArray list = alarmsFrom(data);
                if (list != null) {
                    AlarmScheduler.replaceTask(ctx, setFor, list, data.optLong("changed_at", 0L));
                } else {
                    // Unreadable: keep what the phone holds rather than wipe it.
                    Log.w(TAG, "PushFilter: server alarm list for " + setFor + " unreadable, ignoring");
                }
                event.preventDefault();
                return;
            }
            String taskId = data != null ? data.optString("taskId", "") : "";
            if (!taskId.isEmpty()) {
                // Sent before the task was finished and only arriving now: it was
                // already on its way when the task was checked off. Not shown.
                if (TaskPushes.sentBeforeFinish(ctx, taskId, notification.getSentTime() * 1000L)) {
                    Log.d(TAG, "PushFilter: reminder for finished task " + taskId + " arrived late, not shown");
                    event.preventDefault();
                    return;
                }
                // Remembered, so finishing the task can take it out of the shade.
                TaskPushes.rememberShown(ctx, taskId, notification.getAndroidNotificationId());
                // Seen here before: OneSignal re-delivers recent pushes whenever
                // the app process starts fresh ("restore"), and they come through
                // this filter again. The first pass decided how it showed; a
                // second pass shows nothing new and never sounds (Oct 13 2026:
                // an 11:00 "Take Pills" an alarm had covered came back loud at
                // 11:11, eleven minutes past the alarm's window). What the
                // first pass put in the tray stays as it is.
                if (seenBefore(ctx, notification)) {
                    Log.d(TAG, "PushFilter: push for task " + taskId + " seen before (restored), not shown again");
                    event.preventDefault();
                    return;
                }
                rememberSeen(ctx, notification);
                // On a break they asked for (Later on its alarm, LaterBreak): the
                // server takes its reminders off, but one already on its way still
                // lands — shown quietly, never rung, whatever it asks for.
                if (LaterBreak.covers(ctx, taskId, System.currentTimeMillis())) {
                    Log.d(TAG, "PushFilter: task " + taskId + " is on a break, showing this push quietly");
                    quietWithButtons(ctx, notification, data);
                    return;
                }
                // Its alarm is ringing right now: the alarm is the reminder, so
                // this copy isn't added to the tray (two rows for one reminder,
                // Oct 10 2026). If the alarm rings out unanswered, it puts the
                // reminder back in the tray itself.
                if (AlarmService.isRingingTask(ctx, taskId)) {
                    Log.d(TAG, "PushFilter: task " + taskId + " is ringing now, not adding a second copy");
                    event.preventDefault();
                    return;
                }
            }
            // Silenced from the pinned notification or the widget: this reminder still
            // shows, just with no sound, vibration or pop-up, and a push that asks to
            // ring does not ring. If its alarm already came due and is showing quietly
            // (ReminderPause.holdAlarm), the push would only be a second copy.
            if (ReminderPause.isPaused(ctx)) {
                if (ReminderPause.isHeldShowing(ctx, taskId)) {
                    event.preventDefault();
                    return;
                }
                Log.d(TAG, "PushFilter: ADHDone is silenced, showing this push quietly");
                quietWithButtons(ctx, notification, data);
                if (!taskId.isEmpty() && AlarmScheduler.alarmCoversNow(ctx, taskId)) {
                    remember(ctx, taskId, notification.getAndroidNotificationId());
                }
                return;
            }
            if (data != null && asksForAlarm(data)) {
                // OneSignal re-delivers recent pushes every time the app starts
                // fresh (its "restore"), and they come through this filter again.
                // A ring-now push that already rang, or that is more than a few
                // minutes old, must never ring again: it only shows quietly, as
                // the record it is. Without this, one birthday push rang on every
                // app open for three days, whatever was done with the task.
                if (alreadyRang(ctx, notification)) {
                    Log.d(TAG, "PushFilter: ring-now push already rang (restored), showing it quietly");
                    quietWithButtons(ctx, notification, data, false);
                    return;
                }
                if (isStale(notification)) {
                    // Late (no signal for a while) but never rang: too late to take over
                    // the screen, but it must still be heard — show it as a normal push.
                    Log.d(TAG, "PushFilter: ring-now push arrived late, showing it as a normal push");
                    loudWithButtons(ctx, notification, data);
                    return;
                }
                // The phone's own alarm for this task already rings for this same
                // moment: one ring, not two. The push stays as the quiet tray record.
                long moment = data.optLong("at", 0L);
                if (moment <= 0L) {
                    moment = System.currentTimeMillis();
                }
                // Unless that alarm can't be exact and hasn't rung yet: then it
                // could go off minutes late, so the push rings now and the alarm
                // is retired (AlarmScheduler.takeOverLateAlarm, Oct 29 2026).
                if (!taskId.isEmpty() && AlarmScheduler.bookedAlarmNear(ctx, taskId, moment, SAME_MOMENT_MS)
                        && !AlarmScheduler.takeOverLateAlarm(ctx, taskId, moment, SAME_MOMENT_MS)) {
                    // That alarm already rang, nobody answered, and it put its one
                    // copy back in the tray: this push arriving late is the same
                    // reminder a second time, so it isn't shown (Oct 17 2026).
                    if (TaskActions.recordShowing(ctx, taskId)) {
                        Log.d(TAG, "PushFilter: this task's alarm already rang for this moment and its copy is in the tray, not adding the push");
                        rememberRang(ctx, notification.getNotificationId());
                        event.preventDefault();
                        return;
                    }
                    Log.d(TAG, "PushFilter: this task's alarm rings for this moment already, showing the push quietly");
                    rememberRang(ctx, notification.getNotificationId());
                    quietWithButtons(ctx, notification, data, false);
                    remember(ctx, taskId, notification.getAndroidNotificationId());
                    return;
                }
                ringOnArrival(ctx, notification, data);
                // While it rings, the alarm is the reminder, and if nobody answers
                // AlarmService puts ONE copy back in the tray (TaskActions.postRecord).
                // The push itself is not shown: the alarm took its copy away before
                // OneSignal had put it up, so it stayed, and the ring-out copy joined
                // it — two rows a minute apart for one reminder (Anna, Oct 17 2026:
                // "Clean the litter box" at 9:09 and 9:10 PM, "Take your vitamins" at
                // 8:09 and 8:10 PM).
                event.preventDefault();
                return;
            }
            if (taskId.isEmpty()) {
                return;
            }
            // Judged by when the push was SENT as well as by now: the alarm for
            // this task that rang (or is booked) at about the send time was the
            // reminder, however late the phone hands the push over. Arrival
            // alone used to decide, so a push held back past the window rang
            // the same reminder a second time (Oct 13 2026).
            long sentAt = notification.getSentTime() > 0L ? notification.getSentTime() * 1000L : System.currentTimeMillis();
            if (!AlarmScheduler.alarmCoversNow(ctx, taskId)
                    && !AlarmScheduler.bookedAlarmNear(ctx, taskId, sentAt, COVER_WINDOW_MS)) {
                // Shown as usual, sound and all, with the task's Done / Snooze buttons.
                loudWithButtons(ctx, notification, data);
                return;
            }
            // The alarm that covers it can't be exact (no "Alarms & reminders"
            // access) and hasn't rung yet: it could go off minutes late. The push
            // is on time, so it rings now as that alarm would have, and the late
            // one is retired (Anna, Oct 29 2026: "You better make them exact").
            if (AlarmScheduler.takeOverLateAlarm(ctx, taskId, sentAt, COVER_WINDOW_MS)) {
                Log.d(TAG, "PushFilter: no exact alarm access, ringing the on-time push for task " + taskId);
                ringOnArrival(ctx, notification, data);
                event.preventDefault();
                return;
            }
            // Its alarm already rang for this reminder and, unanswered, put its
            // one copy back in the tray (TaskActions.postRecord): a push landing
            // after that (held back by the phone past the ring) is the same
            // reminder a second time, so it isn't shown (Oct 17 2026).
            if (TaskActions.recordShowing(ctx, taskId)) {
                Log.d(TAG, "PushFilter: the alarm's copy of this reminder is already in the tray, not adding the push for task " + taskId);
                event.preventDefault();
                return;
            }
            Log.d(TAG, "PushFilter: alarm covers this reminder, showing the push silently for task " + taskId);
            quietWithButtons(ctx, notification, data, false);
            remember(ctx, taskId, notification.getAndroidNotificationId());
        } catch (Exception e) {
            // Never let a filter bug cost someone a reminder.
            Log.w(TAG, "PushFilter: could not inspect push, showing it as usual", e);
        }
    }

    /** Show this push quietly, with its task's Done / Snooze buttons (TaskActions). */
    private static void quietWithButtons(Context ctx, IDisplayableMutableNotification n, JSONObject data) {
        quietWithButtons(ctx, n, data, true);
    }

    /**
     * logIt false: an alarm is (or already was) the ring for this same reminder
     * and has its own row under "What rang", so the quiet tray copy isn't listed
     * again (Oct 11 2026: every alarm showed twice, once as a muted copy).
     */
    private static void quietWithButtons(Context ctx, IDisplayableMutableNotification n, JSONObject data, boolean logIt) {
        // Shown without a sound: still listed under "What rang", as a quiet one.
        if (logIt) {
            RingLog.quiet(ctx, data != null ? data.optString("taskId", "") : "", n.getTitle(), n.getBody());
        }
        n.setExtender(TaskActions.extender(ctx, data, n.getAndroidNotificationId(), n.getTitle(), n.getBody(), true));
    }

    /** Show this push as usual, adding its task's Done / Snooze buttons when it has any. */
    private static void loudWithButtons(Context ctx, IDisplayableMutableNotification n, JSONObject data) {
        // A reminder that makes a sound is a ring: it goes in the log the app
        // shows under "What rang today" (RingLog). Quiet copies don't — their
        // alarm is the ring, and it is logged when it rings.
        RingLog.notified(ctx, data != null ? data.optString("taskId", "") : "",
                data != null ? data.optString("type", "") : "", n.getTitle(), n.getBody());
        if (TaskActions.buttonsFor(data) != TaskActions.BUTTONS_NONE) {
            n.setExtender(TaskActions.extender(ctx, data, n.getAndroidNotificationId(), n.getTitle(), n.getBody(), false));
        }
    }

    private static void remember(Context ctx, String taskId, int androidId) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(taskId, androidId).apply();
    }

    /** Is this task's own push already in the tray, shown quietly because an alarm had it? */
    static boolean hasQuietCopy(Context ctx, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return false;
        }
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(taskId)) {
            return false;
        }
        int androidId = prefs.getInt(taskId, 0);
        try {
            for (android.service.notification.StatusBarNotification sbn
                    : androidx.core.app.NotificationManagerCompat.from(ctx).getActiveNotifications()) {
                if (sbn.getId() == androidId) {
                    return true;
                }
            }
        } catch (Exception e) {
            // Can't tell: say no, so the reminder is shown rather than lost.
        }
        return false;
    }

    /** Alarm entries made from a push carry this prefix; the web app never lists them. */
    static final String PUSH_ALARM_PREFIX = "push:";

    /** Ring-now pushes that already rang here: push id -> when (ms). */
    private static final String RANG_PREFS = "adhdone_rang_pushes";
    /** Every task push this filter has handled once (by OneSignal id), so a restored copy is known. */
    private static final String SEEN_PREFS = "adhdone_seen_pushes";
    /** An alarm this close to a push's send time is the same reminder (AlarmScheduler.alarmCoversNow uses the same). */
    private static final long COVER_WINDOW_MS = 10L * 60L * 1000L;
    /** A ring-now push older than this is a re-delivery, not a new moment. */
    private static final long STALE_PUSH_MS = 5L * 60L * 1000L;
    /** OneSignal restores pushes for up to its 3-day default lifetime; keep a little longer. */
    private static final long RANG_KEEP_MS = 4L * 24L * 60L * 60L * 1000L;

    private static boolean alreadyRang(Context ctx, IDisplayableMutableNotification n) {
        String pushId = n.getNotificationId();
        if (pushId == null || pushId.isEmpty()) {
            return false;
        }
        return ctx.getSharedPreferences(RANG_PREFS, Context.MODE_PRIVATE).contains(pushId)
                || AlarmStore.get(ctx, PUSH_ALARM_PREFIX + pushId) != null;
    }

    private static boolean seenBefore(Context ctx, IDisplayableMutableNotification n) {
        String pushId = n.getNotificationId();
        if (pushId == null || pushId.isEmpty()) {
            return false;
        }
        return ctx.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE).contains(pushId);
    }

    private static void rememberSeen(Context ctx, IDisplayableMutableNotification n) {
        String pushId = n.getNotificationId();
        if (pushId == null || pushId.isEmpty()) {
            return;
        }
        SharedPreferences prefs = ctx.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        SharedPreferences.Editor ed = prefs.edit();
        for (java.util.Map.Entry<String, ?> e : prefs.getAll().entrySet()) {
            Object v = e.getValue();
            if (!(v instanceof Long) || now - (Long) v > RANG_KEEP_MS) {
                ed.remove(e.getKey());
            }
        }
        ed.putLong(pushId, now).apply();
    }

    private static boolean isStale(IDisplayableMutableNotification n) {
        long sentSeconds = n.getSentTime(); // OneSignal keeps this in seconds
        return sentSeconds > 0L && System.currentTimeMillis() - sentSeconds * 1000L > STALE_PUSH_MS;
    }

    private static void rememberRang(Context ctx, String pushId) {
        if (pushId == null || pushId.isEmpty()) {
            return;
        }
        SharedPreferences prefs = ctx.getSharedPreferences(RANG_PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        SharedPreferences.Editor ed = prefs.edit();
        for (java.util.Map.Entry<String, ?> e : prefs.getAll().entrySet()) {
            Object v = e.getValue();
            if (!(v instanceof Long) || now - (Long) v > RANG_KEEP_MS) {
                ed.remove(e.getKey());
            }
        }
        ed.putLong(pushId, now).apply();
    }

    /** A ring-now push and a booked alarm this close together are the same reminder. */
    private static final long SAME_MOMENT_MS = 3L * 60L * 1000L;

    /** The server's alarm list for set_alarms_task: sent as JSON text (or a JSON array). Null if unreadable. */
    private static JSONArray alarmsFrom(JSONObject data) {
        Object v = data.opt("alarms");
        if (v instanceof JSONArray) {
            return (JSONArray) v;
        }
        if (v instanceof String) {
            try {
                return new JSONArray((String) v);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    private static boolean asksForAlarm(JSONObject data) {
        if (data.optBoolean("alarm", false)) {
            return true;
        }
        String s = data.optString("alarm", "");
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    /**
     * Ring this push right now. The entry is stored like any booked alarm so the
     * alarm screen, snooze, dismiss and the ring-out timer all work unchanged.
     * The caller keeps the push itself off the screen (the alarm is the
     * reminder; an unanswered one comes back as one tray copy, see ignore).
     */
    private static void ringOnArrival(Context ctx, IDisplayableMutableNotification notification, JSONObject data) {
        AlarmStore.Entry e = new AlarmStore.Entry();
        String pushId = notification.getNotificationId();
        e.id = PUSH_ALARM_PREFIX + (pushId != null && !pushId.isEmpty() ? pushId : String.valueOf(System.currentTimeMillis()));
        e.taskId = data.optString("taskId", "");
        e.screen = data.optString("screen", "");
        e.openLabel = data.optString("openLabel", "");
        // A pushed alarm about an event gets an event's screen (Got it only).
        e.event = data.optBoolean("event", false) || "event_reminder".equals(data.optString("type", ""));
        e.theirTime = data.optBoolean("theirTime", false);
        e.eased = data.optBoolean("eased", false);
        // The push's own choices (Smart Reminders' "Are your reminders helping?"
        // Yes / No, Oct 31 2026), JSON text or an array: shown in the snooze
        // buttons' places, as an app-booked alarm's are (AlarmActivity.parseActions).
        Object actions = data.opt("actions");
        e.actionsJson = actions instanceof JSONArray || actions instanceof String ? String.valueOf(actions) : "";
        String title = notification.getTitle() != null ? notification.getTitle() : "";
        String body = notification.getBody() != null ? notification.getBody() : "";
        e.title = title.isEmpty() ? "ADHDone" : title;
        e.heading = title;
        e.body = body;
        e.at = System.currentTimeMillis();
        e.originalAt = e.at;
        // ONE PUSHED ALARM PER TASK. An earlier pushed alarm for this task that
        // is still waiting (snoozed from its screen) would ring again behind
        // this one, and from then on every snooze brings back two: Take Pills,
        // Oct 8 2026 — a nudge rang at 11:39 AM and was snoozed, a check-in at
        // 2:09 PM rang into it, and the pair came back together for the rest of
        // the afternoon. The newest nudge is the one that rings; the older entry
        // is over, and its quiet tray copy goes with it.
        if (!e.taskId.isEmpty()) {
            synchronized (AlarmStore.LOCK) {
                java.util.List<AlarmStore.Entry> all = AlarmStore.load(ctx);
                boolean changed = false;
                for (AlarmStore.Entry old : all) {
                    if (old.done || !e.taskId.equals(old.taskId) || old.id == null || !old.id.startsWith(PUSH_ALARM_PREFIX)) {
                        continue;
                    }
                    AlarmScheduler.cancel(ctx, old.id);
                    old.done = true;
                    changed = true;
                    cancelMutedPush(ctx, old.id);
                    Log.d(TAG, "PushFilter: older pushed alarm " + old.id + " replaced by this one for task " + e.taskId);
                }
                if (changed) {
                    AlarmStore.save(ctx, all);
                }
            }
        }
        AlarmStore.put(ctx, e);
        rememberRang(ctx, pushId);
        // Another task's alarm is ringing: "one alarm or two?" needs an answer
        // before this rings (PairDecisions). This runs off the main thread, so
        // a short wait for the server is fine; with no answer, the same-family
        // rule stands in.
        if (!e.taskId.isEmpty()) {
            String ringing = AlarmService.currentRingingId();
            AlarmStore.Entry r = ringing != null ? AlarmStore.get(ctx, ringing) : null;
            if (r != null && !r.taskId.isEmpty() && !r.taskId.equals(e.taskId)
                    && PairDecisions.cached(ctx, r.taskId, e.taskId) == null) {
                java.util.List<String[]> one = new java.util.ArrayList<>();
                one.add(new String[] { r.taskId, e.taskId });
                PairDecisions.ask(ctx, one, 6000);
            }
        }

        quietWithButtons(ctx, notification, data, false);
        remember(ctx, e.id, notification.getAndroidNotificationId());

        Intent ring = new Intent(ctx, AlarmService.class)
                .setAction(AlarmService.ACTION_RING)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id);
        try {
            // A high-priority push is one of the moments Android lets a foreground
            // service start from the background (the same exemption an exact alarm has).
            ContextCompat.startForegroundService(ctx, ring);
            Log.d(TAG, "PushFilter: push asked to ring, alarm " + e.id);
        } catch (Exception ex) {
            Log.w(TAG, "PushFilter: foreground service refused for pushed alarm, ringing without it", ex);
            AlarmService.ringWithoutService(ctx, e);
        }
    }

    /** The alarm was dismissed: the silent tray copy of the same reminder goes too. */
    static void cancelMutedPush(Context ctx, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int id = prefs.getInt(taskId, 0);
        if (id == 0) {
            return;
        }
        // Through OneSignal first: it records the push as dismissed, so it is never
        // restored (re-delivered) on a later app start. Cancelling it only with
        // Android's NotificationManager left OneSignal thinking it was still unseen.
        try {
            com.onesignal.OneSignal.getNotifications().removeNotification(id);
        } catch (Exception ignored) {
        }
        try {
            NotificationManagerCompat.from(ctx).cancel(id);
        } catch (Exception ignored) {
        }
        prefs.edit().remove(taskId).apply();
    }
}
