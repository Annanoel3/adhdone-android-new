package co.median.android.odxqpdy;

import android.content.Context;

/**
 * Which alarm screen this phone shows: the one from build 49 on (a big round
 * Done to tap and a wide Later bar that has to be held, Anna, Nov 16 2026), or
 * the one every build before it had (activity_alarm.xml).
 *
 * The new one is the default. It can be switched off from the server without
 * a new build: cancelTaskNotifications answers the phone's own reports (the
 * 12-hour check-in, and every choice made on an alarm) with "alarm_screen",
 * and "classic" there puts this phone back on the earlier screen from its next
 * alarm on. Anything else, or no word at all, means the new screen.
 */
final class AlarmLook {

    private static final String PREFS = "adhdone_alarm_screen";
    private static final String KEY = "screen";
    private static final String CLASSIC = "classic";

    private AlarmLook() {
    }

    static boolean useNew(Context c) {
        try {
            return !CLASSIC.equals(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, ""));
        } catch (Exception e) {
            return true;
        }
    }

    /** The server's word, read off the answer to any of the phone's reports. No word: nothing changes. */
    static void adopt(Context c, Base44Api.Result r) {
        try {
            if (c == null || r == null || !r.isSuccess() || r.body == null || !r.body.has("alarm_screen")) {
                return;
            }
            String word = r.body.optString("alarm_screen", "");
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KEY, CLASSIC.equals(word) ? CLASSIC : "").apply();
        } catch (Exception ignored) {
        }
    }
}
