package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The phone's copy of the alarm set.
 *
 * The web app owns WHICH tasks get an alarm and WHEN: AlarmBridge.sync() replaces
 * the whole set every time tasks change. This class only remembers that set so
 * alarms survive a reboot, a snooze and a dismiss.
 *
 * Per entry:
 *   id         stable per task (the web app passes the task id)
 *   taskId     what to open when the alarm is dismissed
 *   title      shown on the alarm screen
 *   at         when it will ring next (moves forward on snooze)
 *   originalAt the time the web app asked for; stays put across snoozes so a later
 *              sync carrying the same time does not re-arm a snoozed or dismissed alarm
 *   done       dismissed, ignored, or already in the past when it arrived
 *   snoozes    how many times it has been snoozed
 *   dismissed  the user stopped it (Got it / back) without picking a snooze
 *   ignored    how many times it rang out with no response at all
 *   laters     how many times the user tapped Later (stopped it without a set
 *              snooze, leaving the task to its normal reminders / smart nudges)
 *   reported   the app has already been told about the counts above
 *
 * None of the counts change what the app reminds about — they are data. The
 * app drains them (AlarmBridge.drainActivity) and adds them to the task's
 * snooze / dismissed / ignored counters.
 */
final class AlarmStore {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_alarms";
    private static final String KEY = "alarms";
    /** Held for every read-change-save of the list (see AlarmScheduler.sync too). */
    static final Object LOCK = new Object();

    static final class Entry {
        String id = "";
        String taskId = "";
        String title = "";
        // The push notification's own words for this moment (its title and
        // body), so the alarm says exactly what the notification would have.
        String heading = "";
        String body = "";
        long at = 0L;
        long originalAt = 0L;
        boolean done = false;
        int snoozes = 0;
        boolean dismissed = false;
        int ignored = 0;
        int laters = 0;
        boolean reported = false;
        // Its time passed while the phone was off: it never rang and never will.
        // It must not make the push for that same moment silent (see
        // AlarmScheduler.alarmCoversNow): that push is now the only reminder.
        boolean missed = false;
        // A timer's own pick (focus timer, sprint, launchpad): rings with this
        // sound instead of the account-wide alarm sound. Empty = account sound.
        String soundUrl = "";
        // Timers have nothing to snooze: the screen and the tray offer Stop only.
        boolean noSnooze = false;
        // An event's alarm (an appointment, Bike Night): it happens whether or
        // not they tap anything, so the screen and the tray offer "Got it" only
        // — no snooze, no Done, no Later (Anna, Oct 13 2026: "this is an event.
        // Even alarms should never have all the snooze buttons, done button,
        // later etc"). Set by the web app's / server's alarm list ("event").
        boolean event = false;
        // Buttons the web app wants on the alarm screen instead of snooze, as a
        // JSON array of { label, path }: tapping one stops the ring and opens the
        // app at that path (the sprint's "Keep going" / "I'm done"). "" = none.
        String actionsJson = "";
        // For a pushed alarm with no task (the commute "leave now" push): the
        // screen the push itself wanted to open, so Got it lands there.
        String screen = "";
        // The big button's words, when the web app wants something other than
        // "Got it, open the task" (a birthday: "Send a text"). It still opens
        // the task's page, where that happens. "" = the usual words.
        String openLabel = "";
        // Which repeated thing this task is (the server's task_family): two
        // alarms of one family landing together ring as one (PairDecisions).
        String family = "";
        // Other tasks' alarms that ring together with this one (one alarm that
        // names them all), as a JSON array of { id, taskId, title }. "" = none.
        String companionsJson = "";
        // Counts already handed over (to the server's report queue, or to the
        // app's drain). The drain reports only what is above these, once.
        int sentSnoozes = 0;
        int sentIgnored = 0;
        boolean sentDismissed = false;
        int sentLaters = 0;
        // The alarm this one waited behind (rang 10 minutes after it), for the
        // "What rang" list. "" = it didn't wait.
        String queuedBehind = "";
        // Turned off only because a Later break covered it (LaterBreak). When
        // the break turns out shorter (the server's answer: a task due today
        // gets no break, Oct 11 2026), it comes back on (AlarmScheduler).
        boolean breakOff = false;
        // Rings inside the owner's quiet hours only because it is at a time
        // they set themselves (a 5 AM flight). Home or Back on it rings it again
        // in 10 minutes instead of closing it (Anna, Oct 12 2026).
        boolean throughQuiet = false;
        // At a time the person set themselves (the call "at 10:00 tomorrow"):
        // it rings at that time. It is never moved to keep 10 minutes from
        // another task's alarm, and never waits behind one (AlarmService).
        // Set by the web app's / server's alarm list ("theirTime"). Anna, Oct
        // 21 2026: her 10 AM call rang at 10:31, behind another task's alarm.
        boolean theirTime = false;

        boolean hasUnreportedActivity() {
            return snoozes > sentSnoozes || ignored > sentIgnored || (dismissed && !sentDismissed) || laters > sentLaters;
        }

        /** Task ids of the alarms ringing together with this one. */
        java.util.List<String> companionTaskIds() {
            java.util.List<String> out = new java.util.ArrayList<>();
            try {
                JSONArray arr = new JSONArray(companionsJson == null || companionsJson.isEmpty() ? "[]" : companionsJson);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.optJSONObject(i);
                    String t = o != null ? o.optString("taskId", "") : "";
                    if (!t.isEmpty() && !out.contains(t)) {
                        out.add(t);
                    }
                }
            } catch (JSONException ignored) {
            }
            return out;
        }

        /** Titles of the alarms ringing together with this one. */
        java.util.List<String> companionTitles() {
            java.util.List<String> out = new java.util.ArrayList<>();
            try {
                JSONArray arr = new JSONArray(companionsJson == null || companionsJson.isEmpty() ? "[]" : companionsJson);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.optJSONObject(i);
                    String t = o != null ? o.optString("title", "") : "";
                    if (!t.isEmpty()) {
                        out.add(t);
                    }
                }
            } catch (JSONException ignored) {
            }
            return out;
        }

        /** Add another task's alarm to this ring. */
        void addCompanion(Entry other) {
            try {
                JSONArray arr = new JSONArray(companionsJson == null || companionsJson.isEmpty() ? "[]" : companionsJson);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.optJSONObject(i);
                    if (o != null && other.taskId.equals(o.optString("taskId", ""))) {
                        return;
                    }
                }
                JSONObject o = new JSONObject();
                o.put("id", other.id);
                o.put("taskId", other.taskId);
                o.put("title", other.title);
                arr.put(o);
                companionsJson = arr.toString();
            } catch (JSONException ignored) {
            }
        }

        JSONObject toJson() throws JSONException {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("taskId", taskId);
            o.put("title", title);
            o.put("heading", heading);
            o.put("body", body);
            o.put("at", at);
            o.put("originalAt", originalAt);
            o.put("done", done);
            o.put("snoozes", snoozes);
            o.put("dismissed", dismissed);
            o.put("ignored", ignored);
            o.put("laters", laters);
            o.put("reported", reported);
            o.put("soundUrl", soundUrl);
            o.put("noSnooze", noSnooze);
            o.put("event", event);
            o.put("actionsJson", actionsJson);
            o.put("screen", screen);
            o.put("openLabel", openLabel);
            o.put("missed", missed);
            o.put("family", family);
            o.put("companions", companionsJson);
            o.put("sentSnoozes", sentSnoozes);
            o.put("sentIgnored", sentIgnored);
            o.put("sentDismissed", sentDismissed);
            o.put("sentLaters", sentLaters);
            o.put("queuedBehind", queuedBehind);
            o.put("breakOff", breakOff);
            o.put("throughQuiet", throughQuiet);
            o.put("theirTime", theirTime);
            return o;
        }

        static Entry fromJson(JSONObject o) {
            Entry e = new Entry();
            e.id = o.optString("id", "");
            e.taskId = o.optString("taskId", "");
            e.title = o.optString("title", "");
            e.heading = o.optString("heading", "");
            e.body = o.optString("body", "");
            e.at = o.optLong("at", 0L);
            e.originalAt = o.optLong("originalAt", e.at);
            e.done = o.optBoolean("done", false);
            e.snoozes = o.optInt("snoozes", 0);
            e.dismissed = o.optBoolean("dismissed", false);
            e.ignored = o.optInt("ignored", 0);
            e.laters = o.optInt("laters", 0);
            e.reported = o.optBoolean("reported", false);
            e.soundUrl = o.optString("soundUrl", "");
            e.noSnooze = o.optBoolean("noSnooze", false);
            e.event = o.optBoolean("event", false);
            e.actionsJson = o.optString("actionsJson", "");
            e.screen = o.optString("screen", "");
            e.openLabel = o.optString("openLabel", "");
            e.missed = o.optBoolean("missed", false);
            e.family = o.optString("family", "");
            e.companionsJson = o.optString("companions", "");
            // An entry saved before these existed: whatever it counted was
            // either drained already (reported) or is still to be drained.
            boolean old = !o.has("sentSnoozes");
            e.sentSnoozes = old ? (e.reported ? e.snoozes : 0) : o.optInt("sentSnoozes", 0);
            e.sentIgnored = old ? (e.reported ? e.ignored : 0) : o.optInt("sentIgnored", 0);
            e.sentDismissed = old ? (e.reported && e.dismissed) : o.optBoolean("sentDismissed", false);
            e.sentLaters = old ? (e.reported ? e.laters : 0) : o.optInt("sentLaters", 0);
            e.queuedBehind = o.optString("queuedBehind", "");
            e.breakOff = o.optBoolean("breakOff", false);
            e.throughQuiet = o.optBoolean("throughQuiet", false);
            e.theirTime = o.optBoolean("theirTime", false);
            return e;
        }
    }

    private AlarmStore() {
    }

    static List<Entry> load(Context context) {
        synchronized (LOCK) {
            return loadLocked(context);
        }
    }

    private static List<Entry> loadLocked(Context context) {
        List<Entry> out = new ArrayList<>();
        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) {
                    continue;
                }
                Entry e = Entry.fromJson(o);
                if (!e.id.isEmpty()) {
                    out.add(e);
                }
            }
        } catch (JSONException ex) {
            Log.w(TAG, "AlarmStore: stored alarms unreadable, starting empty", ex);
        }
        return out;
    }

    static void save(Context context, List<Entry> list) {
        synchronized (LOCK) {
            saveLocked(context, list);
        }
    }

    private static void saveLocked(Context context, List<Entry> list) {
        JSONArray arr = new JSONArray();
        for (Entry e : list) {
            try {
                arr.put(e.toJson());
            } catch (JSONException ex) {
                Log.w(TAG, "AlarmStore: could not serialise alarm " + e.id, ex);
            }
        }
        context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY, arr.toString())
                .apply();
    }

    static Entry find(List<Entry> list, String id) {
        if (id == null) {
            return null;
        }
        for (Entry e : list) {
            if (id.equals(e.id)) {
                return e;
            }
        }
        return null;
    }

    /** Convenience: load, look one up, return it (or null). */
    static Entry get(Context context, String id) {
        return find(load(context), id);
    }

    /** Convenience: load, replace the entry with the same id (or add it), save. */
    static void put(Context context, Entry entry) {
        synchronized (LOCK) {
            List<Entry> list = loadLocked(context);
            Entry existing = find(list, entry.id);
            if (existing != null) {
                list.remove(existing);
            }
            list.add(entry);
            saveLocked(context, list);
        }
    }

    /** Convenience: load, drop the entry with this id if present, save. */
    static void remove(Context context, String id) {
        synchronized (LOCK) {
            List<Entry> list = loadLocked(context);
            Entry existing = find(list, id);
            if (existing == null) {
                return;
            }
            list.remove(existing);
            saveLocked(context, list);
        }
    }
}
