package co.median.android.odxqpdy;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Books alarms with AlarmManager from what AlarmStore holds.
 *
 * setAlarmClock() is the one kind of alarm Android never delays: it leaves Doze to
 * deliver it and shows the alarm icon in the status bar. It needs the "Alarms &
 * reminders" special access (SCHEDULE_EXACT_ALARM), which Android 14 does not grant
 * to a fresh install by default. Without it we fall back to an inexact
 * allow-while-idle alarm — better than nothing, and AlarmBridge.getStatus() tells
 * the web app so it can ask the user to switch the access on.
 */
final class AlarmScheduler {

    private static final String TAG = "ADHDone";

    /** Broadcast action AlarmManager fires into AlarmReceiver. */
    static final String ACTION_FIRE = "co.median.android.odxqpdy.ALARM_FIRE";
    static final String EXTRA_ALARM_ID = "adhdone_alarm_id";

    private AlarmScheduler() {
    }

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private static PendingIntent firePendingIntent(Context context, String id) {
        Intent intent = new Intent(context, AlarmReceiver.class)
                .setAction(ACTION_FIRE)
                .putExtra(EXTRA_ALARM_ID, id);
        // One PendingIntent per alarm id: same id + same request code = same alarm, so
        // rescheduling replaces rather than duplicates. Never two alarms for one task.
        return PendingIntent.getBroadcast(context, requestCode(id), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent showPendingIntent(Context context) {
        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int requestCode(String id) {
        return 0x4A000000 | (id.hashCode() & 0x00FFFFFF);
    }

    /** Book (or re-book) one alarm. Past times are never booked. */
    static void schedule(Context context, AlarmStore.Entry e) {
        if (e == null || e.done) {
            return;
        }
        long now = System.currentTimeMillis();
        if (e.at <= now) {
            Log.d(TAG, "AlarmScheduler: not booking " + e.id + ", its time has passed");
            return;
        }
        // Inside a break they asked for (Later on the alarm): not booked, and
        // marked done so no later pass books it either — by the time the break
        // ends its moment is in the past (LaterBreak).
        if (LaterBreak.covers(context, e.taskId, e.at)) {
            e.done = true;
            e.breakOff = true;
            Log.d(TAG, "AlarmScheduler: not booking " + e.id + ", its task is on a break");
            return;
        }
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        PendingIntent fire = firePendingIntent(context, e.id);
        // The exact-alarm grant can be pulled between the check and the call, and
        // AlarmManager refuses new alarms past a per-app cap. Neither may crash the
        // app: fall back to an inexact booking, and log if even that fails.
        if (canScheduleExact(context)) {
            try {
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(e.at, showPendingIntent(context)), fire);
                Log.d(TAG, "AlarmScheduler: exact alarm booked " + e.id + " at " + e.at);
                return;
            } catch (Exception ex) {
                Log.w(TAG, "AlarmScheduler: exact booking failed for " + e.id + ", trying inexact", ex);
            }
        }
        try {
            // No special access (or exact booking failed): inexact, but still
            // allowed to fire while idle. Android may deliver it up to ~10 minutes
            // late; the Settings card asks the user to allow exact alarms.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, fire);
            Log.w(TAG, "AlarmScheduler: booked inexact " + e.id);
        } catch (Exception ex) {
            Log.e(TAG, "AlarmScheduler: could not book " + e.id + " at all", ex);
        }
    }

    /**
     * Does this phone hold an alarm for the task at (about) this moment? Used by
     * PushFilter to drop the push for a reminder the alarm is already handling.
     * A snoozed or already-dismissed alarm still counts: it rang, or will.
     */
    static boolean alarmCoversNow(Context context, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return false;
        }
        long now = System.currentTimeMillis();
        long window = 10L * 60L * 1000L;
        for (AlarmStore.Entry e : AlarmStore.load(context)) {
            // A missed alarm (its time passed while the phone was off) never rang:
            // the push is the only reminder left, so it must not be made silent.
            if (e.missed) {
                continue;
            }
            if (taskId.equals(e.taskId) && Math.abs(e.originalAt - now) <= window) {
                return true;
            }
        }
        return false;
    }

    /**
     * Does this phone hold one of its booked task alarms (from the web app's
     * list or the server's, never a pushed or timer one) for this task within
     * windowMs of this moment? A snoozed or dismissed one counts: it rang, or
     * will. A missed one does not: it never rang.
     */
    static boolean bookedAlarmNear(Context context, String taskId, long moment, long windowMs) {
        if (taskId == null || taskId.isEmpty()) {
            return false;
        }
        for (AlarmStore.Entry e : AlarmStore.load(context)) {
            if (e.missed || isPhoneOwned(e.id)) {
                continue;
            }
            if (taskId.equals(e.taskId) && Math.abs(e.originalAt - moment) <= windowMs) {
                return true;
            }
        }
        return false;
    }

    /**
     * Without the "Alarms & reminders" access (Android 14 doesn't give it to a
     * fresh install), this phone's own alarm is booked inexactly and can go off
     * up to ~10 minutes late, while the push for the same reminder arrives on
     * time. A push used to stay quiet whenever the phone held an alarm for that
     * moment, so the reminder was only heard when the late alarm went off (Anna,
     * Oct 29 2026: "You better make them exact"). Now, if this task's alarm for
     * this moment hasn't rung yet, it is retired and the push rings instead:
     * on time, and once.
     *
     * Returns true when it retired the alarm (the push should ring). False when
     * the phone has the exact access (its alarm is on time), or when the alarm
     * already rang, was snoozed, is ringing, or is on a break (the push stays quiet).
     */
    static boolean takeOverLateAlarm(Context context, String taskId, long moment, long windowMs) {
        if (taskId == null || taskId.isEmpty() || canScheduleExact(context)) {
            return false;
        }
        String ringing = AlarmService.currentRingingId();
        synchronized (AlarmStore.LOCK) {
            List<AlarmStore.Entry> all = AlarmStore.load(context);
            List<AlarmStore.Entry> pending = new java.util.ArrayList<>();
            for (AlarmStore.Entry e : all) {
                if (e.missed || isPhoneOwned(e.id) || !taskId.equals(e.taskId)
                        || Math.abs(e.originalAt - moment) > windowMs) {
                    continue;
                }
                if (e.done || e.snoozes > 0 || e.id.equals(ringing)) {
                    return false;
                }
                pending.add(e);
            }
            if (pending.isEmpty()) {
                return false;
            }
            for (AlarmStore.Entry e : pending) {
                cancel(context, e.id);
                e.done = true;
                Log.d(TAG, "AlarmScheduler: no exact access, the on-time push rings instead of late alarm " + e.id);
            }
            AlarmStore.save(context, all);
            return true;
        }
    }

    static void cancel(Context context, String id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null || id == null) {
            return;
        }
        PendingIntent fire = firePendingIntent(context, id);
        am.cancel(fire);
        fire.cancel();
        Log.d(TAG, "AlarmScheduler: cancelled " + id);
    }

    /** Alarm ids the phone made itself; the web app's task sync leaves these alone. */
    static final String TIMER_ALARM_PREFIX = "timer:";

    static boolean isPhoneOwned(String id) {
        return id != null && (id.startsWith(PushFilter.PUSH_ALARM_PREFIX) || id.startsWith(TIMER_ALARM_PREFIX));
    }

    /**
     * Right after the phone starts up: every alarm whose time passed while it was
     * off never rang. Mark it missed (and over), so it neither silences the push
     * for that moment nor rings hours late from an old notification.
     */
    static void markMissedAfterBoot(Context context) {
        synchronized (AlarmStore.LOCK) {
            long now = System.currentTimeMillis();
            List<AlarmStore.Entry> list = AlarmStore.load(context);
            boolean changed = false;
            for (AlarmStore.Entry e : list) {
                if (!e.done && e.at <= now) {
                    e.done = true;
                    e.missed = true;
                    changed = true;
                }
            }
            if (changed) {
                AlarmStore.save(context, list);
            }
        }
    }

    /** After a reboot, an app update, or the special access being granted. */
    static void rearmAll(Context context) {
        int booked = 0;
        for (AlarmStore.Entry e : AlarmStore.load(context)) {
            if (!e.done && e.at > System.currentTimeMillis()) {
                schedule(context, e);
                booked++;
            }
        }
        Log.d(TAG, "AlarmScheduler: re-armed " + booked + " alarm(s)");
    }

    /**
     * Replace the whole set with what the web app sent.
     *
     * Rules, in order:
     *  - An incoming alarm whose requested time matches what we already hold keeps its
     *    local state: a snoozed alarm stays snoozed, a dismissed one stays dismissed.
     *  - A new alarm, or one whose requested time changed, is booked fresh.
     *  - A time already in the past is recorded as done, never fired: nobody wants an
     *    alarm for yesterday going off because the app was opened today.
     *  - Anything we hold that the web app no longer lists is cancelled and forgotten.
     * Returns how many alarms are booked afterwards.
     */
    static int sync(Context context, JSONArray incoming) {
        return sync(context, incoming, null);
    }

    /**
     * activeTaskIds: every task still active (the web app sends it from 1.3.14
     * on; null from older web code). With it, a pushed alarm — a nudge that
     * rang here and may be snoozed — for a task no longer on that list is
     * cancelled: the task was finished, deleted or parked, and its snoozed
     * nudge must not ring (see dropTaskLocked).
     */
    static int sync(Context context, JSONArray incoming, Set<String> activeTaskIds) {
        synchronized (AlarmStore.LOCK) {
            return syncLocked(context, incoming, activeTaskIds);
        }
    }

    private static int syncLocked(Context context, JSONArray incoming, Set<String> activeTaskIds) {
        long now = System.currentTimeMillis();
        List<AlarmStore.Entry> existing = AlarmStore.load(context);
        List<AlarmStore.Entry> next = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> incomingTasks = new HashSet<>();
        for (int i = 0; incoming != null && i < incoming.length(); i++) {
            JSONObject o = incoming.optJSONObject(i);
            String t = o != null ? o.optString("taskId", "") : "";
            if (!t.isEmpty()) {
                incomingTasks.add(t);
            }
        }
        int booked = 0;

        for (int i = 0; incoming != null && i < incoming.length(); i++) {
            JSONObject o = incoming.optJSONObject(i);
            if (o == null) {
                continue;
            }
            String id = o.optString("id", "").trim();
            long at = o.optLong("at", 0L);
            if (id.isEmpty() || at <= 0L || seen.contains(id)) {
                continue;
            }
            seen.add(id);

            AlarmStore.Entry prev = AlarmStore.find(existing, id);
            if (prev != null && prev.originalAt == at) {
                // Same request as before: keep snooze / dismiss state, refresh the label.
                prev.taskId = o.optString("taskId", prev.taskId);
                prev.title = o.optString("title", prev.title);
                prev.heading = o.optString("heading", prev.heading);
                prev.body = o.optString("body", prev.body);
                prev.openLabel = o.optString("openLabel", "");
                prev.family = o.optString("family", prev.family);
                prev.throughQuiet = o.optBoolean("throughQuiet", false);
                prev.theirTime = o.optBoolean("theirTime", false);
                prev.event = o.optBoolean("event", false);
                next.add(prev);
                reviveIfBreakOver(context, prev, now);
                if (!prev.done && prev.at > now) {
                    schedule(context, prev);
                    booked++;
                }
                continue;
            }

            AlarmStore.Entry e = new AlarmStore.Entry();
            e.id = id;
            e.family = o.optString("family", "");
            e.taskId = o.optString("taskId", "");
            e.title = o.optString("title", "");
            e.heading = o.optString("heading", "");
            e.body = o.optString("body", "");
            e.openLabel = o.optString("openLabel", "");
            e.throughQuiet = o.optBoolean("throughQuiet", false);
            e.theirTime = o.optBoolean("theirTime", false);
            e.event = o.optBoolean("event", false);
            e.at = at;
            e.originalAt = at;
            e.done = at <= now;
            next.add(e);
            if (!e.done) {
                schedule(context, e);
                booked++;
            }
        }

        for (AlarmStore.Entry old : existing) {
            if (seen.contains(old.id)) {
                continue;
            }
            // Alarms the phone owns — made from a push (PushFilter) or booked
            // for a timer's end (AlarmBridge.bookOwn) — are never in the web
            // app's list, so a sync must not throw one away while it is due,
            // ringing or snoozed. They age out after a day.
            if (isPhoneOwned(old.id) && now - old.originalAt < 24L * 60L * 60L * 1000L) {
                // ...unless it is a pushed alarm for a task that is no longer
                // active (finished, deleted, parked): then it goes, snooze and all.
                if (activeTaskIds != null && old.id.startsWith(PushFilter.PUSH_ALARM_PREFIX)
                        && old.taskId != null && !old.taskId.isEmpty() && !activeTaskIds.contains(old.taskId)
                        && !old.done && old.at > now) {
                    cancel(context, old.id);
                    Log.d(TAG, "AlarmScheduler: pushed alarm " + old.id + " dropped, its task is no longer active");
                    continue;
                }
                next.add(old);
                continue;
            }
            // A snooze the person asked for, still ahead, for a task that is still
            // on the list: the web app's list names reminders by their planned time,
            // so when the server moves a task's next reminder the snoozed one no
            // longer matches — it must still ring when they said it should.
            if (!old.done && old.snoozes > 0 && old.at > now && incomingTasks.contains(old.taskId)) {
                next.add(old);
                continue;
            }
            cancel(context, old.id);
        }

        AlarmStore.save(context, next);
        context.getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_LAST_SYNC, now).apply();
        Log.d(TAG, "AlarmScheduler: sync kept " + next.size() + ", booked " + booked);
        // Alarms for different tasks at the same moment: the answer to "one
        // ring or two?" is fetched now, so the ring never waits for it.
        PairDecisions.prepareAsync(context);
        return booked;
    }

    /** When the web app last handed over its alarm list (see dropTask). */
    private static final String SYNC_PREFS = "adhdone_alarm_sync";
    private static final String KEY_LAST_SYNC = "last_web_sync_at";

    /**
     * The server says this task was finished or deleted (a silent push, see
     * PushFilter). Its upcoming alarms come off this phone, so it can't ring for
     * something that's done. Skipped when the web app has rebuilt the list since
     * that change: the list it sent already reflects it (and an Undo right after
     * must not be undone by this message arriving late). An alarm that is
     * ringing right now is left to finish; timer and pushed alarms are untouched.
     * Returns how many alarms were taken off.
     */
    static int dropTask(Context context, String taskId, long changedAt) {
        if (taskId == null || taskId.isEmpty()) {
            return 0;
        }
        synchronized (AlarmStore.LOCK) {
            return dropTaskLocked(context, taskId, changedAt);
        }
    }

    /**
     * Later was tapped for this task (LaterBreak): every alarm of its — booked
     * from a list or made from a push, snoozed or not — that falls inside the
     * break comes off the phone and is marked done. A ring in progress is left
     * to AlarmService, which is stopping it. Returns how many came off.
     */
    /**
     * An alarm that only a Later break turned off, and that the break no longer
     * covers (the server's break was shorter than the phone's guess: a task due
     * today gets none, Anna, Oct 11 2026): on again. Its own time still ahead.
     */
    static boolean reviveIfBreakOver(Context context, AlarmStore.Entry e, long now) {
        if (e != null && e.done && e.breakOff && e.at > now && !LaterBreak.covers(context, e.taskId, e.at)) {
            e.done = false;
            e.breakOff = false;
            return true;
        }
        return false;
    }

    /** Every alarm of this task that a break turned off and no longer covers: booked again. */
    static int reviveTask(Context context, String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return 0;
        }
        synchronized (AlarmStore.LOCK) {
            long now = System.currentTimeMillis();
            List<AlarmStore.Entry> all = AlarmStore.load(context);
            int on = 0;
            for (AlarmStore.Entry e : all) {
                if (taskId.equals(e.taskId) && reviveIfBreakOver(context, e, now)) {
                    schedule(context, e);
                    on++;
                }
            }
            if (on > 0) {
                AlarmStore.save(context, all);
                Log.d(TAG, "AlarmScheduler: " + on + " alarm(s) for " + taskId + " back on, its break ended early");
            }
            return on;
        }
    }

    static int dropTaskUntil(Context context, String taskId, long untilMs) {
        if (taskId == null || taskId.isEmpty()) {
            return 0;
        }
        synchronized (AlarmStore.LOCK) {
            long now = System.currentTimeMillis();
            List<AlarmStore.Entry> all = AlarmStore.load(context);
            int off = 0;
            for (AlarmStore.Entry e : all) {
                if (!taskId.equals(e.taskId) || e.done || e.at <= now || e.at >= untilMs) {
                    continue;
                }
                if (e.id.startsWith(TIMER_ALARM_PREFIX)) {
                    continue;
                }
                cancel(context, e.id);
                e.done = true;
                e.breakOff = true;
                off++;
            }
            if (off > 0) {
                AlarmStore.save(context, all);
            }
            return off;
        }
    }

    private static int dropTaskLocked(Context context, String taskId, long changedAt) {
        long lastSync = context.getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE).getLong(KEY_LAST_SYNC, 0L);
        if (changedAt > 0L && lastSync > changedAt) {
            Log.d(TAG, "AlarmScheduler: drop for " + taskId + " is older than the last sync, ignoring");
            return 0;
        }
        long now = System.currentTimeMillis();
        List<AlarmStore.Entry> existing = AlarmStore.load(context);
        List<AlarmStore.Entry> keep = new ArrayList<>();
        int dropped = 0;
        for (AlarmStore.Entry e : existing) {
            if (taskId.equals(e.taskId) && !isPhoneOwned(e.id) && !e.done && e.at > now) {
                cancel(context, e.id);
                dropped++;
                continue;
            }
            // A nudge that rang for this task and was snoozed (a pushed alarm,
            // see PushFilter): the task is finished or gone, so the snooze goes
            // too. It used to survive, and rang an hour after the task had been
            // moved to the Parking Lot (Oct 5 2026). A timer's alarm is not a
            // task's: left alone.
            if (taskId.equals(e.taskId) && e.id.startsWith(PushFilter.PUSH_ALARM_PREFIX) && !e.done && e.at > now) {
                cancel(context, e.id);
                dropped++;
                continue;
            }
            keep.add(e);
        }
        if (dropped > 0) {
            AlarmStore.save(context, keep);
        }
        Log.d(TAG, "AlarmScheduler: dropped " + dropped + " alarm(s) for finished/deleted task " + taskId);
        return dropped;
    }

    /** Per task: the newest server change already applied here (see replaceTask). */
    private static final String SERVER_SET_PREFS = "adhdone_alarm_server_sets";
    /** The nearest ones matter; the rest come with the next app open. */
    private static final int SERVER_SET_MAX = 50;
    private static final long SERVER_SET_KEEP_MS = 3L * 24L * 60L * 60L * 1000L;

    /**
     * The server says this task's reminders changed while the app wasn't open
     * (a calendar event moved, a repeating reminder moved on to its next time, an
     * edit made somewhere else): a silent push (see PushFilter) carries this
     * task's alarms exactly as the web app would list them, and they replace what
     * this phone holds for the task. The same rules as sync(), for this one task:
     *  - an alarm with the same id and time keeps its snooze / dismiss state;
     *  - a new or moved one is booked; a time already past is never booked;
     *  - an upcoming alarm the list no longer has is cancelled, except a snooze
     *    the person asked for while the task still has alarms (an empty list
     *    means the task no longer rings at all);
     *  - an alarm already due, ringing or done is left alone (the next app open
     *    tidies it), and the phone's own (timers, pushed alarms) are untouched.
     * Skipped when the web app rebuilt the whole list after that change (its list
     * already reflects it), or when a newer server list for this task is already
     * in (OneSignal can replay an older push when the app starts).
     * Returns how many of the task's alarms are booked afterwards, or -1 if skipped.
     */
    static int replaceTask(Context context, String taskId, JSONArray incoming, long changedAt) {
        if (taskId == null || taskId.isEmpty() || incoming == null) {
            return -1;
        }
        synchronized (AlarmStore.LOCK) {
            return replaceTaskLocked(context, taskId, incoming, changedAt);
        }
    }

    private static int replaceTaskLocked(Context context, String taskId, JSONArray incoming, long changedAt) {
        long lastSync = context.getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE).getLong(KEY_LAST_SYNC, 0L);
        if (changedAt > 0L && lastSync > changedAt) {
            Log.d(TAG, "AlarmScheduler: server list for " + taskId + " is older than the last sync, ignoring");
            return -1;
        }
        SharedPreferences applied = context.getSharedPreferences(SERVER_SET_PREFS, Context.MODE_PRIVATE);
        if (changedAt > 0L && applied.getLong(taskId, 0L) >= changedAt) {
            Log.d(TAG, "AlarmScheduler: a newer server list for " + taskId + " is already in, ignoring");
            return -1;
        }
        long now = System.currentTimeMillis();
        List<AlarmStore.Entry> existing = AlarmStore.load(context);
        List<AlarmStore.Entry> next = new ArrayList<>();
        List<AlarmStore.Entry> mine = new ArrayList<>();
        Set<String> otherIds = new HashSet<>();
        for (AlarmStore.Entry e : existing) {
            if (taskId.equals(e.taskId) && !isPhoneOwned(e.id)) {
                mine.add(e);
            } else {
                next.add(e);
                otherIds.add(e.id);
            }
        }

        Set<String> seen = new HashSet<>();
        int booked = 0;
        for (int i = 0; i < incoming.length() && seen.size() < SERVER_SET_MAX; i++) {
            JSONObject o = incoming.optJSONObject(i);
            if (o == null) {
                continue;
            }
            String id = o.optString("id", "").trim();
            long at = o.optLong("at", 0L);
            // Past: never booked. An id another task or the phone itself uses: not ours.
            if (id.isEmpty() || at <= now || seen.contains(id) || otherIds.contains(id) || isPhoneOwned(id)) {
                continue;
            }
            seen.add(id);

            AlarmStore.Entry prev = AlarmStore.find(mine, id);
            if (prev != null && prev.originalAt == at) {
                // Same request as before: keep snooze / dismiss state, refresh the words.
                prev.title = o.optString("title", prev.title);
                prev.heading = o.optString("heading", prev.heading);
                prev.body = o.optString("body", prev.body);
                prev.openLabel = o.optString("openLabel", "");
                prev.family = o.optString("family", prev.family);
                prev.throughQuiet = o.optBoolean("throughQuiet", false);
                prev.theirTime = o.optBoolean("theirTime", false);
                prev.event = o.optBoolean("event", false);
                next.add(prev);
                reviveIfBreakOver(context, prev, now);
                if (!prev.done && prev.at > now) {
                    schedule(context, prev);
                    booked++;
                }
                continue;
            }
            if (prev != null) {
                cancel(context, prev.id);
            }

            AlarmStore.Entry e = new AlarmStore.Entry();
            e.id = id;
            e.taskId = taskId;
            e.family = o.optString("family", "");
            e.title = o.optString("title", "");
            e.heading = o.optString("heading", "");
            e.body = o.optString("body", "");
            e.openLabel = o.optString("openLabel", "");
            e.throughQuiet = o.optBoolean("throughQuiet", false);
            e.theirTime = o.optBoolean("theirTime", false);
            e.event = o.optBoolean("event", false);
            e.at = at;
            e.originalAt = at;
            next.add(e);
            schedule(context, e);
            booked++;
        }

        boolean stillRings = !seen.isEmpty();
        int cancelled = 0;
        for (AlarmStore.Entry old : mine) {
            if (seen.contains(old.id)) {
                continue;
            }
            boolean upcoming = !old.done && old.at > now;
            if (!upcoming) {
                next.add(old);
                continue;
            }
            if (stillRings && old.snoozes > 0) {
                next.add(old);
                continue;
            }
            cancel(context, old.id);
            cancelled++;
        }

        AlarmStore.save(context, next);

        SharedPreferences.Editor ed = applied.edit();
        for (java.util.Map.Entry<String, ?> kv : applied.getAll().entrySet()) {
            Object v = kv.getValue();
            if (!(v instanceof Long) || now - (Long) v > SERVER_SET_KEEP_MS) {
                ed.remove(kv.getKey());
            }
        }
        ed.putLong(taskId, changedAt > 0L ? changedAt : now).apply();

        Log.d(TAG, "AlarmScheduler: server list for " + taskId + " booked " + booked + ", cancelled " + cancelled);
        PairDecisions.prepareAsync(context);
        return booked;
    }
}
