package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.CalendarContract;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The phone's calendars come into ADHDone on their own, with the app closed
 * (Anna, Oct 19 2026: "calendar still doesn't sync on it's own"). Before this,
 * the calendars a person ticked were read only when the app opened, and at
 * most every 6 hours, so an event added in the phone's calendar app stayed out
 * of ADHDone until then.
 *
 * Android tells this worker when anything in the phone's calendars changes (a
 * content trigger on the calendar provider, held until things have been quiet
 * for 30 seconds, so an account syncing many events lands as one change), and
 * it also runs every 6 hours (a repeating event's next date moves on by
 * itself). Each time, it reads the ticked calendars (CalendarBridge.readEvents)
 * and, when that differs from what it last sent, hands the rows to the
 * server's calendar import (syncGoogleCalendar, source "device"): the same
 * import the app's Sync now uses, with its AI sorting, reminder plans, dedupe
 * and removals. Which calendars: the app says so (CalendarBridge
 * .setSyncCalendars) on every open and after every tick; none ticked, nothing
 * is watched.
 *
 * An empty read where there were events is not believed for 6 hours: a
 * calendar account in the middle of syncing can show nothing for a moment,
 * and the import takes a calendar's missing events as deleted ones.
 */
public class CalendarSyncWorker extends Worker {

    private static final String TAG = "ADHDone";
    static final String WATCH_NAME = "adhdone_calendar_watch";
    static final String SEND_NAME = "adhdone_calendar_send";
    static final String PERIODIC_NAME = "adhdone_calendar_periodic";

    private static final String KEY_MODE = "mode";
    private static final String MODE_WATCH = "watch";
    private static final String MODE_SEND = "send";

    private static final String PREFS = "adhdone_calendar_sync";
    private static final String KEY_IDS = "calendar_ids";
    private static final String KEY_HASH = "last_hash";
    private static final String KEY_SENT_AT = "last_sent_at";
    private static final String KEY_COUNT = "last_count";
    private static final String KEY_EMPTY_SINCE = "empty_since";

    /** The same window the app reads (calendarSync.js DEVICE_DAYS). */
    private static final int DAYS = 365;
    /** Unchanged rows are sent again after a day anyway, as a check-in. */
    private static final long RESEND_AFTER_MS = 24L * 60L * 60L * 1000L;
    private static final long EMPTY_HOLD_MS = 6L * 60L * 60L * 1000L;
    /** A first import sorts every event with AI: it can take minutes. */
    private static final int READ_TIMEOUT_MS = 180000;

    private static final Object LOCK = new Object();

    public CalendarSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The calendars the person ticked, as the app last said. */
    static List<String> calendarIds(Context c) {
        List<String> ids = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY_IDS, "[]"));
            for (int i = 0; i < a.length(); i++) {
                String id = a.optString(i, "").trim();
                if (!id.isEmpty() && id.matches("\\d+")) {
                    ids.add(id);
                }
            }
        } catch (Exception ignored) {
        }
        return ids;
    }

    /**
     * The app's word on which calendars to watch. Called on every app open and
     * after every tick, so it changes nothing when nothing changed.
     */
    static void setCalendars(Context ctx, List<String> ids) {
        Context c = ctx.getApplicationContext();
        String json = new JSONArray(ids).toString();
        SharedPreferences p = prefs(c);
        boolean changed = !json.equals(p.getString(KEY_IDS, "[]"));
        SharedPreferences.Editor ed = p.edit().putString(KEY_IDS, json);
        // A different set of calendars: what was sent before says nothing.
        if (changed) {
            ed.remove(KEY_HASH).remove(KEY_COUNT).remove(KEY_EMPTY_SINCE);
        }
        ed.apply();
        if (ids.isEmpty()) {
            stop(c);
            return;
        }
        // Watching the calendar provider only with calendar access: once it's
        // turned back on, the app says so again on its next open and this arms.
        if (CalendarBridge.hasPermission(c)) {
            arm(c, ExistingWorkPolicy.KEEP);
        }
        schedulePeriodic(c);
    }

    /** Nothing ticked: no watching, no sending. */
    static void stop(Context c) {
        try {
            WorkManager wm = WorkManager.getInstance(c.getApplicationContext());
            wm.cancelUniqueWork(WATCH_NAME);
            wm.cancelUniqueWork(PERIODIC_NAME);
            wm.cancelUniqueWork(SEND_NAME);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not stop", e);
        }
    }

    /** Wait for the next change in the phone's calendars. */
    private static void arm(Context c, ExistingWorkPolicy policy) {
        try {
            Constraints constraints = new Constraints.Builder()
                    .addContentUriTrigger(CalendarContract.CONTENT_URI, true)
                    .setTriggerContentUpdateDelay(30, TimeUnit.SECONDS)
                    .setTriggerContentMaxDelay(2, TimeUnit.MINUTES)
                    .build();
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CalendarSyncWorker.class)
                    .setConstraints(constraints)
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_WATCH).build())
                    .addTag(WATCH_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(WATCH_NAME, policy, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not watch the calendars", e);
        }
    }

    /** Read and send as soon as there is a connection, retrying on its own. */
    private static void kickSend(Context c) {
        try {
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CalendarSyncWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_SEND).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,
                            OneTimeWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                    .addTag(SEND_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext())
                    .enqueueUniqueWork(SEND_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not queue a send", e);
        }
    }

    private static void schedulePeriodic(Context c) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(CalendarSyncWorker.class, 6, TimeUnit.HOURS)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_SEND).build())
                    .addTag(PERIODIC_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext())
                    .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not schedule the 6-hour check", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (MODE_WATCH.equals(getInputData().getString(KEY_MODE))) {
            // Listen for the next change first, so it's heard even if the send
            // below can't go out yet.
            if (!calendarIds(c).isEmpty() && CalendarBridge.hasPermission(c)) {
                arm(c, ExistingWorkPolicy.APPEND_OR_REPLACE);
                kickSend(c);
            }
            return Result.success();
        }
        synchronized (LOCK) {
            return send(c);
        }
    }

    private static Result send(Context c) {
        List<String> ids = calendarIds(c);
        if (ids.isEmpty()) {
            return Result.success();
        }
        // Calendar access turned off: the app says so itself on its next open.
        if (!CalendarBridge.hasPermission(c)) {
            Log.w(TAG, "CalendarSyncWorker: no calendar access, nothing read");
            return Result.success();
        }
        // Signed out, or never signed in on this phone yet.
        if (!Base44Session.isUsable(c)) {
            return Result.success();
        }

        JSONArray rows = new JSONArray();
        try {
            CalendarBridge.readEvents(c, ids, DAYS, rows);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not read the calendars", e);
            return Result.retry();
        }

        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        if (rows.length() == 0 && p.getInt(KEY_COUNT, -1) != 0) {
            long since = p.getLong(KEY_EMPTY_SINCE, 0L);
            if (since == 0L) {
                p.edit().putLong(KEY_EMPTY_SINCE, now).apply();
                Log.w(TAG, "CalendarSyncWorker: the calendars read empty, waiting before believing it");
                return Result.success();
            }
            if (now - since < EMPTY_HOLD_MS) {
                return Result.success();
            }
        } else if (p.contains(KEY_EMPTY_SINCE)) {
            p.edit().remove(KEY_EMPTY_SINCE).apply();
        }

        String hash = sha256(ids.toString() + "|" + rows.toString());
        if (hash.equals(p.getString(KEY_HASH, "")) && now - p.getLong(KEY_SENT_AT, 0L) < RESEND_AFTER_MS) {
            return Result.success();
        }

        JSONObject body = new JSONObject();
        try {
            body.put("source", "device");
            body.put("calendarIds", new JSONArray(ids));
            body.put("rows", rows);
            body.put("from", "phone_background");
        } catch (Exception e) {
            return Result.success();
        }

        Base44Api.Result r = Base44Api.syncPhoneCalendars(c, body, READ_TIMEOUT_MS);
        if (r.isSuccess() && r.body != null && r.body.optBoolean("in_progress", false)) {
            // Another sync (the app's own) holds the server's lock: try again shortly.
            return Result.retry();
        }
        if (r.isSuccess()) {
            p.edit()
                    .putString(KEY_HASH, hash)
                    .putLong(KEY_SENT_AT, now)
                    .putInt(KEY_COUNT, rows.length())
                    .apply();
            Log.d(TAG, "CalendarSyncWorker: sent " + rows.length() + " event(s); created "
                    + (r.body != null ? r.body.optInt("created", 0) : 0));
            return Result.success();
        }
        if (r.isAuthFailure()) {
            // The saved sign-in is stale: the next app open stores a fresh one,
            // and the next change or 6-hour check sends again.
            Log.w(TAG, "CalendarSyncWorker: sign-in refused, waiting for a fresh one");
            return Result.success();
        }
        if (r.isTransport() || r.code >= 500 || r.code == 429) {
            return Result.retry();
        }
        Log.w(TAG, "CalendarSyncWorker: the server refused the calendars (" + r.code + ")");
        return Result.success();
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }
}
