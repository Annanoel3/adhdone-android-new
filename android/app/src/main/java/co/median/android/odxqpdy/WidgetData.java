package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Storage for the home-screen widget's task snapshot.
 *
 * The web app owns the definition of "today" — src/components/utils/todayTasks.js
 * (isTodayTask) has real nuance around start_date/due_date/end_date, one-time tasks
 * and silenced "back burner" tasks. Rather than duplicate that in Java and let the
 * two drift, the web app sends an already-filtered list plus the local date it was
 * generated for. Native just renders it, and flags it as stale once that date is no
 * longer today.
 */
public final class WidgetData {

    private static final String TAG = "ADHDone";

    private static final String PREFS_NAME = "adhdone_widget";
    private static final String KEY_TASKS = "tasks_json";
    private static final String KEY_GENERATED_FOR = "generated_for";
    private static final String KEY_UPDATED_AT = "updated_at";
    private static final String KEY_HEADING = "heading";

    /** Rows the layout can show before overflowing into "+N more". */
    static final int MAX_ROWS = 5;

    private WidgetData() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    /** One task as the widget renders it. */
    static final class Task {
        final String id;        // task id; empty when the web app did not supply one
        final String title;
        final String time;      // display-ready, may be empty
        final String urgency;   // low | medium | high | urgent

        Task(String id, String title, String time, String urgency) {
            this.id = id;
            this.title = title;
            this.time = time;
            this.urgency = urgency;
        }
    }

    /**
     * Persist a snapshot. Uses commit() so the data is on disk before the widget is
     * asked to redraw.
     */
    static void save(Context context, JSONArray tasks, String generatedFor, String heading) {
        prefs(context).edit()
                .putString(KEY_TASKS, tasks != null ? tasks.toString() : "[]")
                .putString(KEY_GENERATED_FOR, generatedFor != null ? generatedFor : "")
                .putString(KEY_HEADING, heading != null ? heading : "")
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .commit();
        Log.d(TAG, "WidgetData: saved " + (tasks != null ? tasks.length() : 0)
                + " task(s) for " + generatedFor
                + (heading != null && !heading.isEmpty() ? " heading=\"" + heading + "\"" : ""));
    }

    static void clear(Context context) {
        prefs(context).edit()
                .remove(KEY_TASKS).remove(KEY_GENERATED_FOR).remove(KEY_HEADING).commit();
        Log.d(TAG, "WidgetData: cleared");
    }

    /**
     * Optional line the web app supplies above the rows — a summary such as
     * "No tasks due today." Empty string when not supplied, which is the normal case.
     */
    static String heading(Context context) {
        return prefs(context).getString(KEY_HEADING, "");
    }

    /** Raw stored tasks, newest snapshot. Never null. */
    static JSONArray rawTasks(Context context) {
        String json = prefs(context).getString(KEY_TASKS, null);
        if (json == null || json.isEmpty()) {
            return new JSONArray();
        }
        try {
            return new JSONArray(json);
        } catch (Exception e) {
            Log.w(TAG, "WidgetData: unparseable snapshot: " + e.getMessage());
            return new JSONArray();
        }
    }

    /** Parsed task at index, or null if the entry is unusable. */
    static Task taskAt(JSONArray tasks, int index) {
        JSONObject o = tasks.optJSONObject(index);
        if (o == null) {
            return null;
        }
        String title = o.optString("title", "").trim();
        if (title.isEmpty()) {
            return null;
        }
        String time = o.optString("time", "").trim();
        if ("null".equals(time)) {
            time = "";
        }
        String urgency = o.optString("urgency", "medium").trim().toLowerCase(Locale.US);
        // Optional: rows with an id deep-link to the task, rows without just open the app.
        String id = o.optString("id", "").trim();
        if ("null".equals(id)) {
            id = "";
        }
        return new Task(id, title, time, urgency);
    }

    /** The local date the stored snapshot was built for, or "" if never set. */
    static String generatedFor(Context context) {
        return prefs(context).getString(KEY_GENERATED_FOR, "");
    }

    /** True when a snapshot has ever been stored. */
    static boolean hasSnapshot(Context context) {
        return prefs(context).contains(KEY_TASKS);
    }

    /** Today's local date as yyyy-MM-dd — matches the web app's getLocalDateString(). */
    static String todayLocalDate() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** True when the stored snapshot was built for a day that has since rolled over. */
    static boolean isStale(Context context) {
        String generated = generatedFor(context);
        if (generated.isEmpty()) {
            return false; // no date supplied — treat the snapshot as current
        }
        return !generated.equals(todayLocalDate());
    }
}
