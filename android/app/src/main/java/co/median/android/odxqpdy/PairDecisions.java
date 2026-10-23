package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Two alarms for different tasks within a couple of minutes of each other: one
 * alarm that names both, or the second waits 10 minutes and rings on its own
 * (Anna, Oct 10 2026: combine when they "would go well together", not when
 * they're "super different"). The server's AI makes the call
 * (cancelTaskNotifications mode "pair"); the answer is kept here so a ring
 * never waits on the network. With no answer yet: the same family (the same
 * chore, by the server's label) goes together, anything else waits its turn.
 */
final class PairDecisions {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_pair_decisions";
    /**
     * Closer together than this counts as "the same moment" (the same 10
     * minutes the app's own folding used before, Oct 8 2026).
     */
    static final long WINDOW_MS = 10L * 60L * 1000L;
    private static final long KEEP_MS = 30L * 24L * 60L * 60L * 1000L;

    private PairDecisions() {
    }

    private static String key(String a, String b) {
        return a.compareTo(b) <= 0 ? a + "|" + b : b + "|" + a;
    }

    /** The AI's answer for these two tasks, or null when it hasn't been asked. */
    static Boolean cached(Context c, String taskA, String taskB) {
        if (taskA == null || taskB == null || taskA.isEmpty() || taskB.isEmpty()) {
            return null;
        }
        SharedPreferences p = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String v = p.getString(key(taskA, taskB), null);
        if (v == null) {
            return null;
        }
        return v.startsWith("1");
    }

    /** One ring for both? */
    static boolean together(Context c, AlarmStore.Entry a, AlarmStore.Entry b) {
        if (a == null || b == null || a.taskId.isEmpty() || b.taskId.isEmpty()) {
            return false;
        }
        Boolean known = cached(c, a.taskId, b.taskId);
        if (known != null) {
            return known;
        }
        return !a.family.isEmpty() && a.family.equals(b.family);
    }

    private static void store(Context c, String taskA, String taskB, boolean together) {
        SharedPreferences p = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        SharedPreferences.Editor ed = p.edit();
        for (java.util.Map.Entry<String, ?> kv : p.getAll().entrySet()) {
            Object v = kv.getValue();
            String s = v instanceof String ? (String) v : "";
            int bar = s.indexOf(':');
            long at = 0L;
            try {
                at = bar > 0 ? Long.parseLong(s.substring(bar + 1)) : 0L;
            } catch (Exception ignored) {
            }
            if (now - at > KEEP_MS) {
                ed.remove(kv.getKey());
            }
        }
        ed.putString(key(taskA, taskB), (together ? "1" : "0") + ":" + now).apply();
    }

    /**
     * Ask the server about these pairs (task ids) and keep the answers. Runs on
     * the calling thread: never call it from the main thread.
     */
    static void ask(Context c, List<String[]> pairs, int timeoutMs) {
        if (pairs == null || pairs.isEmpty()) {
            return;
        }
        try {
            JSONArray arr = new JSONArray();
            for (String[] p : pairs) {
                JSONObject o = new JSONObject();
                o.put("id", key(p[0], p[1]));
                o.put("a", p[0]);
                o.put("b", p[1]);
                arr.put(o);
            }
            JSONObject body = new JSONObject();
            body.put("mode", "pair");
            body.put("pairs", arr);
            Base44Api.Result r = Base44Api.phoneReport(c, body, timeoutMs);
            if (!r.isSuccess() || r.body == null) {
                Log.w(TAG, "PairDecisions: no answer (" + r.code + "), the same-family rule stands in");
                return;
            }
            JSONObject answers = r.body.optJSONObject("answers");
            if (answers == null) {
                return;
            }
            for (String[] p : pairs) {
                JSONObject a = answers.optJSONObject(key(p[0], p[1]));
                if (a != null && a.has("together")) {
                    store(c, p[0], p[1], a.optBoolean("together", false));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "PairDecisions: could not ask", e);
        }
    }

    /**
     * Find upcoming alarms for different tasks within WINDOW_MS of each other
     * that have no answer yet, and ask about them in the background. Called
     * after the alarm list changes and after a snooze.
     */
    static void prepareAsync(final Context ctx) {
        final Context c = ctx.getApplicationContext();
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                prepare(c);
            }
        }, "adhdone-pairs");
        t.setDaemon(true);
        t.start();
    }

    private static void prepare(Context c) {
        long now = System.currentTimeMillis();
        List<AlarmStore.Entry> list = new ArrayList<>();
        for (AlarmStore.Entry e : AlarmStore.load(c)) {
            if (!e.done && e.at > now - 60_000L && !e.taskId.isEmpty()
                    && !e.id.startsWith(AlarmScheduler.TIMER_ALARM_PREFIX)) {
                list.add(e);
            }
        }
        List<String[]> ask = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < list.size(); i++) {
            for (int j = i + 1; j < list.size(); j++) {
                AlarmStore.Entry a = list.get(i);
                AlarmStore.Entry b = list.get(j);
                if (a.taskId.equals(b.taskId) || Math.abs(a.at - b.at) > WINDOW_MS) {
                    continue;
                }
                String k = key(a.taskId, b.taskId);
                if (seen.contains(k) || cached(c, a.taskId, b.taskId) != null) {
                    continue;
                }
                seen.add(k);
                ask.add(new String[] { a.taskId, b.taskId });
            }
        }
        if (!ask.isEmpty()) {
            ask(c, ask.size() > 20 ? ask.subList(0, 20) : ask, 30000);
        }
    }
}
