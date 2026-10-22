package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What rang on this phone, and how each one ended — the record the app shows
 * under Settings → Notifications ("What rang today").
 *
 * Until build 38 nobody could answer "how many alarms did I get yesterday?":
 * the server's send ledger has the pushes it sent, but the phone's own alarms
 * (a task's time, the hour before, a snooze coming back, a nudge that rang on
 * arrival) and what was done with them lived only in the phone's alarm store,
 * which forgets an alarm once it is over (Anna, Oct 7 2026: "Are you positive
 * I really only had 6 smart alarms yesterday? Felt more like 15").
 *
 * One row per ring: a full-screen alarm (kind "alarm") or a reminder that
 * showed as a normal notification with sound (kind "notification"). An alarm's
 * row is updated when it ends: snoozed (and for how long), Later, dismissed,
 * done, rang out with no answer, or closed with Home or Back. A snooze that comes back is a new row —
 * every ring is a ring. Seven days are kept, newest first, at most 400 rows.
 * Data only: nothing here changes what reminds, or when.
 */
final class RingLog {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_ring_log";
    private static final String KEY_ROWS = "rows";
    private static final long KEEP_MS = 7L * 24L * 60L * 60L * 1000L;
    private static final int MAX_ROWS = 400;
    private static final Object LOCK = new Object();

    static final String KIND_ALARM = "alarm";
    static final String KIND_NOTIFICATION = "notification";
    /** A reminder shown with no sound (a quiet tray copy, a silenced or on-break one). */
    static final String KIND_QUIET = "quiet";

    static final String END_SNOOZED = "snoozed";
    static final String END_LATER = "later";
    static final String END_DISMISSED = "dismissed";
    static final String END_DONE = "done";
    static final String END_IGNORED = "ignored";
    static final String END_FOLDED = "folded";
    /** Home or Back while it rang: closed with no answer (AlarmService.leftRinging). */
    static final String END_CLOSED = "closed";
    /** Stopped so an alarm at a time they set could ring at its time; rings again after it (AlarmService.makeWay). */
    static final String END_MADE_WAY = "made_way";

    private RingLog() {
    }

    /** A full-screen alarm started ringing. */
    static void rang(Context ctx, AlarmStore.Entry e) {
        if (e == null) {
            return;
        }
        add(ctx, KIND_ALARM, e.id, e.taskId, e.title, e.heading, e.body, e.snoozes > 0);
        // It waited 10 minutes behind another task's alarm (AlarmService), and
        // the tasks that rang together with it, so the list can say why.
        if (e.queuedBehind != null && !e.queuedBehind.isEmpty()) {
            setLast(ctx, "queuedBehind", e.queuedBehind);
        }
        java.util.List<String> also = e.companionTitles();
        if (!also.isEmpty()) {
            setLast(ctx, "also", android.text.TextUtils.join(", ", also));
        }
    }

    /** A reminder shown quietly: in the tray with no sound (PushFilter). */
    static void quiet(Context ctx, String taskId, String title, String body) {
        add(ctx, KIND_QUIET, "quiet:" + System.currentTimeMillis(), taskId, title != null ? title : "", "", body != null ? body : "", false);
    }

    /** A reminder showed as a normal notification, sound and all (no alarm covered it). */
    static void notified(Context ctx, String taskId, String type, String title, String body) {
        add(ctx, KIND_NOTIFICATION, "push:" + System.currentTimeMillis(), taskId, title != null ? title : "", "", body != null ? body : "", false);
        if (type != null && !type.isEmpty()) {
            setLast(ctx, "type", type);
        }
    }

    /** How the alarm with this id ended. snoozeMinutes only for END_SNOOZED. */
    static void ended(Context ctx, String alarmId, String how, int snoozeMinutes) {
        ended(ctx, alarmId, how, snoozeMinutes, null);
    }

    /** The same, with the button that ended it when it was Home or Back ("home" / "back"). */
    static void ended(Context ctx, String alarmId, String how, int snoozeMinutes, String by) {
        if (alarmId == null || alarmId.isEmpty() || how == null) {
            return;
        }
        synchronized (LOCK) {
            try {
                JSONArray rows = load(ctx);
                // Newest row for this alarm that has no ending yet.
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject r = rows.optJSONObject(i);
                    if (r == null || !alarmId.equals(r.optString("id", ""))) {
                        continue;
                    }
                    if (!r.optString("ended", "").isEmpty()) {
                        continue;
                    }
                    r.put("ended", how);
                    r.put("endedAt", System.currentTimeMillis());
                    if (END_SNOOZED.equals(how) && snoozeMinutes > 0) {
                        r.put("snoozeMinutes", snoozeMinutes);
                    }
                    if (by != null && !by.isEmpty()) {
                        r.put("endedBy", by);
                    }
                    save(ctx, rows);
                    return;
                }
            } catch (Exception ex) {
                Log.w(TAG, "RingLog: could not record how " + alarmId + " ended", ex);
            }
        }
    }

    /** An alarm that never rang on its own because another for the same task was ringing. */
    static void folded(Context ctx, AlarmStore.Entry e, String why) {
        if (e == null) {
            return;
        }
        add(ctx, KIND_ALARM, e.id, e.taskId, e.title, e.heading, e.body, e.snoozes > 0);
        ended(ctx, e.id, END_FOLDED, 0);
        setLast(ctx, "note", why != null ? why : "");
    }

    /** The rows, newest first, no older than this many days (at most 7). */
    static JSONArray rows(Context ctx, int days) {
        long since = System.currentTimeMillis() - Math.max(1, Math.min(7, days)) * 24L * 60L * 60L * 1000L;
        JSONArray out = new JSONArray();
        synchronized (LOCK) {
            JSONArray rows = load(ctx);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject r = rows.optJSONObject(i);
                if (r != null && r.optLong("at", 0L) >= since) {
                    out.put(r);
                }
            }
        }
        return out;
    }

    private static void add(Context ctx, String kind, String id, String taskId, String title, String heading, String body, boolean fromSnooze) {
        synchronized (LOCK) {
            try {
                JSONArray rows = load(ctx);
                JSONObject r = new JSONObject();
                r.put("id", id != null ? id : "");
                r.put("kind", kind);
                r.put("taskId", taskId != null ? taskId : "");
                r.put("title", title != null ? title : "");
                r.put("heading", heading != null ? heading : "");
                r.put("body", body != null ? body : "");
                r.put("at", System.currentTimeMillis());
                r.put("fromSnooze", fromSnooze);
                r.put("ended", "");
                JSONArray next = new JSONArray();
                next.put(r);
                long cutoff = System.currentTimeMillis() - KEEP_MS;
                for (int i = 0; i < rows.length() && next.length() < MAX_ROWS; i++) {
                    JSONObject old = rows.optJSONObject(i);
                    if (old != null && old.optLong("at", 0L) >= cutoff) {
                        next.put(old);
                    }
                }
                save(ctx, next);
            } catch (Exception ex) {
                Log.w(TAG, "RingLog: could not record a ring", ex);
            }
        }
    }

    /** Adds a field to the newest row (set right after add()). */
    private static void setLast(Context ctx, String key, String value) {
        synchronized (LOCK) {
            try {
                JSONArray rows = load(ctx);
                JSONObject r = rows.optJSONObject(0);
                if (r != null) {
                    r.put(key, value);
                    save(ctx, rows);
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static JSONArray load(Context ctx) {
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ROWS, "[]");
            return new JSONArray(raw != null ? raw : "[]");
        } catch (Exception ex) {
            return new JSONArray();
        }
    }

    private static void save(Context ctx, JSONArray rows) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // Written to disk now, not later: a reminder that lands while the app
        // is closed is handled in a process Android may end moments after,
        // and rows saved the lazy way were missing from "What rang" (Oct 12
        // 2026: last night's sprinkler alarms and two afternoon nudges rang
        // but were never listed).
        p.edit().putString(KEY_ROWS, rows.toString()).commit();
    }
}
