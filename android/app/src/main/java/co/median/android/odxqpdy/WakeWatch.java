package co.median.android.odxqpdy;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Process;
import android.provider.AlarmClock;
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

    /** One stretch of real use that counts as being up (see firstUnlockToday). */
    private static final long AWAKE_STRETCH_MS = 2 * 60_000L;
    /** How far before quiet hours end the phone's state is read from. */
    private static final long LOOK_BEFORE_MS = 6 * 60 * 60_000L;

    /**
     * When they got up this morning, or 0 when they haven't yet: the start of
     * the first time the phone was unlocked and in real use for a while, from
     * the end of their quiet hours on.
     *
     * Nothing before quiet hours end counts (Anna, Oct 12 2026: a 6:46 AM look
     * at the time, with quiet hours until 8, was reported as her getting up).
     * Someone already up and on the phone when quiet hours end counts from
     * that end, never earlier (Anna, Nov 1 2026: "if they do anything before
     * their quiet hours, still wait for quiet hours to end at least"; the
     * server holds to the same, wakeStartMs).
     *
     * A quick look doesn't count (Anna, Nov 1 2026: "I wish that opening to
     * cancel an alarm or to check the time wouldn't count"; her own phone had
     * reported 8:01 AM that morning, a minute after her quiet hours ended).
     * The phone has to stay unlocked with the screen on for AWAKE_STRETCH_MS
     * in one go, with something other than an alarm in front: ADHDone's own
     * alarm screen and the phone's clock app don't count. Turning an alarm off
     * or checking the time takes seconds.
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
            if (morning >= now) {
                return 0L;
            }
            String mine = c.getPackageName();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                // No lock-screen or screen events before Android 9: the first
                // app other than ADHDone's alarm screen to come up, as before.
                UsageEvents events = usm.queryEvents(morning, now);
                UsageEvents.Event ev = new UsageEvents.Event();
                while (events != null && events.hasNextEvent()) {
                    events.getNextEvent(ev);
                    if (ev.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND && !mine.equals(ev.getPackageName())) {
                        return ev.getTimeStamp();
                    }
                }
                return 0L;
            }
            String alarmScreen = AlarmActivity.class.getName();
            String clock = clockPackage(c);
            UsageEvents events = usm.queryEvents(morning - LOOK_BEFORE_MS, now);
            UsageEvents.Event ev = new UsageEvents.Event();
            boolean screenOn = false;
            boolean locked = hasSecureLock(c);
            String frontPkg = null;
            String frontCls = null;
            long start = 0L;
            boolean real = false;
            while (events != null && events.hasNextEvent()) {
                events.getNextEvent(ev);
                long ts = ev.getTimeStamp();
                switch (ev.getEventType()) {
                    case UsageEvents.Event.SCREEN_INTERACTIVE:
                        screenOn = true;
                        if (!locked && start == 0L) {
                            start = ts;
                            real = isRealUse(frontPkg, frontCls, mine, alarmScreen, clock);
                        }
                        break;
                    case UsageEvents.Event.SCREEN_NON_INTERACTIVE:
                    case UsageEvents.Event.KEYGUARD_SHOWN: {
                        long up = stretchCounts(start, ts, real, morning);
                        if (up > 0L) {
                            return up;
                        }
                        start = 0L;
                        if (ev.getEventType() == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                            screenOn = false;
                        } else {
                            locked = true;
                        }
                        break;
                    }
                    case UsageEvents.Event.KEYGUARD_HIDDEN:
                        // Unlocked: the screen is on.
                        locked = false;
                        screenOn = true;
                        if (start == 0L) {
                            start = ts;
                            real = isRealUse(frontPkg, frontCls, mine, alarmScreen, clock);
                        }
                        break;
                    case UsageEvents.Event.MOVE_TO_FOREGROUND:
                        frontPkg = ev.getPackageName();
                        frontCls = ev.getClassName();
                        if (start > 0L && isRealUse(frontPkg, frontCls, mine, alarmScreen, clock)) {
                            real = true;
                        }
                        break;
                    default:
                        break;
                }
            }
            // Still unlocked and in use right now.
            if (start > 0L && screenOn && !locked) {
                return stretchCounts(start, now, real, morning);
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeWatch: could not read this morning's unlocks", e);
        }
        return 0L;
    }

    /** The stretch from start to end counts as being up: when (never before quiet hours end), or 0. */
    private static long stretchCounts(long start, long end, boolean real, long morning) {
        if (start <= 0L || !real) {
            return 0L;
        }
        long from = Math.max(start, morning);
        return end - from >= AWAKE_STRETCH_MS ? from : 0L;
    }

    /** Something other than an alarm in front: any app but ADHDone's alarm screen and the clock app. */
    private static boolean isRealUse(String pkg, String cls, String mine, String alarmScreen, String clock) {
        if (pkg == null) {
            return false;
        }
        if (mine.equals(pkg) && alarmScreen.equals(cls)) {
            return false;
        }
        return clock.isEmpty() || !clock.equals(pkg);
    }

    /** The phone's clock app (the one that shows its alarms), or "" when there isn't one clear one. */
    private static String clockPackage(Context c) {
        try {
            Intent i = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
            ResolveInfo ri = c.getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null && ri.activityInfo != null && ri.activityInfo.packageName != null
                    && !"android".equals(ri.activityInfo.packageName)) {
                return ri.activityInfo.packageName;
            }
        } catch (Exception ignored) {
        }
        return "";
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
