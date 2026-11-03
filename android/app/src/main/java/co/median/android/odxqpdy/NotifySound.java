package co.median.android.odxqpdy;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.util.Calendar;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The sound a regular notification makes, when they picked one (Anna, Nov 1
 * 2026: "can our sounds for alarms also be an option for regular
 * notifications? Including reading it out loud?").
 *
 * The web app owns the choice (Settings, Reminders: the same list as the alarm
 * sound: a preset, their own upload, or "Read it to me") and hands it over with
 * AlarmBridge.setNotifySound. A file is downloaded once into the app's private
 * files and played from there, so it works with no signal. "speak:" means the
 * phone's own voice reads the notification (AlarmSpeech), once.
 *
 * How a push uses it (PushFilter): only a push that would make a sound anyway
 * (never a quiet copy, a held one or a restored re-delivery). It is shown on
 * this app's own channel, which pops up and vibrates but has no sound of its
 * own, and this class plays the sound (or the voice) once, at notification
 * volume. Nothing changes, and the phone's usual notification sound plays, when:
 * nothing was picked, the file isn't on the phone yet, the phone is on silent or
 * vibrate, Do Not Disturb is on, notification volume is all the way down, or,
 * for the voice only, it's inside their quiet hours (a push only lands then at
 * a time they set themselves). If the voice can't start, the phone's default
 * notification tone plays instead, so a notification is never silent by
 * mistake.
 */
final class NotifySound {

    static final String SPEAK = AlarmSpeech.URL_PREFIX;
    static final String CHANNEL_ID = "adhdone_own_sound";
    private static final String CHANNEL_NAME = "Notifications with your sound";

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_notify_sound";
    private static final String KEY_URL = "url";
    private static final String KEY_NAME = "name";
    private static final String KEY_READY_URL = "ready_url";
    private static final String KEY_QUIET_ON = "quiet_on";
    private static final String KEY_QUIET_START = "quiet_start_min";
    private static final String KEY_QUIET_END = "quiet_end_min";
    private static final String FILE_NAME = "adhdone_notify_sound";
    /** A notification sound is short: a long alarm melody stops after this. */
    private static final long MAX_PLAY_MS = 8_000L;
    /** Two pushes landing together make one sound, not two on top of each other. */
    private static final long MIN_GAP_MS = 8_000L;
    /** A very long notification is read up to about here (at a sentence end when there is one). */
    private static final int MAX_SPOKEN_CHARS = 280;

    private static final ExecutorService pool = Executors.newSingleThreadExecutor();
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static long lastPlayAt = 0L;
    private static MediaPlayer player;
    private static AlarmSpeech speech;
    private static final Runnable stopper = new Runnable() {
        @Override
        public void run() {
            stopNow();
        }
    };

    interface Callback {
        void done(String result);
    }

    private NotifySound() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File file(Context c) {
        return new File(c.getApplicationContext().getFilesDir(), FILE_NAME);
    }

    static String url(Context c) {
        return prefs(c).getString(KEY_URL, "");
    }

    static boolean speaks(Context c) {
        return url(c).startsWith(SPEAK);
    }

    /** True when the chosen sound can play now: the voice, or the file on disk for the current choice. */
    static boolean ready(Context c) {
        String u = url(c);
        if (u.isEmpty()) {
            return false;
        }
        if (u.startsWith(SPEAK)) {
            return true;
        }
        File f = file(c);
        return u.equals(prefs(c).getString(KEY_READY_URL, "")) && f.isFile() && f.length() > 0;
    }

    /** Their quiet hours (HH:MM), for the voice. Off = never quiet. */
    static void setQuiet(Context c, boolean on, String start, String end) {
        SharedPreferences.Editor ed = prefs(c).edit().putBoolean(KEY_QUIET_ON, on);
        int s = minutes(start);
        int e = minutes(end);
        if (s >= 0) {
            ed.putInt(KEY_QUIET_START, s);
        }
        if (e >= 0) {
            ed.putInt(KEY_QUIET_END, e);
        }
        ed.apply();
    }

    private static int minutes(String hhmm) {
        if (hhmm == null) {
            return -1;
        }
        try {
            String[] p = hhmm.trim().split(":");
            int h = Integer.parseInt(p[0]);
            int m = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : -1;
        } catch (Exception e) {
            return -1;
        }
    }

    static boolean inQuietHours(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean(KEY_QUIET_ON, true)) {
            return false;
        }
        int start = p.getInt(KEY_QUIET_START, 22 * 60);
        int end = p.getInt(KEY_QUIET_END, 8 * 60);
        if (start == end) {
            return false;
        }
        Calendar now = Calendar.getInstance();
        int m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        return start < end ? (m >= start && m < end) : (m >= start || m < end);
    }

    /**
     * Records a new choice and fetches a file in the background. Empty = the
     * phone's usual notification sound. Results: cleared, spoken, cached,
     * downloaded, failed.
     */
    static void set(Context c, String url, String name, final Callback cb) {
        final Context app = c.getApplicationContext();
        final String u = url == null ? "" : url.trim();
        final String n = name == null ? "" : name.trim();
        SharedPreferences p = prefs(app);
        if (u.isEmpty()) {
            p.edit().remove(KEY_URL).remove(KEY_NAME).remove(KEY_READY_URL).apply();
            //noinspection ResultOfMethodCallIgnored
            file(app).delete();
            if (cb != null) {
                cb.done("cleared");
            }
            return;
        }
        boolean changed = !u.equals(p.getString(KEY_URL, ""));
        p.edit().putString(KEY_URL, u).putString(KEY_NAME, n).apply();
        if (changed) {
            // The old file belongs to the old choice; never play the wrong sound.
            p.edit().remove(KEY_READY_URL).apply();
        }
        if (u.startsWith(SPEAK)) {
            //noinspection ResultOfMethodCallIgnored
            file(app).delete();
            p.edit().putString(KEY_READY_URL, u).apply();
            if (cb != null) {
                cb.done("spoken");
            }
            return;
        }
        if (ready(app)) {
            if (cb != null) {
                cb.done("cached");
            }
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = AlarmSound.downloadTo(u, file(app), new File(app.getFilesDir(), FILE_NAME + ".part"));
                // Only mark ready if the choice has not changed while fetching.
                if (ok && u.equals(url(app))) {
                    prefs(app).edit().putString(KEY_READY_URL, u).apply();
                }
                if (cb != null) {
                    cb.done(ok ? "downloaded" : "failed");
                }
            }
        });
    }

    /** Should this push be shown on the app's own silent channel, with this class playing the sound? */
    static boolean takesOver(Context c) {
        try {
            if (url(c).isEmpty() || !ready(c)) {
                return false;
            }
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            // Silent or vibrate: the phone does what it always does.
            if (am == null || am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) {
                return false;
            }
            if (am.getStreamVolume(AudioManager.STREAM_NOTIFICATION) <= 0) {
                return false;
            }
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            // Do Not Disturb: left to the phone.
            if (nm != null && nm.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) {
                return false;
            }
            // Never read out loud inside quiet hours.
            if (speaks(c) && inQuietHours(c)) {
                return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Puts this notification on the app's own channel: it pops up and vibrates, and makes no sound of its own. */
    static NotificationCompat.Builder useOwnChannel(Context c, NotificationCompat.Builder b) {
        try {
            ensureChannel(c);
            b.setChannelId(CHANNEL_ID);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                b.setSound(null);
                b.setDefaults(NotificationCompat.DEFAULT_VIBRATE | NotificationCompat.DEFAULT_LIGHTS);
                b.setPriority(NotificationCompat.PRIORITY_HIGH);
            }
        } catch (Exception e) {
            Log.w(TAG, "NotifySound: could not use its own channel", e);
        }
        return b;
    }

    private static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Notifications that play the sound you picked in ADHDone, or read themselves out loud. ADHDone plays the sound, so this channel has none of its own.");
        ch.setSound(null, null);
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    /** Plays the chosen sound (or reads the notification) once. Never throws. */
    static void play(Context c, final String title, final String body) {
        final Context app = c.getApplicationContext();
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    long now = System.currentTimeMillis();
                    if (now - lastPlayAt < MIN_GAP_MS) {
                        return;
                    }
                    lastPlayAt = now;
                    stopNow();
                    if (speaks(app)) {
                        speak(app, title, body);
                    } else {
                        playFile(app);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "NotifySound: could not play, using the default tone", e);
                    playDefault(app);
                }
            }
        });
    }

    /** What the voice reads: the body (it names the task in a full sentence), led by the title when the body doesn't say it. */
    static String wordsFor(String title, String body) {
        String t = AlarmSpeech.clean(title);
        String b = AlarmSpeech.clean(body);
        String w;
        if (b.isEmpty()) {
            w = t;
        } else if (t.isEmpty() || b.toLowerCase().contains(t.toLowerCase())) {
            w = b;
        } else {
            w = t + ". " + b;
        }
        if (w.length() > MAX_SPOKEN_CHARS) {
            int cut = w.lastIndexOf(". ", MAX_SPOKEN_CHARS);
            w = cut > 40 ? w.substring(0, cut + 1) : w.substring(0, MAX_SPOKEN_CHARS);
        }
        return w;
    }

    private static void speak(final Context app, String title, String body) {
        final AlarmSpeech s = new AlarmSpeech(app);
        speech = s;
        s.start(wordsFor(title, body), false, AudioAttributes.USAGE_NOTIFICATION, new AlarmSpeech.Listener() {
            @Override
            public void finished(boolean spoke) {
                if (speech == s) {
                    speech = null;
                }
                if (!spoke) {
                    // No voice on this phone (no speech engine or voice data): the usual tone.
                    playDefault(app);
                }
            }
        });
    }

    private static void playFile(final Context app) {
        File f = file(app);
        if (!f.isFile() || f.length() == 0) {
            playDefault(app);
            return;
        }
        final MediaPlayer mp = new MediaPlayer();
        try {
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setDataSource(app, Uri.fromFile(f));
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer m) {
                    stopNow();
                }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer m, int what, int extra) {
                    stopNow();
                    playDefault(app);
                    return true;
                }
            });
            mp.prepare();
            player = mp;
            mp.start();
            main.removeCallbacks(stopper);
            main.postDelayed(stopper, MAX_PLAY_MS);
        } catch (Exception e) {
            Log.w(TAG, "NotifySound: could not play the file, using the default tone", e);
            try {
                mp.release();
            } catch (Exception ignored) {
            }
            if (player == mp) {
                player = null;
            }
            playDefault(app);
        }
    }

    private static void playDefault(Context app) {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone r = uri != null ? RingtoneManager.getRingtone(app, uri) : null;
            if (r != null) {
                r.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                r.play();
            }
        } catch (Exception e) {
            Log.w(TAG, "NotifySound: default tone failed too", e);
        }
    }

    private static void stopNow() {
        main.removeCallbacks(stopper);
        MediaPlayer mp = player;
        player = null;
        if (mp != null) {
            try {
                mp.stop();
            } catch (Exception ignored) {
            }
            try {
                mp.release();
            } catch (Exception ignored) {
            }
        }
        AlarmSpeech s = speech;
        speech = null;
        if (s != null) {
            try {
                s.stop();
            } catch (Exception ignored) {
            }
        }
    }
}
