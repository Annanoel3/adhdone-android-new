package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

/**
 * Every choice made on an alarm or on a reminder's notification goes to the
 * server the moment it's made, with no app open (Anna, Oct 10 2026: "make sure
 * nothing requires the user to open the app for something to update", and
 * Smart Reminders sees "any choice made on an alarm (10 min, 30 min, 1 hour
 * etc)"): a snooze and when it brings the reminder back, Stop, ringing out
 * unanswered, Later, and Home or Back pressed while it rang (Oct 12 2026: that
 * closes the alarm and puts the task back in Smart Reminders' hands, and the
 * server keeps count of when it happens).
 *
 * Each choice is kept here in a small queue and ChoiceSyncWorker sends it as
 * soon as there is a connection (straight away, normally) and keeps retrying
 * in the background when there isn't. The server applies each one once (by its
 * report_id), so a retry after a lost answer counts nothing twice. What is
 * queued here is never also counted by the app's own drain
 * (AlarmBridge.drainActivity, which only reports what was never queued).
 *
 * If the phone's saved sign-in has expired, the queue waits (nothing is lost)
 * and goes out the next time the app is opened and signs in again.
 */
final class ChoiceReports {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_choice_reports";
    private static final String KEY = "queue";
    private static final int MAX_ITEMS = 300;
    /** Older than this and the moment has passed: dropped rather than sent. */
    private static final long MAX_AGE_MS = 3L * 24L * 60L * 60L * 1000L;

    static final String SNOOZE = "snooze";
    static final String DISMISS = "dismiss";
    static final String IGNORED = "ignored";
    static final String LATER = "later";
    /** Home or Back while it rang: closed with no answer (see AlarmService.leftRinging). */
    static final String CLOSED = "closed";

    static final Object LOCK = new Object();

    private ChoiceReports() {
    }

    /**
     * Queue one choice and ask for it to be sent. minutes: a snooze's length;
     * untilMs: when the snooze brings the reminder back (0 for other choices).
     */
    static void add(Context ctx, String taskId, String choice, int minutes, long untilMs) {
        add(ctx, taskId, choice, minutes, untilMs, null);
    }

    /**
     * The same, with how the alarm screen was left when that's what made the
     * choice: "home", "back" or "closed" (the screen went away some other way).
     */
    static void add(Context ctx, String taskId, String choice, int minutes, long untilMs, String how) {
        if (ctx == null || taskId == null || taskId.isEmpty() || choice == null) {
            return;
        }
        Context c = ctx.getApplicationContext();
        try {
            JSONObject o = new JSONObject();
            o.put("report_id", UUID.randomUUID().toString());
            o.put("task_id", taskId);
            o.put("choice", choice);
            o.put("minutes", Math.max(0, minutes));
            o.put("until", Math.max(0L, untilMs));
            o.put("at", System.currentTimeMillis());
            if (how != null && !how.isEmpty()) {
                o.put("how", how);
            }
            synchronized (LOCK) {
                JSONArray q = load(c);
                q.put(o);
                JSONArray trimmed = new JSONArray();
                int start = Math.max(0, q.length() - MAX_ITEMS);
                for (int i = start; i < q.length(); i++) {
                    trimmed.put(q.get(i));
                }
                save(c, trimmed);
            }
            Log.d(TAG, "ChoiceReports: queued " + choice + " for task " + taskId);
        } catch (Exception e) {
            Log.w(TAG, "ChoiceReports: could not queue " + choice + " for " + taskId, e);
            return;
        }
        ChoiceSyncWorker.kick(c);
    }

    /** A copy of what is waiting, oldest first; anything too old is dropped. */
    static JSONArray pending(Context ctx) {
        synchronized (LOCK) {
            JSONArray q = load(ctx);
            JSONArray keep = new JSONArray();
            long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
            boolean dropped = false;
            for (int i = 0; i < q.length(); i++) {
                JSONObject o = q.optJSONObject(i);
                if (o == null || o.optLong("at", 0L) < cutoff) {
                    dropped = true;
                    continue;
                }
                keep.put(o);
            }
            if (dropped) {
                save(ctx, keep);
            }
            return keep;
        }
    }

    static int size(Context ctx) {
        synchronized (LOCK) {
            return load(ctx).length();
        }
    }

    /** The server has this one: off the queue for good. */
    static void remove(Context ctx, String reportId) {
        if (reportId == null) {
            return;
        }
        synchronized (LOCK) {
            JSONArray q = load(ctx);
            JSONArray keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                JSONObject o = q.optJSONObject(i);
                if (o != null && !reportId.equals(o.optString("report_id", ""))) {
                    keep.put(o);
                }
            }
            save(ctx, keep);
        }
    }

    private static JSONArray load(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY, "[]");
            return new JSONArray(raw != null ? raw : "[]");
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static void save(Context ctx, JSONArray q) {
        // commit, not apply: the worker may read it from another process step
        // right after, and a choice must never be lost to a crash.
        prefs(ctx).edit().putString(KEY, q.toString()).commit();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
