package co.median.android.odxqpdy;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Process;
import android.util.Log;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * "Notice when I wake up" (Settings, next to quiet hours; Anna, Oct 10 2026),
 * for people who wake up at different times through the week.
 *
 * With the person's Usage access switched on, the phone looks back for the
 * first time it was unlocked each morning and tells the server, which starts
 * that day's Smart Reminders from then instead of from a set hour. Usage access
 * is used for this one thing only: the phone reads its own unlock (and screen)
 * events and never which apps were used or for how long. Reminders the person
 * set for a time ("at 8") ring at that time either way.
 *
 * Also holds the person's quiet-hours end (sent by the web app), which a second
 * Later uses as "their morning" (LaterBreak).
 */
final class WakeWatch {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_wake_watch";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_QUIET_END = "quiet_end_min";
    private static final String KEY_REPORTED_DAY = "reported_day";

    private WakeWatch() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean(KEY_ENABLED, false);
    }

    /** Their quiet hours' end, minutes after midnight (08:00 until the app says). */
    static int quietEndMinutes(Context c) {
        int v = prefs(c).getInt(KEY_QUIET_END, LaterBreak.DEFAULT_MORNING_MIN);
        return v >= 0 && v < 24 * 60 ? v : LaterBreak.DEFAULT_MORNING_MIN;
    }

    static void setQuietEnd(Context c, String hhmm) {
        if (hhmm == null) {
            return;
        }
        try {
            String[] p = hhmm.trim().split(":");
            int h = Integer.parseInt(p[0]);
            int m = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            if (h >= 0 && h < 24 && m >= 0 && m < 60) {
                prefs(c).edit().putInt(KEY_QUIET_END, h * 60 + m).apply();
            }
        } catch (Exception ignored) {
        }
    }

    /** Has the person switched on Usage access for ADHDone? */
    @SuppressWarnings("deprecation")
    static boolean hasAccess(Context c) {
        try {
            AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) {
                return false;
            }
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
            } else {
                mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    /** Turn the watch on or off (the setting in the app). */
    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean(KEY_ENABLED, on).apply();
        if (on) {
            WakeWatchWorker.schedule(c);
        } else {
            WakeWatchWorker.cancel(c);
        }
    }

    /**
     * The first unlock this morning, or 0 when there hasn't been one yet. Only
     * unlocks from the end of their quiet hours on count (Anna, Oct 12 2026: a
     * 6:46 AM look at the time, with quiet hours until 8, was reported as her
     * getting up). Nothing is sent during quiet hours anyway, so an earlier
     * real start changes nothing; they unlock again once those are over.
     */
    static long firstUnlockToday(Context c) {
        if (!hasAccess(c)) {
            return 0L;
        }
        try {
            UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) {
                return 0L;
            }
            long now = System.currentTimeMillis();
            Calendar midnight = Calendar.getInstance();
            midnight.set(Calendar.HOUR_OF_DAY, 0);
            midnight.set(Calendar.MINUTE, 0);
            midnight.set(Calendar.SECOND, 0);
            midnight.set(Calendar.MILLISECOND, 0);
            long morning = midnight.getTimeInMillis() + quietEndMinutes(c) * 60_000L;
            long from = morning;
            if (from >= now) {
                return 0L;
            }
            UsageEvents events = usm.queryEvents(from, now);
            UsageEvents.Event ev = new UsageEvents.Event();
            String mine = c.getPackageName();
            long firstUnlock = 0L;
            long firstApp = 0L;
            boolean lockScreenSeen = false;
            while (events != null && events.hasNextEvent()) {
                events.getNextEvent(ev);
                int type = ev.getEventType();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                        && (type == UsageEvents.Event.KEYGUARD_SHOWN || type == UsageEvents.Event.KEYGUARD_HIDDEN)) {
                    lockScreenSeen = true;
                    // The lock screen going away = they unlocked it (Android 9+).
                    if (type == UsageEvents.Event.KEYGUARD_HIDDEN && firstUnlock == 0L) {
                        firstUnlock = ev.getTimeStamp();
                    }
                }
                // The first app to come up (not ADHDone's own alarm screen,
                // which opens by itself).
                if (type == UsageEvents.Event.MOVE_TO_FOREGROUND && firstApp == 0L && !mine.equals(ev.getPackageName())) {
                    firstApp = ev.getTimeStamp();
                }
            }
            // With a lock screen, only unlocking it counts: pressing the power
            // button to see the time can bring an app up behind the lock screen
            // without anyone unlocking (Anna, Oct 12 2026). The first app is
            // used only on a phone with no PIN, pattern or password, or an
            // older one.
            if (firstUnlock > 0L) {
                return firstUnlock;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && (lockScreenSeen || hasSecureLock(c))) {
                return 0L;
            }
            return firstApp;
        } catch (Exception e) {
            Log.w(TAG, "WakeWatch: could not read this morning's unlocks", e);
        }
        return 0L;
    }

    /** A PIN, pattern or password on the phone (unlocking it is a real event). */
    private static boolean hasSecureLock(Context c) {
        try {
            android.app.KeyguardManager km = (android.app.KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
            return km != null && km.isDeviceSecure();
        } catch (Exception e) {
            return false;
        }
    }

    /** Tell the server about this morning's first unlock, once a day. Runs off the main thread. */
    static void checkAndReport(Context c) {
        if (!enabled(c) || !hasAccess(c)) {
            return;
        }
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        if (today.equals(prefs(c).getString(KEY_REPORTED_DAY, ""))) {
            return;
        }
        long first = firstUnlockToday(c);
        if (first <= 0L) {
            return;
        }
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject body = new JSONObject();
            body.put("mode", "woke");
            body.put("woke_at", iso.format(new Date(first)));
            Base44Api.Result r = Base44Api.phoneReport(c, body, 20000);
            if (r.isSuccess()) {
                prefs(c).edit().putString(KEY_REPORTED_DAY, today).apply();
                Log.d(TAG, "WakeWatch: told the server they were up at " + first);
            } else {
                Log.w(TAG, "WakeWatch: server not told (" + r.code + "), trying again next check");
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeWatch: could not report", e);
        }
    }
}
