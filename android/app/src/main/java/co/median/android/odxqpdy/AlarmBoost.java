package co.median.android.odxqpdy;

import android.media.audiofx.LoudnessEnhancer;
import android.util.Log;

/**
 * Android's loudness booster, put on whatever a real alarm plays — the tone
 * (AlarmService / AlarmActivity's MediaPlayer) and the spoken alarm
 * (AlarmSpeech) alike. Alarm volume on its own was coming out quiet even at
 * the phone's maximum (Anna, Oct 1 2026): this adds gain on top of it. The
 * booster limits peaks, so it gets louder without crackling.
 */
final class AlarmBoost {

    private static final String TAG = "ADHDone";
    /** Millibels: 1000 = +10 dB, roughly twice as loud to the ear. */
    static final int GAIN_MB = 1000;

    private AlarmBoost() {
    }

    /** The booster on this audio session, enabled — or null if this phone has none. */
    static LoudnessEnhancer attach(int sessionId, String what) {
        if (sessionId == 0) {
            return null;
        }
        try {
            LoudnessEnhancer b = new LoudnessEnhancer(sessionId);
            b.setTargetGain(GAIN_MB);
            b.setEnabled(true);
            Log.d(TAG, "AlarmBoost: +" + (GAIN_MB / 100) + " dB on " + what + " (session " + sessionId + ")");
            return b;
        } catch (Exception e) {
            Log.w(TAG, "AlarmBoost: unavailable for " + what + ": " + e.getMessage());
            return null;
        }
    }

    static void release(LoudnessEnhancer b) {
        if (b == null) {
            return;
        }
        try {
            b.setEnabled(false);
        } catch (Exception ignored) {
        }
        try {
            b.release();
        } catch (Exception ignored) {
        }
    }
}
