package co.median.android.odxqpdy;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Only vibrate when my phone is on silent, vibrate or Do Not Disturb."
 *
 * The person answers yes or no the first time they set up alarms (and can
 * change it in Settings); the web app hands the answer over through
 * AlarmBridge.setQuietVibrate. The phone's state is read at the moment an
 * alarm goes off: when the choice is on and the ringer is on silent or
 * vibrate, or Do Not Disturb is on, the alarm vibrates and shows on screen
 * with no sound. Off (the default, and anyone who never answered) rings out
 * loud as before. Reading the ringer mode and the interruption filter needs
 * no permission.
 *
 * Which of those counts is the person's choice too (AlarmBridge.setQuietWhen,
 * from 1.3.11): "silent" = only when the ringer is on silent or vibrate,
 * "dnd" = only when Do Not Disturb is on, "both" = either one. "both" is the
 * default, and it is what a yes meant before the choice existed.
 *
 * Also "Silent alarms during events": when that is on and an event on the
 * person's calendar is happening right now, the ring vibrates and shows with
 * no sound, whatever the phone is set to. The web app hands over the choice
 * (AlarmBridge.setEventQuiet) and the upcoming events as start/end times
 * (AlarmBridge.setEventWindows); an event with no end time comes over as one
 * hour long.
 */
final class AlarmQuiet {

    private static final String PREFS = "adhdone_alarm_quiet";
    private static final String KEY_ON = "vibrate_when_quiet";
    private static final String KEY_EVENTS_ON = "quiet_during_events";
    private static final String KEY_EVENT_WINDOWS = "event_windows";
    private static final String KEY_WHEN = "vibrate_when";

    static final String WHEN_SILENT = "silent";
    static final String WHEN_DND = "dnd";
    static final String WHEN_BOTH = "both";

    private AlarmQuiet() {
    }

    static void set(Context c, boolean on) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON, on).apply();
    }

    static boolean enabled(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.getBoolean(KEY_ON, false);
    }

    /** Which quiet counts: silent/vibrate only, Do Not Disturb only, or both. */
    static void setWhen(Context c, String when) {
        String w = WHEN_SILENT.equals(when) || WHEN_DND.equals(when) ? when : WHEN_BOTH;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_WHEN, w).apply();
    }

    static String when(Context c) {
        String w = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_WHEN, WHEN_BOTH);
        return WHEN_SILENT.equals(w) || WHEN_DND.equals(w) ? w : WHEN_BOTH;
    }

    /** The ringer is on silent or vibrate. */
    static boolean ringerQuiet(Context c) {
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            return am != null && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Do Not Disturb is on, in any form. */
    static boolean dndOn(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false;
        }
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) {
                return false;
            }
            int f = nm.getCurrentInterruptionFilter();
            return f != NotificationManager.INTERRUPTION_FILTER_ALL
                    && f != NotificationManager.INTERRUPTION_FILTER_UNKNOWN;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Silent or vibrate ringer, or Do Not Disturb in any form. */
    static boolean phoneIsQuiet(Context c) {
        return ringerQuiet(c) || dndOn(c);
    }

    /** The kind of quiet the person picked is on right now. */
    static boolean chosenQuietNow(Context c) {
        String w = when(c);
        if (WHEN_SILENT.equals(w)) {
            return ringerQuiet(c);
        }
        if (WHEN_DND.equals(w)) {
            return dndOn(c);
        }
        return phoneIsQuiet(c);
    }

    static void setEventQuiet(Context c, boolean on) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_EVENTS_ON, on).apply();
    }

    /** Upcoming events as a JSON array of {start, end} epoch milliseconds. */
    static void setEventWindows(Context c, JSONArray windows) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_EVENT_WINDOWS, windows != null ? windows.toString() : "[]").apply();
    }

    /** "Silent alarms during events" is on and an event is happening right now. */
    static boolean inQuietEvent(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean(KEY_EVENTS_ON, false)) {
            return false;
        }
        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(p.getString(KEY_EVENT_WINDOWS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject w = arr.optJSONObject(i);
                if (w == null) {
                    continue;
                }
                long start = w.optLong("start", 0L);
                long end = w.optLong("end", 0L);
                if (start > 0 && end > start && now >= start && now < end) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /** True when this ring should vibrate and show, but make no sound. */
    static boolean vibrateOnly(Context c) {
        return (enabled(c) && chosenQuietNow(c)) || inQuietEvent(c);
    }
}
