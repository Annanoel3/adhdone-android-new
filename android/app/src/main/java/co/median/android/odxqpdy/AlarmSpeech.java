package co.median.android.odxqpdy;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import java.util.Locale;
import java.util.Set;

/**
 * The spoken alarm. Instead of a tone, the phone's own text-to-speech reads the
 * reminder out loud in a calm voice, waits a few seconds, and reads it again
 * until the alarm is answered (or rings out).
 *
 * The web app picks it like any other sound: AlarmSound's url is the sentinel
 * {@link #URL_PREFIX} ("speak:"), which is never downloaded. Anything with its
 * own sound (a timer's pick) still rings with that sound.
 *
 * Android does not label a voice's gender, so the "female" preference is a
 * best effort over voice NAMES: the ones the common engines mark as female are
 * preferred, the ones marked male are avoided, and otherwise the engine's own
 * default voice speaks. If no speech engine can start at all, the caller falls
 * back to the tone path so an alarm is never silent.
 */
final class AlarmSpeech {

    static final String URL_PREFIX = "speak:";
    private static final String TAG = "ADHDone";
    private static final long REPEAT_GAP_MS = 4_000L;
    // A touch slower than the engine's default: it is an alarm, not a race.
    private static final float RATE = 0.9f;
    private static final float PITCH = 1.0f;
    // Speech is far quieter than a tone at the same alarm volume (an engine's
    // output peaks well below full scale), and KEY_PARAM_VOLUME 1.0 is already
    // its ceiling — so a real alarm's speech is played through its own audio
    // session with the loudness booster on it (AlarmBoost, same as the tone).
    // Settings previews (USAGE_MEDIA) are left alone.

    interface Listener {
        /** Speaking is over: it finished on its own (spoke = true) or never started. */
        void finished(boolean spoke);
    }

    private final Context ctx;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    // The audio session a real alarm speaks into, and the booster on it.
    private int sessionId = 0;
    private LoudnessEnhancer booster;
    private String words = "";
    private boolean repeat;
    private boolean stopped;
    private volatile boolean spokeOnce;
    /** No voice after this long (no voice data, a stuck engine): the tone takes over. */
    private static final long START_TIMEOUT_MS = 5_000L;
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (!stopped && !spokeOnce) {
                Log.w(TAG, "AlarmSpeech: nothing spoken yet, falling back to the tone");
                fail();
            }
        }
    };
    private int utterance;
    private Listener listener;

    private final Runnable again = new Runnable() {
        @Override
        public void run() {
            if (!stopped) {
                speakOnce();
            }
        }
    };

    AlarmSpeech(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    /** True when the account-wide alarm sound is the spoken one. */
    static boolean chosen(Context c) {
        return AlarmSound.url(c).startsWith(URL_PREFIX);
    }

    /**
     * What to read for an alarm: the push's own body when it has one (it names
     * the task in a full sentence), otherwise the heading or the task title.
     */
    static String wordsFor(AlarmStore.Entry e, String fallbackTitle) {
        String body = e != null ? clean(e.body) : "";
        if (!body.isEmpty()) {
            return body;
        }
        String heading = e != null ? clean(e.heading) : "";
        if (!heading.isEmpty()) {
            return heading;
        }
        String title = e != null ? clean(e.title) : "";
        return title.isEmpty() ? clean(fallbackTitle) : title;
    }

    /**
     * Plain words for the engine. Emoji and symbols are read out by name
     * ("alarm clock", "flexed biceps"), so they go; dashes become pauses.
     */
    static String clean(String s) {
        if (s == null) {
            return "";
        }
        String t = s
                .replaceAll("[\\x{1F000}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{2B00}-\\x{2BFF}\\x{FE00}-\\x{FE0F}\\x{200D}\\x{20E3}]", " ")
                .replaceAll("[\\p{So}]", " ")
                .replace("—", ", ")
                .replace("–", ", ")
                .replace("\"", "")
                .replaceAll("\\s+", " ")
                .replaceAll("\\s+,", ",")
                .trim();
        return t;
    }

    /**
     * Starts speaking. repeat = keep reading it every few seconds until stop().
     * usage = AudioAttributes.USAGE_ALARM for a real alarm (alarm volume, plays
     * through silent mode), USAGE_MEDIA for a preview in Settings.
     */
    void start(String text, boolean repeat, final int usage, Listener listener) {
        this.words = text == null ? "" : text.trim();
        this.repeat = repeat;
        this.listener = listener;
        this.stopped = false;
        this.spokeOnce = false;
        if (words.isEmpty()) {
            words = "Time for this.";
        }
        handler.removeCallbacks(watchdog);
        handler.postDelayed(watchdog, START_TIMEOUT_MS);
        try {
            tts = new TextToSpeech(ctx, new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(final int status) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (stopped) {
                                return;
                            }
                            if (status != TextToSpeech.SUCCESS || tts == null) {
                                Log.w(TAG, "AlarmSpeech: no speech engine (status " + status + ")");
                                fail();
                                return;
                            }
                            configure(usage);
                            speakOnce();
                        }
                    });
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "AlarmSpeech: could not start the speech engine", e);
            fail();
        }
    }

    private void fail() {
        Listener l = listener;
        stop();
        if (l != null) {
            l.finished(false);
        }
    }

    private void configure(int usage) {
        try {
            int lang = tts.setLanguage(Locale.getDefault());
            if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.US);
            }
        } catch (Exception ignored) {
        }
        try {
            tts.setSpeechRate(RATE);
            tts.setPitch(PITCH);
        } catch (Exception ignored) {
        }
        try {
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(usage)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
        } catch (Exception ignored) {
        }
        setUpBoost(usage);
        Voice v = pickVoice();
        if (v != null) {
            try {
                tts.setVoice(v);
                Log.d(TAG, "AlarmSpeech: voice " + v.getName());
            } catch (Exception ignored) {
            }
        }
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                spokeOnce = true;
            }

            @Override
            public void onDone(String utteranceId) {
                afterUtterance();
            }

            @Override
            public void onError(String utteranceId) {
                if (!spokeOnce) {
                    // It never spoke (missing voice data): don't keep retrying in
                    // silence — let the tone ring instead.
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (!stopped) {
                                fail();
                            }
                        }
                    });
                    return;
                }
                afterUtterance();
            }
        });
    }

    private void afterUtterance() {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (stopped) {
                    return;
                }
                if (repeat) {
                    handler.removeCallbacks(again);
                    handler.postDelayed(again, REPEAT_GAP_MS);
                } else {
                    Listener l = listener;
                    boolean ok = spokeOnce;
                    stop();
                    if (l != null) {
                        l.finished(ok);
                    }
                }
            }
        });
    }

    /**
     * Best-effort "calm female voice". Names are the only hint Android gives:
     * Samsung marks its voices SMTf / SMTm, Google's local variants carry the
     * word or a known letter code. Network-only voices are skipped so an alarm
     * never depends on a signal.
     */
    private Voice pickVoice() {
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) {
                return null;
            }
            Locale want = Locale.getDefault();
            Voice best = null;
            int bestScore = Integer.MIN_VALUE;
            for (Voice v : voices) {
                if (v == null || v.getLocale() == null) {
                    continue;
                }
                if (v.isNetworkConnectionRequired()) {
                    continue;
                }
                if (!v.getLocale().getLanguage().equals(want.getLanguage())) {
                    continue;
                }
                String n = v.getName() == null ? "" : v.getName().toLowerCase(Locale.ROOT);
                int score = 0;
                if (v.getLocale().getCountry().equals(want.getCountry())) {
                    score += 3;
                }
                if (n.contains("female") || n.contains("smtf")) {
                    score += 20;
                } else if (n.contains("male") || n.contains("smtm")) {
                    score -= 20;
                } else if (n.matches(".*-x-(tpf|iog|sfg|afh)-.*")) {
                    score += 12; // Google TTS voices known to be female
                } else if (n.matches(".*-x-(tpd|iom|iol|tpc)-.*")) {
                    score -= 12; // ...and known to be male
                }
                score += v.getQuality() / 100;
                if (score > bestScore) {
                    bestScore = score;
                    best = v;
                }
            }
            // Below zero means the only voices we could tell apart were male:
            // let the engine's own default speak rather than force one.
            return bestScore >= 0 ? best : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** A real alarm speaks into its own session with the loudness booster on it. */
    private void setUpBoost(int usage) {
        releaseBoost();
        if (usage != AudioAttributes.USAGE_ALARM) {
            return;
        }
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                return;
            }
            sessionId = am.generateAudioSessionId();
            booster = AlarmBoost.attach(sessionId, "spoken alarm");
        } catch (Exception e) {
            // No booster on this phone: the speech still plays, just unboosted.
            Log.w(TAG, "AlarmSpeech: loudness boost unavailable: " + e.getMessage());
            releaseBoost();
        }
    }

    private void releaseBoost() {
        LoudnessEnhancer b = booster;
        booster = null;
        sessionId = 0;
        AlarmBoost.release(b);
    }

    private void speakOnce() {
        if (tts == null || stopped) {
            return;
        }
        try {
            Bundle params = new Bundle();
            if (sessionId != 0) {
                params.putInt(TextToSpeech.Engine.KEY_PARAM_SESSION_ID, sessionId);
            }
            // For engines that ignore audio attributes and only honour a stream.
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM,
                    repeat ? AudioManager.STREAM_ALARM : AudioManager.STREAM_MUSIC);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            int r = tts.speak(words, TextToSpeech.QUEUE_FLUSH, params, "adhdone_speech_" + (utterance++));
            if (r != TextToSpeech.SUCCESS) {
                Log.w(TAG, "AlarmSpeech: speak() refused (" + r + ")");
                if (!spokeOnce) {
                    fail();
                } else {
                    afterUtterance();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "AlarmSpeech: speak failed", e);
            if (!spokeOnce) {
                fail();
            }
        }
    }

    /** Stops speaking and releases the engine. Safe to call more than once. */
    void stop() {
        stopped = true;
        listener = null;
        handler.removeCallbacks(again);
        handler.removeCallbacks(watchdog);
        TextToSpeech t = tts;
        tts = null;
        if (t != null) {
            try {
                t.stop();
            } catch (Exception ignored) {
            }
            try {
                t.shutdown();
            } catch (Exception ignored) {
            }
        }
        releaseBoost();
    }
}
